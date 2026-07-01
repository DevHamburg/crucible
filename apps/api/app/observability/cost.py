"""Cost + pricing. Prices are USD per 1,000,000 tokens (input, output), seeded in the
spirit of LiteLLM's `model_prices_and_context_window.json` (MIT). `ModelCatalog` rows can
override these; unknown models default to 0 (e.g. mock/local)."""
from __future__ import annotations

# ref -> (input_per_mtok, output_per_mtok, context_window)
PRICING: dict[str, tuple[float, float, int]] = {
    # OpenAI
    "openai/gpt-4o": (2.5, 10.0, 128_000),
    "openai/gpt-4o-mini": (0.15, 0.6, 128_000),
    "openai/gpt-4.1": (2.0, 8.0, 1_000_000),
    "openai/gpt-4.1-mini": (0.4, 1.6, 1_000_000),
    "openai/o3": (2.0, 8.0, 200_000),
    "openai/o4-mini": (1.1, 4.4, 200_000),
    # Anthropic
    "anthropic/claude-3-5-sonnet-latest": (3.0, 15.0, 200_000),
    "anthropic/claude-3-5-haiku-latest": (0.8, 4.0, 200_000),
    "anthropic/claude-3-7-sonnet-latest": (3.0, 15.0, 200_000),
    "anthropic/claude-opus-4-latest": (15.0, 75.0, 200_000),
    "anthropic/claude-sonnet-4-latest": (3.0, 15.0, 200_000),
    # Google
    "google/gemini-2.5-pro": (1.25, 10.0, 1_000_000),
    "google/gemini-2.5-flash": (0.3, 2.5, 1_000_000),
    "google/gemini-2.0-flash": (0.1, 0.4, 1_000_000),
    # Mistral / Groq / DeepSeek / Together (representative)
    "mistral/mistral-large-latest": (2.0, 6.0, 128_000),
    "mistral/mistral-small-latest": (0.2, 0.6, 128_000),
    "deepseek/deepseek-chat": (0.27, 1.1, 64_000),
    "deepseek/deepseek-reasoner": (0.55, 2.19, 64_000),
    "groq/llama-3.3-70b-versatile": (0.59, 0.79, 128_000),
    # Open weight via OpenRouter (representative)
    "openrouter/meta-llama/llama-3.3-70b-instruct": (0.12, 0.3, 128_000),
    "openrouter/qwen/qwen-2.5-72b-instruct": (0.12, 0.39, 32_000),
}


def price_for(model_ref: str) -> tuple[float, float, int]:
    """Return (input_per_mtok, output_per_mtok, context) for a ref; 0 cost if unknown."""
    if model_ref in PRICING:
        return PRICING[model_ref]
    # try provider-stripped openrouter passthrough (openrouter/<vendor>/<model>)
    return (0.0, 0.0, 8192)


def compute_cost(
    prompt_tokens: int,
    completion_tokens: int,
    input_per_mtok: float,
    output_per_mtok: float,
) -> float:
    return round(
        prompt_tokens / 1_000_000 * input_per_mtok
        + completion_tokens / 1_000_000 * output_per_mtok,
        6,
    )
