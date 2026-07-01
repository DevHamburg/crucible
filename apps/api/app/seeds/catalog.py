"""Seed model catalog.

Mock models are the *simulator* fleet (see providers/mock.py): their `skill` and `safety`
knobs make demo leaderboards, arena and safety reports realistic and reproducible with zero
API keys. Real models are seeded inactive-by-key: they work as soon as a key is provided
(server env or in the UI).
"""
from __future__ import annotations

# --- simulator fleet (always usable, no key) ---
MOCK_MODELS = [
    {"ref": "mock/sage-70b", "display_name": "Sage 70B (sim)", "family": "sage",
     "meta": {"skill": 0.87, "safety": 0.96}, "context_window": 128000},
    {"ref": "mock/atlas-34b", "display_name": "Atlas 34B (sim)", "family": "atlas",
     "meta": {"skill": 0.75, "safety": 0.9}, "context_window": 64000},
    {"ref": "mock/nova-8b", "display_name": "Nova 8B (sim)", "family": "nova",
     "meta": {"skill": 0.6, "safety": 0.82}, "context_window": 32000},
    {"ref": "mock/pixie-3b", "display_name": "Pixie 3B (sim)", "family": "pixie",
     "meta": {"skill": 0.44, "safety": 0.72}, "context_window": 16000},
    {"ref": "mock/rogue-13b", "display_name": "Rogue 13B (sim)", "family": "rogue",
     "meta": {"skill": 0.68, "safety": 0.4}, "context_window": 32000,
     "tags": ["weak-safety-demo"]},
    {"ref": "mock/judge-pro", "display_name": "Judge-Pro (sim judge)", "family": "judge",
     "meta": {"skill": 0.9, "safety": 0.95, "role": "judge"}, "context_window": 128000},
    {"ref": "mock/redteam-adaptive", "display_name": "RedTeam-Adaptive (sim attacker)",
     "family": "redteam", "meta": {"skill": 0.8, "role": "attacker"}, "context_window": 32000},
]

# --- real models (need a key; pricing per 1M tokens) ---
# (input_price, output_price) taken from app/observability/cost.py PRICING at seed time.
REAL_MODELS = [
    {"ref": "openai/gpt-4o", "display_name": "GPT-4o", "family": "gpt-4", "provider": "openai"},
    {"ref": "openai/gpt-4o-mini", "display_name": "GPT-4o mini", "family": "gpt-4", "provider": "openai"},
    {"ref": "openai/o4-mini", "display_name": "o4-mini", "family": "o-series", "provider": "openai"},
    {"ref": "anthropic/claude-3-5-sonnet-latest", "display_name": "Claude 3.5 Sonnet",
     "family": "claude-3.5", "provider": "anthropic"},
    {"ref": "anthropic/claude-3-5-haiku-latest", "display_name": "Claude 3.5 Haiku",
     "family": "claude-3.5", "provider": "anthropic"},
    {"ref": "anthropic/claude-sonnet-4-latest", "display_name": "Claude Sonnet 4",
     "family": "claude-4", "provider": "anthropic"},
    {"ref": "google/gemini-2.5-pro", "display_name": "Gemini 2.5 Pro", "family": "gemini-2.5",
     "provider": "google"},
    {"ref": "google/gemini-2.5-flash", "display_name": "Gemini 2.5 Flash", "family": "gemini-2.5",
     "provider": "google"},
    {"ref": "deepseek/deepseek-chat", "display_name": "DeepSeek V3", "family": "deepseek",
     "provider": "deepseek", "is_open_weight": True},
    {"ref": "deepseek/deepseek-reasoner", "display_name": "DeepSeek R1", "family": "deepseek",
     "provider": "deepseek", "is_open_weight": True},
    {"ref": "mistral/mistral-large-latest", "display_name": "Mistral Large", "family": "mistral",
     "provider": "mistral", "is_open_weight": True},
    {"ref": "groq/llama-3.3-70b-versatile", "display_name": "Llama 3.3 70B (Groq)",
     "family": "llama-3", "provider": "groq", "is_open_weight": True},
    {"ref": "openrouter/meta-llama/llama-3.3-70b-instruct", "display_name": "Llama 3.3 70B",
     "family": "llama-3", "provider": "openrouter", "is_open_weight": True},
    {"ref": "openrouter/qwen/qwen-2.5-72b-instruct", "display_name": "Qwen 2.5 72B",
     "family": "qwen", "provider": "openrouter", "is_open_weight": True},
]
