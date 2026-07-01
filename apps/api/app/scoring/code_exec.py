"""Execution-based scoring for coding tasks (HumanEval/MBPP-style).

⚠️ SECURITY: this runs model-generated code. It uses a locked-down subprocess (CPU/memory
rlimits, wall-clock timeout, temp cwd). For untrusted multi-user hosting, run the arq
WORKER inside the Docker container (compose `worker` service) which adds OS-level isolation;
never expose raw execution to anonymous users on a shared host without the container.
"""
from __future__ import annotations

import asyncio
import math
import os
import sys
import tempfile
import textwrap

from app.scoring.base import ScoreResult, ScoringContext, extract_code, register_scorer

_HARNESS_TIMEOUT = 8.0


def _limits():  # pragma: no cover - platform specific
    try:
        import resource

        # 8s CPU, 512MB address space, no core dumps
        resource.setrlimit(resource.RLIMIT_CPU, (8, 8))
        resource.setrlimit(resource.RLIMIT_AS, (512 * 1024 * 1024, 512 * 1024 * 1024))
        resource.setrlimit(resource.RLIMIT_CORE, (0, 0))
    except Exception:
        pass


async def run_program(source: str, timeout: float = _HARNESS_TIMEOUT) -> tuple[bool, str]:
    """Run a self-contained Python program; return (passed, stderr_tail)."""
    with tempfile.TemporaryDirectory() as tmp:
        path = os.path.join(tmp, "prog.py")
        with open(path, "w") as fh:
            fh.write(source)
        try:
            preexec = _limits if os.name == "posix" else None
            proc = await asyncio.create_subprocess_exec(
                sys.executable,
                "-I",  # isolated mode: ignore env/user site
                path,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                cwd=tmp,
                preexec_fn=preexec,
                env={"PATH": "/usr/bin:/bin", "PYTHONHASHSEED": "0"},
            )
        except Exception as exc:  # noqa: BLE001
            return False, f"spawn error: {exc}"
        try:
            _out, err = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            return False, "timeout"
        ok = proc.returncode == 0
        return ok, (err.decode(errors="replace")[-500:] if err else "")


def build_program(response: str, reference: dict) -> str:
    code = extract_code(response)
    prefix = reference.get("prompt_prefix", "")  # e.g. HumanEval signature, if body-only
    test = reference.get("test", "")
    entry = reference.get("entry_point", "")
    # Explicit call wins; else HumanEval-style `def check(candidate)` -> call check(entry).
    call = reference.get("call") or ""
    if not call and entry and "def check" in test:
        call = f"check({entry})"
    parts = [p for p in [prefix, code, test] if p]
    program = "\n\n".join(parts)
    if call:
        program += "\n\n" + call + "\n"
    return program


@register_scorer("code_exec")
async def code_exec(response: str, reference: dict, config: dict, ctx: ScoringContext) -> ScoreResult:
    program = build_program(response, reference)
    passed, err = await run_program(program, timeout=float(config.get("timeout", _HARNESS_TIMEOUT)))
    rationale = "all tests passed" if passed else f"failed: {textwrap.shorten(err, 180)}"
    return ScoreResult(1.0 if passed else 0.0, passed, rationale, raw={"stderr": err})


def pass_at_k(n: int, c: int, k: int) -> float:
    """Unbiased pass@k estimator (Chen et al. 2021). n samples, c correct."""
    if n - c < k:
        return 1.0
    return 1.0 - math.prod((n - c - i) / (n - i) for i in range(k))
