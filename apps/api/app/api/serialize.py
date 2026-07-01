"""ORM -> plain dict serializers for API responses."""
from __future__ import annotations

from app.models import ApiKey, Benchmark, ModelCatalog, Run


def model_out(m: ModelCatalog, has_key: bool = False) -> dict:
    meta = m.meta or {}
    return {
        "ref": m.ref,
        "provider": m.provider,
        "model_id": m.model_id,
        "display_name": m.display_name,
        "family": m.family,
        "context_window": m.context_window,
        "input_price": m.input_price,
        "output_price": m.output_price,
        "is_open_weight": m.is_open_weight,
        "is_active": m.is_active,
        "keyless": m.provider in ("mock", "ollama", "echo"),
        "has_key": has_key or m.provider in ("mock", "ollama", "echo"),
        "tags": meta.get("tags", []),
        "role": meta.get("role"),
        "simulated": m.provider == "mock",
    }


def benchmark_out(b: Benchmark, sample: list | None = None) -> dict:
    out = {
        "slug": b.slug,
        "name": b.name,
        "domain": b.domain,
        "description": b.description,
        "task_type": b.task_type,
        "scoring_type": b.scoring_type,
        "license": b.license,
        "source_url": b.source_url,
        "num_items": b.num_items,
        "is_active": b.is_active,
        "config": b.config or {},
    }
    if sample is not None:
        out["sample_items"] = sample
    return out


def run_out(r: Run) -> dict:
    return {
        "id": r.id,
        "name": r.name,
        "kind": r.kind,
        "status": r.status,
        "config": r.config or {},
        "progress": r.progress,
        "total_items": r.total_items,
        "done_items": r.done_items,
        "total_cost": r.total_cost,
        "error": r.error,
        "created_at": r.created_at.isoformat() if r.created_at else None,
        "started_at": r.started_at.isoformat() if r.started_at else None,
        "finished_at": r.finished_at.isoformat() if r.finished_at else None,
    }


def apikey_out(k: ApiKey) -> dict:
    return {
        "id": k.id,
        "provider": k.provider,
        "label": k.label,
        "masked": k.masked,
        "created_at": k.created_at.isoformat() if k.created_at else None,
    }
