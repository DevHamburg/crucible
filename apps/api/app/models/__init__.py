"""SQLAlchemy ORM models for Crucible.

Tables:
  User, ApiKey            — accounts & encrypted provider keys
  ModelCatalog           — known models (provider/id, pricing, context)
  Benchmark, BenchmarkItem — eval suites and their items across all domains
  Run, Generation, Result — an eval run, every model call, every scored item
  SafetyResult           — jailbreak/red-team outcomes
  ArenaMatch, Tournament — head-to-head, debate & bracket competition
  HumanReview            — human-in-the-loop scoring
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.db import Base


def new_id() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=utcnow)


# --------------------------------------------------------------------------- #
# Accounts
# --------------------------------------------------------------------------- #
class User(Base, TimestampMixin):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(120), default="")
    is_admin: Mapped[bool] = mapped_column(Boolean, default=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    # Anonymous visitors get a real (flagged) row so keys/runs attach uniformly.
    # Registering upgrades the same row in place (is_anonymous -> False), keeping history.
    is_anonymous: Mapped[bool] = mapped_column(Boolean, default=False)

    api_keys: Mapped[list[ApiKey]] = relationship(back_populates="user", cascade="all, delete-orphan")


class ApiKey(Base, TimestampMixin):
    __tablename__ = "api_keys"
    __table_args__ = (UniqueConstraint("user_id", "provider", "label", name="uq_user_provider_label"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    provider: Mapped[str] = mapped_column(String(40), index=True)  # openrouter/openai/...
    label: Mapped[str] = mapped_column(String(80), default="default")
    encrypted_key: Mapped[str] = mapped_column(Text)
    masked: Mapped[str] = mapped_column(String(40), default="")

    user: Mapped[User] = relationship(back_populates="api_keys")


# --------------------------------------------------------------------------- #
# Model catalog
# --------------------------------------------------------------------------- #
class ModelCatalog(Base, TimestampMixin):
    __tablename__ = "model_catalog"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    ref: Mapped[str] = mapped_column(String(160), unique=True, index=True)  # provider/model_id
    provider: Mapped[str] = mapped_column(String(40), index=True)
    model_id: Mapped[str] = mapped_column(String(160))
    display_name: Mapped[str] = mapped_column(String(160))
    family: Mapped[str] = mapped_column(String(80), default="")
    context_window: Mapped[int] = mapped_column(Integer, default=8192)
    max_output: Mapped[int] = mapped_column(Integer, default=4096)
    input_price: Mapped[float] = mapped_column(Float, default=0.0)   # USD / 1M input tokens
    output_price: Mapped[float] = mapped_column(Float, default=0.0)  # USD / 1M output tokens
    modalities: Mapped[list] = mapped_column(JSON, default=lambda: ["text"])
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    is_open_weight: Mapped[bool] = mapped_column(Boolean, default=False)
    meta: Mapped[dict] = mapped_column(JSON, default=dict)  # skill/safety knobs for mock, tags, etc.


# --------------------------------------------------------------------------- #
# Benchmarks
# --------------------------------------------------------------------------- #
class Benchmark(Base, TimestampMixin):
    __tablename__ = "benchmarks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    slug: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(200))
    domain: Mapped[str] = mapped_column(String(60), index=True)  # psychology/trading/software/...
    description: Mapped[str] = mapped_column(Text, default="")
    task_type: Mapped[str] = mapped_column(String(60))     # mcq/open/code/numeric/safety/...
    scoring_type: Mapped[str] = mapped_column(String(60))  # exact_match/multiple_choice/code_exec/llm_judge/...
    license: Mapped[str] = mapped_column(String(120), default="unknown")
    source_url: Mapped[str] = mapped_column(String(400), default="")
    num_items: Mapped[int] = mapped_column(Integer, default=0)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)  # rubric, tolerance, few-shot, etc.

    items: Mapped[list[BenchmarkItem]] = relationship(
        back_populates="benchmark", cascade="all, delete-orphan"
    )


class BenchmarkItem(Base):
    __tablename__ = "benchmark_items"
    __table_args__ = (Index("ix_item_benchmark", "benchmark_id"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    benchmark_id: Mapped[str] = mapped_column(ForeignKey("benchmarks.id", ondelete="CASCADE"))
    external_id: Mapped[str] = mapped_column(String(120), default="")
    prompt: Mapped[str] = mapped_column(Text)
    input: Mapped[dict] = mapped_column(JSON, default=dict)      # choices, context, system, etc.
    reference: Mapped[dict] = mapped_column(JSON, default=dict)  # answer, tests, rubric_ref
    difficulty: Mapped[str] = mapped_column(String(20), default="medium")
    meta: Mapped[dict] = mapped_column(JSON, default=dict)

    benchmark: Mapped[Benchmark] = relationship(back_populates="items")


# --------------------------------------------------------------------------- #
# Runs / results / traces
# --------------------------------------------------------------------------- #
class Run(Base, TimestampMixin):
    __tablename__ = "runs"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    user_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(200), default="")
    kind: Mapped[str] = mapped_column(String(40), default="benchmark")  # benchmark/safety/arena
    status: Mapped[str] = mapped_column(String(30), default="pending", index=True)
    config: Mapped[dict] = mapped_column(JSON, default=dict)  # models, benchmarks, params
    progress: Mapped[float] = mapped_column(Float, default=0.0)
    total_items: Mapped[int] = mapped_column(Integer, default=0)
    done_items: Mapped[int] = mapped_column(Integer, default=0)
    total_cost: Mapped[float] = mapped_column(Float, default=0.0)
    error: Mapped[str] = mapped_column(Text, default="")
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    results: Mapped[list[Result]] = relationship(back_populates="run", cascade="all, delete-orphan")


class Generation(Base, TimestampMixin):
    """Every single model call — the observability backbone."""

    __tablename__ = "generations"
    __table_args__ = (Index("ix_gen_run_model", "run_id", "model_ref"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    run_id: Mapped[str | None] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), nullable=True)
    model_ref: Mapped[str] = mapped_column(String(160), index=True)
    provider: Mapped[str] = mapped_column(String(40))
    kind: Mapped[str] = mapped_column(String(40), default="benchmark")
    request: Mapped[dict] = mapped_column(JSON, default=dict)
    response_text: Mapped[str] = mapped_column(Text, default="")
    prompt_tokens: Mapped[int] = mapped_column(Integer, default=0)
    completion_tokens: Mapped[int] = mapped_column(Integer, default=0)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    status: Mapped[str] = mapped_column(String(20), default="ok")
    error: Mapped[str] = mapped_column(Text, default="")


class Result(Base, TimestampMixin):
    __tablename__ = "results"
    __table_args__ = (Index("ix_result_run_model", "run_id", "model_ref"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    benchmark_id: Mapped[str] = mapped_column(String(32), index=True)
    benchmark_slug: Mapped[str] = mapped_column(String(120), default="")
    domain: Mapped[str] = mapped_column(String(60), default="", index=True)
    item_id: Mapped[str] = mapped_column(String(32), default="")
    model_ref: Mapped[str] = mapped_column(String(160), index=True)
    prompt: Mapped[str] = mapped_column(Text, default="")
    response: Mapped[str] = mapped_column(Text, default="")
    score: Mapped[float] = mapped_column(Float, default=0.0)      # normalized 0..1
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    latency_ms: Mapped[int] = mapped_column(Integer, default=0)
    cost: Mapped[float] = mapped_column(Float, default=0.0)
    judge_model: Mapped[str] = mapped_column(String(160), default="")
    rationale: Mapped[str] = mapped_column(Text, default="")
    raw: Mapped[dict] = mapped_column(JSON, default=dict)
    needs_review: Mapped[bool] = mapped_column(Boolean, default=False)

    run: Mapped[Run] = relationship(back_populates="results")


# --------------------------------------------------------------------------- #
# Safety / red-team
# --------------------------------------------------------------------------- #
class SafetyResult(Base, TimestampMixin):
    __tablename__ = "safety_results"
    __table_args__ = (Index("ix_safety_run_model", "run_id", "model_ref"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    run_id: Mapped[str] = mapped_column(ForeignKey("runs.id", ondelete="CASCADE"), index=True)
    model_ref: Mapped[str] = mapped_column(String(160), index=True)
    category: Mapped[str] = mapped_column(String(80), index=True)   # attack category
    technique: Mapped[str] = mapped_column(String(80), default="")
    goal: Mapped[str] = mapped_column(Text, default="")             # the (benign-described) probe goal
    attack_prompt: Mapped[str] = mapped_column(Text, default="")
    response: Mapped[str] = mapped_column(Text, default="")
    refused: Mapped[bool] = mapped_column(Boolean, default=True)
    jailbroken: Mapped[bool] = mapped_column(Boolean, default=False)
    harm_score: Mapped[float] = mapped_column(Float, default=0.0)   # 0..4 severity if complied
    turns: Mapped[int] = mapped_column(Integer, default=1)          # multi-turn / PAIR iterations used
    rationale: Mapped[str] = mapped_column(Text, default="")
    transcript: Mapped[list] = mapped_column(JSON, default=list)    # multi-turn conversation


# --------------------------------------------------------------------------- #
# Arena: head-to-head, debate, tournament, adversarial
# --------------------------------------------------------------------------- #
class Tournament(Base, TimestampMixin):
    __tablename__ = "tournaments"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    name: Mapped[str] = mapped_column(String(200), default="")
    format: Mapped[str] = mapped_column(String(40), default="single_elim")
    status: Mapped[str] = mapped_column(String(30), default="pending")
    domain: Mapped[str] = mapped_column(String(60), default="mixed")
    models: Mapped[list] = mapped_column(JSON, default=list)
    bracket: Mapped[dict] = mapped_column(JSON, default=dict)
    champion: Mapped[str] = mapped_column(String(160), default="")
    config: Mapped[dict] = mapped_column(JSON, default=dict)


class ArenaMatch(Base, TimestampMixin):
    __tablename__ = "arena_matches"
    __table_args__ = (Index("ix_match_models", "model_a", "model_b"),)

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    kind: Mapped[str] = mapped_column(String(40), default="elo")  # elo/debate/tournament/adversarial
    tournament_id: Mapped[str | None] = mapped_column(
        ForeignKey("tournaments.id", ondelete="CASCADE"), nullable=True, index=True
    )
    round_no: Mapped[int] = mapped_column(Integer, default=0)
    user_id: Mapped[str | None] = mapped_column(String(32), nullable=True, index=True)  # creator (for own/global scoping)
    domain: Mapped[str] = mapped_column(String(60), default="mixed")
    topic: Mapped[str] = mapped_column(Text, default="")
    prompt: Mapped[str] = mapped_column(Text, default="")
    model_a: Mapped[str] = mapped_column(String(160), index=True)
    model_b: Mapped[str] = mapped_column(String(160), index=True)
    response_a: Mapped[str] = mapped_column(Text, default="")
    response_b: Mapped[str] = mapped_column(Text, default="")
    winner: Mapped[str] = mapped_column(String(10), default="")  # a/b/tie
    judge_model: Mapped[str] = mapped_column(String(160), default="")
    rationale: Mapped[str] = mapped_column(Text, default="")
    rounds: Mapped[list] = mapped_column(JSON, default=list)     # debate transcript
    scores: Mapped[dict] = mapped_column(JSON, default=dict)     # judge sub-scores
    cost: Mapped[float] = mapped_column(Float, default=0.0)


class HumanReview(Base, TimestampMixin):
    __tablename__ = "human_reviews"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=new_id)
    result_id: Mapped[str] = mapped_column(String(32), index=True)
    reviewer_id: Mapped[str | None] = mapped_column(ForeignKey("users.id"), nullable=True)
    score: Mapped[float] = mapped_column(Float, default=0.0)
    passed: Mapped[bool] = mapped_column(Boolean, default=False)
    notes: Mapped[str] = mapped_column(Text, default="")


__all__ = [
    "Base",
    "User",
    "ApiKey",
    "ModelCatalog",
    "Benchmark",
    "BenchmarkItem",
    "Run",
    "Generation",
    "Result",
    "SafetyResult",
    "Tournament",
    "ArenaMatch",
    "HumanReview",
    "new_id",
    "utcnow",
]