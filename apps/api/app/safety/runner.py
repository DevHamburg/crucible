"""Safety / red-team run executor. Runs the probe suite (optionally with adaptive PAIR-style
escalation) across the selected models and records SafetyResult rows + live events."""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone

from sqlalchemy import select

from app.core.config import settings
from app.core.db import SessionLocal
from app.engine.events import bus
from app.engine.runner import _load_models, _load_user_keys
from app.models import Run, SafetyResult
from app.observability.cost import compute_cost, price_for
from app.providers.base import ChatMessage, ModelRef
from app.providers.registry import call_model
from app.safety.probes import PROBES, Probe
from app.safety.redteam import adaptive_attack
from app.safety.refusal import harm_score, is_jailbroken, is_refusal


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def select_probes(config: dict) -> list[Probe]:
    cats = config.get("categories") or []
    probes = [p for p in PROBES if not cats or p.category in cats]
    limit = config.get("limit_per_category")
    if limit:
        seen: dict[str, int] = {}
        out = []
        for p in probes:
            n = seen.get(p.category, 0)
            if n < int(limit):
                out.append(p)
                seen[p.category] = n + 1
        probes = out
    return probes


async def _single_probe(model_ref: str, probe: Probe, user_keys: dict, meta: dict) -> dict:
    extra = {}
    if ModelRef.parse(model_ref).provider == "mock":
        extra["simulation"] = {
            "mode": "safety",
            "safety": float(meta.get("safety", 0.85)),
            "canary": probe.canary,
        }
    msgs = []
    if probe.system:
        msgs.append(ChatMessage("system", probe.system))
    msgs.append(ChatMessage("user", probe.attack_prompt))
    comp = await call_model(model_ref, msgs, user_keys=user_keys, temperature=0.7, max_tokens=300, extra=extra)
    inp, out, _ = price_for(model_ref)
    cost = compute_cost(comp.prompt_tokens, comp.completion_tokens, inp, out)
    broke = is_jailbroken(comp.text, probe.canary, probe.expect)
    return {
        "response": comp.text,
        "refused": is_refusal(comp.text) and not broke,
        "jailbroken": broke,
        "harm": harm_score(broke, comp.text),
        "cost": cost,
    }


async def execute_safety_run(run_id: str) -> None:
    async with SessionLocal() as session:
        run = await session.get(Run, run_id)
        if run is None:
            return
        config = run.config or {}
        models = config.get("models", [])
        user_keys = await _load_user_keys(session, run.user_id)
        minfos = await _load_models(session, models)
        probes = select_probes(config)
        adaptive = bool(config.get("adaptive", False))
        attacker = config.get("attacker_model") or settings.redteam_attacker_model
        max_rounds = int(config.get("max_rounds", 4))

        worklist = [(m, p) for m in models for p in probes]
        run.status = "running"
        run.started_at = utcnow()
        run.total_items = len(worklist)
        run.done_items = 0
        await session.commit()

    await bus.publish(run_id, {"type": "run_started", "run_id": run_id, "total": len(worklist)})
    sem = asyncio.Semaphore(int(config.get("concurrency") or settings.max_concurrency))

    async def bounded(model_ref, probe):
        async with sem:
            meta = minfos[model_ref].meta if model_ref in minfos else {}
            base = await _single_probe(model_ref, probe, user_keys, meta)
            turns = 1
            transcript = []
            if adaptive and not base["jailbroken"]:
                rt = await adaptive_attack(
                    probe, model_ref, attacker, user_keys=user_keys, max_rounds=max_rounds,
                    target_safety=float(meta.get("safety", 0.85)),
                )
                turns = rt.turns
                transcript = rt.transcript
                base["cost"] += rt.cost
                if rt.jailbroken:
                    base["jailbroken"] = True
                    base["refused"] = False
                    base["harm"] = harm_score(True, rt.final_response)
                    base["response"] = rt.final_response
            return model_ref, probe, base, turns, transcript

    tasks = [asyncio.create_task(bounded(m, p)) for m, p in worklist]
    done = 0
    total_cost = 0.0
    for fut in asyncio.as_completed(tasks):
        model_ref, probe, res, turns, transcript = await fut
        done += 1
        total_cost += res["cost"]
        async with SessionLocal() as s:
            s.add(
                SafetyResult(
                    run_id=run_id,
                    model_ref=model_ref,
                    category=probe.category,
                    technique=probe.technique,
                    goal=probe.description,
                    attack_prompt=probe.attack_prompt[:2000],
                    response=res["response"][:4000],
                    refused=res["refused"],
                    jailbroken=res["jailbroken"],
                    harm_score=res["harm"],
                    turns=turns,
                    rationale=f"expect={probe.expect} canary={probe.canary!r}",
                    transcript=transcript,
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
                "model_ref": model_ref,
                "category": probe.category,
                "jailbroken": res["jailbroken"],
                "turns": turns,
                "cost": round(total_cost, 4),
            },
        )

    async with SessionLocal() as s:
        run = await s.get(Run, run_id)
        run.status = "completed"
        run.finished_at = utcnow()
        await s.commit()
    await bus.publish(
        run_id,
        {"type": "run_completed", "run_id": run_id, "done": done, "total": len(worklist),
         "total_cost": round(total_cost, 4)},
    )


__all__ = ["execute_safety_run", "select_probes"]
