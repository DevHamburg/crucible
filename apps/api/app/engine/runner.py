"""Benchmark run orchestrator.

Design notes:
  * Model calls (the slow, I/O-bound part) run CONCURRENTLY under a semaphore.
  * DB writes happen SEQUENTIALLY in the main loop as tasks complete — this keeps SQLite
    lock-free and the `Run` counters consistent without cross-task contention.
  * A hard USD budget guard cancels remaining work if a run gets too expensive.
"""
from __future__ import annotations

import asyncio
from dataclasses import dataclass, field
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.core.security import decrypt_secret
from app.engine.events import bus
from app.models import ApiKey, Benchmark, BenchmarkItem, Generation, ModelCatalog, Result, Run
from app.observability.cost import compute_cost, price_for
from app.providers.registry import ModelRef, call_model
from app.scoring import get_scorer
from app.scoring.base import ScoringContext, as_messages

_SIM_MODE = {
    "multiple_choice": "mcq",
    "numeric": "numeric",
    "numeric_match": "numeric",
    "math_equal": "numeric",
    "code_exec": "code",
    "llm_judge": "open",
    "rubric": "open",
    "g_eval": "open",
    "keyword_overlap": "open",
}


@dataclass
class ModelInfo:
    ref: str
    input_price: float
    output_price: float
    meta: dict = field(default_factory=dict)


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


async def _load_user_keys(session, user_id: str | None) -> dict[str, str]:
    if not user_id:
        return {}
    rows = (await session.scalars(select(ApiKey).where(ApiKey.user_id == user_id))).all()
    keys: dict[str, str] = {}
    for k in rows:
        try:
            keys.setdefault(k.provider, decrypt_secret(k.encrypted_key))
        except Exception:  # noqa: BLE001 — a corrupt key shouldn't kill the run
            continue
    return keys


async def _load_models(session, refs: list[str]) -> dict[str, ModelInfo]:
    out: dict[str, ModelInfo] = {}
    rows = (await session.scalars(select(ModelCatalog).where(ModelCatalog.ref.in_(refs)))).all()
    by_ref = {r.ref: r for r in rows}
    for ref in refs:
        row = by_ref.get(ref)
        ip, op, _ = price_for(ref)
        if row:
            out[ref] = ModelInfo(ref, row.input_price or ip, row.output_price or op, row.meta or {})
        else:
            out[ref] = ModelInfo(ref, ip, op, {})
    return out


def build_simulation(item: dict, benchmark: dict, minfo: ModelInfo) -> dict:
    st = benchmark["scoring_type"]
    return {
        "mode": _SIM_MODE.get(st, "exact"),
        "reference": dict(item.get("reference") or {}),
        "choices": (item.get("input") or {}).get("choices"),
        "skill": float(minfo.meta.get("skill", 0.6)),
        "safety": float(minfo.meta.get("safety", 0.85)),
        "scoring_type": st,
    }


@dataclass
class ItemOutcome:
    model_ref: str
    benchmark: dict
    item: dict
    response: str
    prompt_tokens: int
    completion_tokens: int
    latency_ms: int
    cost: float
    error: str
    score: float
    passed: bool
    rationale: str
    judge_model: str
    needs_review: bool
    raw: dict


async def run_one(
    minfo: ModelInfo,
    benchmark: dict,
    item: dict,
    params: dict,
    user_keys: dict[str, str],
) -> ItemOutcome:
    ref = minfo.ref
    provider = ModelRef.parse(ref).provider
    extra: dict = {}
    if provider == "mock":
        extra["simulation"] = build_simulation(item, benchmark, minfo)

    comp = await call_model(
        ref,
        as_messages(item),
        user_keys=user_keys,
        temperature=float(params.get("temperature", 0.2)),
        max_tokens=int(params.get("max_tokens", 1024)),
        extra=extra,
    )
    gen_cost = compute_cost(comp.prompt_tokens, comp.completion_tokens, minfo.input_price, minfo.output_price)

    # --- score ---
    scoring_type = benchmark["scoring_type"]
    scorer = get_scorer(scoring_type) or get_scorer("keyword_overlap")
    ctx = ScoringContext(
        judge_model=params.get("judge_model") or settings.judge_model,
        user_keys=user_keys,
        benchmark=benchmark,
        item=item,
    )
    if comp.ok and comp.text:
        sr = await scorer(comp.text, item.get("reference") or {}, benchmark.get("config") or {}, ctx)
    else:
        from app.scoring.base import ScoreResult

        sr = ScoreResult(0.0, False, comp.error or "empty response")

    return ItemOutcome(
        model_ref=ref,
        benchmark=benchmark,
        item=item,
        response=comp.text,
        prompt_tokens=comp.prompt_tokens,
        completion_tokens=comp.completion_tokens,
        latency_ms=comp.latency_ms,
        cost=round(gen_cost + ctx.judge_cost, 6),
        error=comp.error or "",
        score=sr.score,
        passed=sr.passed,
        rationale=sr.rationale,
        judge_model=ctx.judge_model if scoring_type in ("llm_judge", "rubric", "g_eval") else "",
        needs_review=sr.needs_review,
        raw=sr.raw,
    )


