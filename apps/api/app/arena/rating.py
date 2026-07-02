"""Rating math for the arena.

* Online **Elo** — a live ticker that updates per match.
* **Bradley-Terry** MLE (LMArena's method) — the stable global leaderboard, with a
  bootstrap confidence interval. Both are converted to the familiar ~1000–2000 Elo scale.
"""
from __future__ import annotations

import math
from collections import defaultdict

import numpy as np

BASE_RATING = 1000.0
ANCHOR = 1200.0


def compute_elo(matches: list[dict], k: float = 32.0, base: float = BASE_RATING) -> dict[str, float]:
    """Sequential Elo. Each match dict: {model_a, model_b, winner in 'a'|'b'|'tie'}."""
    ratings: dict[str, float] = defaultdict(lambda: base)
    for m in matches:
        a, b = m["model_a"], m["model_b"]
        ra, rb = ratings[a], ratings[b]
        ea = 1.0 / (1.0 + 10 ** ((rb - ra) / 400.0))
        eb = 1.0 - ea
        sa = {"a": 1.0, "b": 0.0, "tie": 0.5}.get(m["winner"], 0.5)
        sb = 1.0 - sa
        ratings[a] = ra + k * (sa - ea)
        ratings[b] = rb + k * (sb - eb)
    return dict(ratings)


def _bt_fit(
    models: list[str], wins: np.ndarray, games: np.ndarray, iters: int = 200, prior: float = 1.0
) -> np.ndarray:
    """Minorization-maximization for Bradley-Terry strengths p (positive, normalized).

    A conjugate Beta-style prior gives every model `prior` virtual games (split as a tie)
    against a fixed strength-1 anchor. Without it, a model with zero wins collapses to
    strength → 0, which `_to_elo` then maps to ~-4800 and blows up the whole board
    (a winless model early on is the norm, not the exception).
    """
    n = len(models)
    p = np.ones(n)
    for _ in range(iters):
        p_new = np.zeros(n)
        for i in range(n):
            denom = prior / (p[i] + 1.0)  # virtual games vs. the strength-1 anchor
            for j in range(n):
                if i == j or games[i, j] == 0:
                    continue
                denom += games[i, j] / (p[i] + p[j])
            p_new[i] = (wins[i] + 0.5 * prior) / denom if denom > 0 else p[i]
        s = p_new.sum()
        if s <= 0 or not np.isfinite(s):
            break
        p_new /= s
        if np.allclose(p_new, p, atol=1e-9):
            p = p_new
            break
        p = p_new
    return p


def _to_elo(models: list[str], p: np.ndarray) -> dict[str, float]:
    logs = np.array([400.0 * math.log10(max(x, 1e-12)) for x in p])
    logs = logs - logs.mean() + ANCHOR
    return {m: round(float(v), 1) for m, v in zip(models, logs, strict=False)}


def compute_bradley_terry(
    matches: list[dict], bootstrap: int = 100
) -> dict[str, dict]:
    """Return {model: {rating, ci_low, ci_high, wins, losses, ties, games}}."""
    models = sorted({m["model_a"] for m in matches} | {m["model_b"] for m in matches})
    if not models:
        return {}
    idx = {m: i for i, m in enumerate(models)}
    n = len(models)

    def tally(sample: list[dict]):
        wins = np.zeros(n)
        games = np.zeros((n, n))
        for m in sample:
            i, j = idx[m["model_a"]], idx[m["model_b"]]
            games[i, j] += 1
            games[j, i] += 1
            if m["winner"] == "a":
                wins[i] += 1
            elif m["winner"] == "b":
                wins[j] += 1
            else:
                wins[i] += 0.5
                wins[j] += 0.5
        return wins, games

    wins, games = tally(matches)
    p = _bt_fit(models, wins, games)
    ratings = _to_elo(models, p)

    # bootstrap CI
    lows: dict[str, list[float]] = {m: [] for m in models}
    if bootstrap and len(matches) >= 4:
        rng = np.random.default_rng(12345)
        for _ in range(bootstrap):
            sample = [matches[i] for i in rng.integers(0, len(matches), len(matches))]
            w2, g2 = tally(sample)
            p2 = _bt_fit(models, w2, g2, iters=60)
            e2 = _to_elo(models, p2)
            for m in models:
                lows[m].append(e2[m])

    # per-model W/L/T
    rec = {m: {"wins": 0, "losses": 0, "ties": 0} for m in models}
    for m in matches:
        a, b = m["model_a"], m["model_b"]
        if m["winner"] == "a":
            rec[a]["wins"] += 1
            rec[b]["losses"] += 1
        elif m["winner"] == "b":
            rec[b]["wins"] += 1
            rec[a]["losses"] += 1
        else:
            rec[a]["ties"] += 1
            rec[b]["ties"] += 1

    out = {}
    for m in models:
        samples = lows[m]
        ci_low = round(float(np.percentile(samples, 2.5)), 1) if samples else ratings[m]
        ci_high = round(float(np.percentile(samples, 97.5)), 1) if samples else ratings[m]
        games_played = rec[m]["wins"] + rec[m]["losses"] + rec[m]["ties"]
        out[m] = {
            "rating": ratings[m],
            "ci_low": ci_low,
            "ci_high": ci_high,
            **rec[m],
            "games": games_played,
        }
    return out
