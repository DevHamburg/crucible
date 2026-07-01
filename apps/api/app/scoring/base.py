"""Scoring core: a normalized `ScoreResult`, a `ScoringContext`, a decorator registry,
and shared answer-extraction helpers used by every scorer."""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from typing import Awaitable, Callable

from app.providers.base import ChatMessage


@dataclass
class ScoringContext:
    judge_model: str = "mock/judge-pro"
    user_keys: dict[str, str] = field(default_factory=dict)
    benchmark: dict = field(default_factory=dict)
    item: dict = field(default_factory=dict)
    # accumulates judge token cost so the engine can bill it back
    judge_cost: float = 0.0


@dataclass
class ScoreResult:
    score: float             # normalized 0..1
    passed: bool
    rationale: str = ""
    raw: dict = field(default_factory=dict)
    needs_review: bool = False


Scorer = Callable[[str, dict, dict, ScoringContext], Awaitable[ScoreResult]]

_REGISTRY: dict[str, Scorer] = {}


def register_scorer(name: str) -> Callable[[Scorer], Scorer]:
    def deco(fn: Scorer) -> Scorer:
        _REGISTRY[name] = fn
        return fn

    return deco


def get_scorer(name: str) -> Scorer | None:
    return _REGISTRY.get(name)


def list_scorers() -> list[str]:
    return sorted(_REGISTRY)


# --------------------------------------------------------------------------- #
# Extraction helpers
# --------------------------------------------------------------------------- #
_LETTER_PATTERNS = [
    re.compile(r"answer\s*(?:is|:)?\s*\(?\s*([A-J])\b", re.I),
    re.compile(r"\bthe answer is\s*\(?([A-J])\)?", re.I),
    re.compile(r"\b([A-J])\)\s*$"),
    re.compile(r"^\s*\(?([A-J])\)?[\.\):]", re.I),
    re.compile(r"\boption\s+([A-J])\b", re.I),
]


def extract_choice(text: str, n_choices: int = 26) -> str | None:
    """Best-effort extraction of a multiple-choice letter."""
    if not text:
        return None
    allowed = {chr(ord("A") + i) for i in range(n_choices)}
    for pat in _LETTER_PATTERNS:
        for m in reversed(list(pat.finditer(text))):
            letter = m.group(1).upper()
            if letter in allowed:
                return letter
    # last standalone capital letter in the text
    for tok in reversed(re.findall(r"\b([A-J])\b", text)):
        if tok.upper() in allowed:
            return tok.upper()
    return None


_NUM = re.compile(r"-?\$?\d[\d,]*\.?\d*")


def extract_number(text: str) -> float | None:
    if not text:
        return None
    boxed = extract_boxed(text)
    if boxed is not None:
        text = boxed
    # GSM8K style "#### 42"
    m = re.search(r"####\s*(-?\$?\d[\d,]*\.?\d*)", text)
    cands = [m.group(1)] if m else _NUM.findall(text)
    if not cands:
        return None
    raw = cands[-1].replace(",", "").replace("$", "")
    try:
        return float(raw)
    except ValueError:
        return None


def extract_boxed(text: str) -> str | None:
    idx = text.rfind(r"\boxed{")
    if idx == -1:
        return None
    i = idx + len(r"\boxed{")
    depth = 1
    out = []
    while i < len(text) and depth:
        c = text[i]
        if c == "{":
            depth += 1
        elif c == "}":
            depth -= 1
            if depth == 0:
                break
        out.append(c)
        i += 1
    return "".join(out)


def extract_code(text: str) -> str:
    """Pull the first fenced code block, else return the raw text."""
    m = re.search(r"```(?:python|py)?\s*\n(.*?)```", text, re.S)
    if m:
        return m.group(1)
    m = re.search(r"```(.*?)```", text, re.S)
    return m.group(1) if m else text


def normalize_text(s: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", s.lower()).strip()


def as_messages(item: dict) -> list[ChatMessage]:
    """Build the chat messages for an item (system + user prompt)."""
    msgs: list[ChatMessage] = []
    system = (item.get("input") or {}).get("system")
    if system:
        msgs.append(ChatMessage("system", system))
    msgs.append(ChatMessage("user", item["prompt"]))
    return msgs
