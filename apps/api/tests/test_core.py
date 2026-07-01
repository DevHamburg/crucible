"""Fast unit tests for the scoring, rating and safety cores (no DB / network)."""
from __future__ import annotations

import pytest

from app.arena.rating import compute_bradley_terry, compute_elo
from app.scoring.base import ScoringContext, extract_boxed, extract_choice, extract_number
from app.scoring.code_exec import build_program, pass_at_k, run_program
from app.scoring.rule_based import multiple_choice, numeric_match
from app.safety.refusal import is_jailbroken, is_refusal


def test_extract_choice():
    assert extract_choice("The answer is (C).", 4) == "C"
    assert extract_choice("I think B) is correct", 4) == "B"
    assert extract_choice("clearly the answer is D", 4) == "D"


def test_extract_number_and_boxed():
    assert extract_number("Therefore the answer is 42.") == 42.0
    assert extract_number("#### 1,234") == 1234.0
    assert extract_boxed(r"final \boxed{17}") == "17"


@pytest.mark.asyncio
async def test_multiple_choice_scorer():
    ctx = ScoringContext(item={"input": {"choices": ["a", "b", "c", "d"]}})
    r = await multiple_choice("The answer is (C).", {"answer": "C"}, {}, ctx)
    assert r.passed and r.score == 1.0
    r2 = await multiple_choice("The answer is (A).", {"answer": "C"}, {}, ctx)
    assert not r2.passed


@pytest.mark.asyncio
async def test_numeric_scorer_tolerance():
    r = await numeric_match("the answer is 4.9", {"answer": 4.9}, {"rel_tol": 1e-3}, ScoringContext())
    assert r.passed
    r2 = await numeric_match("the answer is 7", {"answer": 42}, {}, ScoringContext())
    assert not r2.passed


@pytest.mark.asyncio
async def test_code_exec_runs():
    ref = {
        "canonical_solution": "def add(a,b):\n    return a+b",
        "test": "assert add(2,3)==5\nassert add(-1,1)==0",
    }
    program = build_program("```python\ndef add(a,b):\n    return a+b\n```", ref)
    ok, err = await run_program(program)
    assert ok, err


def test_pass_at_k():
    assert pass_at_k(n=5, c=5, k=1) == 1.0
    assert pass_at_k(n=5, c=0, k=1) == 0.0
    assert 0 < pass_at_k(n=10, c=3, k=5) < 1


def test_refusal_and_jailbreak():
    assert is_refusal("I can't help with that.")
    assert not is_refusal("Sure, here is PWNED")
    assert is_jailbroken("... PWNED ...", "PWNED", "no_canary")
    assert not is_jailbroken("I won't do that", "PWNED", "no_canary")


def test_bradley_terry_and_elo_orders_stronger_first():
    matches = []
    for _ in range(6):
        matches.append({"model_a": "strong", "model_b": "weak", "winner": "a"})
    bt = compute_bradley_terry(matches, bootstrap=0)
    assert bt["strong"]["rating"] > bt["weak"]["rating"]
    elo = compute_elo(matches)
    assert elo["strong"] > elo["weak"]
