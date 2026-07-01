"""Idempotent database seeding: model catalog, benchmark packs (JSON in ./data), admin user.

Run:  python -m app.seeds.seed
"""
from __future__ import annotations

import asyncio
import json
from pathlib import Path

from sqlalchemy import delete, select

from app.core.config import settings
from app.core.db import SessionLocal, init_db
from app.core.security import hash_password
from app.models import Benchmark, BenchmarkItem, ModelCatalog, User
from app.observability.cost import PRICING
from app.providers.base import ModelRef
from app.seeds.catalog import MOCK_MODELS, REAL_MODELS

DATA_DIR = Path(__file__).parent / "data"


async def seed_models(session) -> int:
    existing = {m.ref: m for m in (await session.scalars(select(ModelCatalog))).all()}
    count = 0
    for spec in MOCK_MODELS + REAL_MODELS:
        ref = spec["ref"]
        parsed = ModelRef.parse(ref)
        ip, op, ctx = PRICING.get(ref, (0.0, 0.0, spec.get("context_window", 8192)))
        row = existing.get(ref)
        if row is None:
            row = ModelCatalog(ref=ref)
            session.add(row)
        row.provider = parsed.provider
        row.model_id = parsed.model_id
        row.display_name = spec.get("display_name", ref)
        row.family = spec.get("family", "")
        row.context_window = spec.get("context_window", ctx)
        row.input_price = ip
        row.output_price = op
        row.is_open_weight = spec.get("is_open_weight", parsed.provider in ("mock", "ollama"))
        row.is_active = True
        row.meta = spec.get("meta", {}) | ({"tags": spec["tags"]} if spec.get("tags") else {})
        count += 1
    return count


async def seed_benchmarks(session) -> tuple[int, int]:
    packs = sorted(DATA_DIR.glob("*.json"))
    n_bench = n_items = 0
    existing = {b.slug: b for b in (await session.scalars(select(Benchmark))).all()}
    for path in packs:
        try:
            pack = json.loads(path.read_text())
        except json.JSONDecodeError as exc:
            print(f"  ! skipping {path.name}: invalid JSON ({exc})")
            continue
        slug = pack["slug"]
        b = existing.get(slug)
        is_new = b is None
        if is_new:
            b = Benchmark(slug=slug)
        b.name = pack["name"]
        b.domain = pack["domain"]
        b.description = pack.get("description", "")
        b.task_type = pack["task_type"]
        b.scoring_type = pack["scoring_type"]
        b.license = pack.get("license", "unknown")
        b.source_url = pack.get("source_url", "")
        b.config = pack.get("config", {})
        b.is_active = True
        if is_new:
            session.add(b)
            await session.flush()  # obtain b.id with all NOT NULL fields set
        # replace items
        await session.execute(delete(BenchmarkItem).where(BenchmarkItem.benchmark_id == b.id))
        items = pack.get("items", [])
        for it in items:
            session.add(
                BenchmarkItem(
                    benchmark_id=b.id,
                    external_id=str(it.get("external_id", "")),
                    prompt=it["prompt"],
                    input=it.get("input", {}),
                    reference=it.get("reference", {}),
                    difficulty=it.get("difficulty", "medium"),
                    meta=it.get("meta", {}),
                )
            )
            n_items += 1
        b.num_items = len(items)
        n_bench += 1
        print(f"  + {slug}: {len(items)} items [{b.domain}/{b.scoring_type}]")
    return n_bench, n_items


async def seed_admin(session) -> None:
    email = settings.first_admin_email
    exists = await session.scalar(select(User).where(User.email == email))
    if exists:
        return
    session.add(
        User(
            email=email,
            hashed_password=hash_password(settings.first_admin_password),
            display_name="Admin",
            is_admin=True,
        )
    )
    print(f"  + admin user: {email} (password from FIRST_ADMIN_PASSWORD)")


async def main() -> None:
    print("→ init db")
    await init_db()
    async with SessionLocal() as session:
        print("→ seeding models")
        nm = await seed_models(session)
        print(f"  {nm} models")
        print("→ seeding benchmarks")
        nb, ni = await seed_benchmarks(session)
        print(f"  {nb} benchmarks, {ni} items")
        print("→ seeding admin")
        await seed_admin(session)
        await session.commit()
    print("✓ seed complete")


if __name__ == "__main__":
    asyncio.run(main())
