"""Mock provider — a deterministic *simulator* so the entire platform runs end-to-end
offline with zero API keys. It is NOT a real model.

The engine passes a private `extra["simulation"]` payload (reference answer, scoring type,
and per-model `skill`/`safety` knobs from `ModelCatalog.meta`). The mock crafts a response
whose quality tracks `skill`, so leaderboards, arena and safety reports show realistic,
varied, reproducible numbers in demo mode. Real providers ignore `extra`.
"""
from __future__ import annotations

import hashlib
import random
import re

from app.providers.base import ChatMessage, Completion, Provider

_REFUSAL = (
    "I can't help with that. This request appears designed to elicit harmful or unsafe "
    "content, which I won't provide. If you have a safe, legitimate goal I'm happy to help "
    "with that instead."
)
_SIM_COMPLY = "[SIMULATED PARTIAL COMPLIANCE — mock provider emits no real unsafe content]"

_FILLER = [
    "First, let's frame the problem clearly and state assumptions.",
    "Considering the trade-offs, the key drivers are impact, cost and risk.",
    "A structured approach: (1) diagnose, (2) prioritize, (3) act, (4) measure.",
    "Evidence and concrete numbers matter more than vibes here.",
    "We should validate this against the reference criteria before concluding.",
]


class MockProvider(Provider):
    name = "mock"
    keyless = True

    async def _call(
        self,
        model_id: str,
        messages: list[ChatMessage],
        *,
        temperature: float,
        max_tokens: int,
        top_p: float,
        stop: list[str] | None,
        api_key: str,
        timeout: float,
        extra: dict,
    ) -> Completion:
        sim = extra.get("simulation") or {}
        user_text = next((m.content for m in reversed(messages) if m.role == "user"), "")
        seed_src = f"{model_id}|{user_text}|{sim.get('reference')}".encode()
        rng = random.Random(int.from_bytes(hashlib.sha256(seed_src).digest()[:8], "big"))

        skill = float(sim.get("skill", 0.6))
        safety = float(sim.get("safety", 0.85))
        mode = sim.get("mode", "generic")
        text = self._respond(mode, sim, rng, skill, safety)

        pt = self.estimate_tokens(" ".join(m.content for m in messages))
        ct = self.estimate_tokens(text)
        return Completion(
            text=text,
            model_ref=f"{self.name}/{model_id}",
            prompt_tokens=pt,
            completion_tokens=ct,
            raw={"simulated": True, "skill": skill},
        )

    def _respond(self, mode: str, sim: dict, rng: random.Random, skill: float, safety: float) -> str:
        ref = sim.get("reference") or {}

        if mode == "safety":
            # Refuse with probability ~ resistance; otherwise "comply" by emitting the harmless
            # canary (for prompt-injection detection) or a simulated placeholder. Adaptive
            # pressure erodes weak models fast but barely dents well-aligned ones.
            pressure = float(sim.get("pressure", 0.0))
            resistance = safety - pressure * (1.0 - safety)
            if rng.random() < resistance:
                return _REFUSAL
            canary = sim.get("canary")
            return canary if canary else _SIM_COMPLY

        if mode == "exact":
            answer = ref.get("answer")
            if isinstance(answer, list):
                answer = answer[0] if answer else ""
            if answer not in (None, "") and rng.random() < skill:
                return f"{rng.choice(_FILLER)}\nAnswer: {answer}."
            return f"{rng.choice(_FILLER)}\nAnswer: (uncertain)."

        if mode == "mcq":
            choices = sim.get("choices") or []
            correct = str(ref.get("answer", "A")).strip()
            letters = [chr(ord("A") + i) for i in range(max(len(choices), 2))]
            pick = correct if rng.random() < skill else rng.choice([c for c in letters if c != correct] or [correct])
            return f"Let me reason step by step.\n{rng.choice(_FILLER)}\nThe answer is ({pick})."

        if mode in ("numeric", "math"):
            answer = ref.get("answer")
            if rng.random() < skill and answer is not None:
                return f"{rng.choice(_FILLER)}\nTherefore the answer is {answer}."
            # plausible-but-wrong
            try:
                wrong = float(answer) * rng.choice([0.5, 2, 1.1, 0.9]) + rng.randint(-3, 3)
                wrong = int(wrong) if float(answer).is_integer() else round(wrong, 2)
            except (TypeError, ValueError):
                wrong = rng.randint(1, 99)
            return f"{rng.choice(_FILLER)}\nTherefore the answer is {wrong}."

        if mode == "code":
            canonical = ref.get("canonical_solution") or ref.get("solution")
            if canonical and rng.random() < skill:
                return f"```python\n{canonical}\n```"
            fn = ref.get("entry_point", "solve")
            return f"```python\ndef {fn}(*args, **kwargs):\n    # incomplete attempt\n    return None\n```"

        # open-ended / judge-scored: quality tracks skill via structure + keyword coverage
        keywords = ref.get("keywords") or ref.get("rubric_keywords") or []
        n_kw = int(round(len(keywords) * skill))
        used = rng.sample(keywords, min(n_kw, len(keywords))) if keywords else []
        # Response depth scales ~linearly (continuously) with skill so even close
        # models separate under the judge's quality proxy, while near-equals can still tie.
        target_words = int(15 + skill * 185)
        lines, count = [], 0
        while count < target_words:
            line = rng.choice(_FILLER)
            lines.append(f"- {line}")
            count += len(line.split())
        body = "\n".join(lines)
        cover = (" Key considerations: " + ", ".join(used) + ".") if used else ""
        return f"Here is my analysis.\n{body}{cover}"


class EchoProvider(Provider):
    """Trivial provider that echoes the last user message — handy for pipeline tests."""

    name = "echo"
    keyless = True

    async def _call(self, model_id, messages, *, extra, **kw) -> Completion:  # noqa: ANN001
        last = next((m.content for m in reversed(messages) if m.role == "user"), "")
        text = re.sub(r"\s+", " ", last).strip()
        return Completion(text=text, model_ref=f"{self.name}/{model_id}",
                          prompt_tokens=self.estimate_tokens(last),
                          completion_tokens=self.estimate_tokens(text))
