"""Open-ended prompt pools for arena battles, debates and tournaments, by domain."""
from __future__ import annotations

ARENA_PROMPTS: dict[str, list[str]] = {
    "logic": [
        "Three switches control three bulbs in another room. You may flip switches freely but enter the room only once. How do you determine which switch controls which bulb? Explain.",
        "A bat and ball cost $1.10 together; the bat costs $1.00 more than the ball. Solve carefully and explain the common wrong answer.",
        "You have 8 identical-looking coins, one heavier. Using a balance scale twice, find the heavy coin. Justify optimality.",
    ],
    "software": [
        "Design a rate limiter for a public API. Compare token-bucket vs sliding-window, and give pseudocode for one.",
        "Explain how you'd debug a memory leak in a long-running Node.js service, step by step.",
        "Write a clear, correct function to detect a cycle in a singly linked list and explain the invariant.",
    ],
    "business": [
        "A SaaS with 5% monthly churn wants to reach net-negative churn. Propose a prioritized 90-day plan with metrics.",
        "Should a seed-stage startup with 8 months runway raise now or cut burn? Lay out the decision framework.",
        "Design a pricing strategy for a new B2B analytics product. Justify tiers and anchoring.",
    ],
    "marketing": [
        "Write a launch announcement for an AI benchmarking platform aimed at ML engineers. Make it crisp and credible, not hypey.",
        "Draft 3 distinct value propositions for a productivity app and explain which segment each targets.",
        "Create a cold email that books a demo with a skeptical CTO. Keep it under 120 words.",
    ],
    "psychology": [
        "A friend says they feel like an impostor despite objective success. Respond supportively and explain the cognitive pattern.",
        "Explain the difference between guilt and shame and why it matters for behavior change.",
        "Describe how confirmation bias could distort a hiring decision and one concrete debiasing tactic.",
    ],
    "trading": [
        "Explain the risk of selling naked options and how position sizing mitigates ruin. Be precise about tail risk.",
        "Given only that a stock's implied volatility is far above its realized volatility, what strategies make sense and why?",
        "Describe how you'd stress-test a momentum strategy for regime change without overfitting.",
    ],
    "mixed": [
        "Explain a complex idea of your choice to a smart 12-year-old without dumbing it down.",
        "What is the strongest argument against your own most confident belief? Steelman it.",
        "Give the single most useful piece of decision-making advice and defend it.",
    ],
}

DEBATE_TOPICS: dict[str, list[str]] = {
    "mixed": [
        "Resolved: Open-weight models will dominate enterprise AI within five years.",
        "Resolved: Index investing is strictly better than active trading for most people.",
        "Resolved: Remote-first is the superior operating model for software companies.",
        "Resolved: AGI benchmarks measure marketing more than capability.",
    ],
    "business": [
        "Resolved: Growth should be prioritized over profitability for early-stage startups.",
        "Resolved: Freemium is a trap for most B2B SaaS.",
    ],
    "trading": [
        "Resolved: Technical analysis has no edge over a disciplined buy-and-hold strategy.",
    ],
}


def get_prompts(domain: str, n: int) -> list[str]:
    pool = ARENA_PROMPTS.get(domain) or ARENA_PROMPTS["mixed"]
    if n <= len(pool):
        return pool[:n]
    out = []
    while len(out) < n:
        out.extend(pool)
    return out[:n]


def get_topics(domain: str) -> list[str]:
    return DEBATE_TOPICS.get(domain) or DEBATE_TOPICS["mixed"]
