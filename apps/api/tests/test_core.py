"""Fast unit tests for the scoring, rating and safety cores (no DB / network)."""
from __future__ import annotations

import pytest

from app.arena.rating import compute_bradley_terry, compute_elo
from app.safety.refusal import is_jailbroken, is_refusal
from app.scoring.base import ScoringContext, extract_boxed, extract_choice, extract_number
from app.scoring.code_exec import build_program, pass_at_k, run_program
from app.scoring.judge import _extract_json
from app.scoring.rule_based import multiple_choice, numeric_match


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


def test_bradley_terry_winless_model_stays_on_scale():
    """A model with zero wins must not blow the board off the ~1000-2000 Elo scale
    (regression: the unregularized MLE produced ratings like 3600 / -1920)."""
    # A beats B twice; B is winless.
    bt = compute_bradley_terry(
        [{"model_a": "A", "model_b": "B", "winner": "a"}] * 2, bootstrap=0
    )
    assert bt["A"]["rating"] > bt["B"]["rating"]
    for stats in bt.values():
        assert 600 <= stats["rating"] <= 1800

    # 3-model chain where C loses every game.
    bt3 = compute_bradley_terry(
        [
            {"model_a": "A", "model_b": "B", "winner": "a"},
            {"model_a": "A", "model_b": "C", "winner": "a"},
            {"model_a": "B", "model_b": "C", "winner": "a"},
        ],
        bootstrap=0,
    )
    assert bt3["A"]["rating"] > bt3["B"]["rating"] > bt3["C"]["rating"]
    for stats in bt3.values():
        assert 600 <= stats["rating"] <= 1800


def test_extract_json_tolerant():
    assert _extract_json('{"winner": "A"}') == {"winner": "A"}
    # embedded in prose
    assert _extract_json('Sure! {"overall": 4} done')["overall"] == 4
    # trailing comma + single quotes are tolerated
    assert _extract_json("{'winner': 'tie',}") == {"winner": "tie"}
    # unrecoverable -> None (not a crash)
    assert _extract_json("no json here at all") is None
    assert _extract_json("{not valid") is None


def test_bool_num_is_portable_and_averages():
    """bool_num must AVG booleans as 1.0/0.0 on SQLite (and, by construction, Postgres)."""
    from sqlalchemy import Boolean, Column, Integer, String, create_engine, func, select
    from sqlalchemy.orm import Session, declarative_base

    from app.api.sqlutil import bool_num

    Base = declarative_base()

    class _Row(Base):
        __tablename__ = "t"
        id = Column(Integer, primary_key=True)
        flag = Column(Boolean)
        status = Column(String)

    engine = create_engine("sqlite://")
    Base.metadata.create_all(engine)
    with Session(engine) as s:
        s.add_all([_Row(flag=True, status="ok"), _Row(flag=True, status="error"),
                   _Row(flag=False, status="ok"), _Row(flag=False, status="ok")])
        s.commit()
        pass_rate = s.scalar(select(func.avg(bool_num(_Row.flag))))
        assert abs(float(pass_rate) - 0.5) < 1e-9
        err_rate = s.scalar(select(func.avg(bool_num(_Row.status == "error"))))
        assert abs(float(err_rate) - 0.25) < 1e-9
