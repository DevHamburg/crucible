"""Scoring package. Importing it registers every built-in scorer."""
from app.scoring import code_exec, llm_scorer, rule_based  # noqa: F401  (register side-effects)
from app.scoring.base import (
    ScoreResult,
    ScoringContext,
    Scorer,
    get_scorer,
    list_scorers,
    register_scorer,
)

__all__ = [
    "ScoreResult",
    "ScoringContext",
    "Scorer",
    "get_scorer",
    "list_scorers",
    "register_scorer",
]