async def _load_worklist(session, config: dict):
    slugs = config.get("benchmarks", [])
    limit = int(config.get("limit", 10))
    benches = (await session.scalars(select(Benchmark).where(Benchmark.slug.in_(slugs)))).all()
    worklist = []
    bench_meta = {}
    for b in benches:
        bmeta = {
            "id": b.id,
            "slug": b.slug,
            "name": b.name,
            "domain": b.domain,
            "task_type": b.task_type,
            "scoring_type": b.scoring_type,
            "config": b.config or {},
        }
        bench_meta[b.slug] = bmeta
        items = (
            await session.scalars(
                select(BenchmarkItem).where(BenchmarkItem.benchmark_id == b.id).limit(limit)
            )
        ).all()
        for it in items:
            idict = {
                "id": it.id,
                "prompt": it.prompt,
                "input": it.input or {},
                "reference": it.reference or {},
                "difficulty": it.difficulty,
                "meta": it.meta or {},
            }
            for ref in config.get("models", []):
                worklist.append((ref, bmeta, idict))
    return worklist


async def execute_run(run_id: str) -> None:
    """Entry point used by both the in-process runner and the arq worker."""
    async with SessionLocal() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return
        if run.kind == "safety":
            from app.safety.runner import execute_safety_run

            return await execute_safety_run(run_id)

        config = run.config or {}
        user_keys = await _load_user_keys(session, run.user_id)
        minfos = await _load_models(session, config.get("models", []))
        worklist = await _load_worklist(session, config)

        run.status = "running"
        run.started_at = utcnow()
        run.total_items = len(worklist)
        run.done_items = 0
        await session.commit()

    budget = float((config.get("budget") or settings.global_run_budget_usd))
    concurrency = int(config.get("concurrency") or settings.max_concurrency)
    params = {
        "temperature": config.get("temperature", 0.2),
        "max_tokens": config.get("max_tokens", 1024),
        "judge_model": config.get("judge_model") or settings.judge_model,
    }
    await bus.publish(
        run_id, {"type": "run_started", "run_id": run_id, "total": len(worklist)}
    )

    sem = asyncio.Semaphore(concurrency)

    async def bounded(ref, bmeta, item):
        async with sem:
            return await run_one(minfos[ref], bmeta, item, params, user_keys)

    tasks = [asyncio.create_task(bounded(ref, bmeta, item)) for ref, bmeta, item in worklist]

    done = 0
    total_cost = 0.0
    stopped = False
    try:
        for fut in asyncio.as_completed(tasks):
            outcome: ItemOutcome = await fut
            done += 1
            total_cost += outcome.cost
            async with SessionLocal() as s:
                s.add(
                    Generation(
                        run_id=run_id,
                        model_ref=outcome.model_ref,
                        provider=ModelRef.parse(outcome.model_ref).provider,
                        kind="benchmark",
                        request={"prompt": outcome.item["prompt"][:2000]},
                        response_text=outcome.response[:8000],
                        prompt_tokens=outcome.prompt_tokens,
                        completion_tokens=outcome.completion_tokens,
                        latency_ms=outcome.latency_ms,
                        cost=outcome.cost,
                        status="error" if outcome.error else "ok",
                        error=outcome.error,
                    )
                )
                s.add(
                    Result(
                        run_id=run_id,
                        benchmark_id=outcome.benchmark["id"],
                        benchmark_slug=outcome.benchmark["slug"],
                        domain=outcome.benchmark["domain"],
                        item_id=outcome.item["id"],
                        model_ref=outcome.model_ref,
                        prompt=outcome.item["prompt"][:4000],
                        response=outcome.response[:8000],
                        score=outcome.score,
                        passed=outcome.passed,
                        latency_ms=outcome.latency_ms,
                        cost=outcome.cost,
                        judge_model=outcome.judge_model,
                        rationale=outcome.rationale[:2000],
                        raw=outcome.raw,
                        needs_review=outcome.needs_review,
                    )
                )
                run = await s.get(Run, run_id)
                run.done_items = done
                run.total_cost = round(total_cost, 6)
                run.progress = round(done / max(len(worklist), 1), 4)
                await s.commit()

            await bus.publish(
                run_id,
                {
                    "type": "item_done",
                    "run_id": run_id,
                    "done": done,
                    "total": len(worklist),
                    "progress": round(done / max(len(worklist), 1), 4),
                    "model_ref": outcome.model_ref,
                    "benchmark": outcome.benchmark["slug"],
                    "domain": outcome.benchmark["domain"],
                    "score": outcome.score,
                    "passed": outcome.passed,
                    "latency_ms": outcome.latency_ms,
                    "cost": round(total_cost, 4),
                },
            )

            if total_cost > budget and not stopped:
                stopped = True
                for t in tasks:
                    t.cancel()
                break
    except asyncio.CancelledError:
        pass

    async with SessionLocal() as s:
        run = await s.get(Run, run_id)
        run.status = "completed"
        run.finished_at = utcnow()
        run.progress = round(done / max(len(worklist), 1), 4)
        if stopped:
            run.error = f"stopped: budget ${budget} exceeded (${total_cost:.4f})"
        await s.commit()

    await bus.publish(
        run_id,
        {
            "type": "run_completed",
            "run_id": run_id,
            "done": done,
            "total": len(worklist),
            "total_cost": round(total_cost, 4),
            "stopped": stopped,
        },
    )
