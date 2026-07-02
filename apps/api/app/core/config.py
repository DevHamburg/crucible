"""Central configuration. Everything has a safe local default so the stack runs
without Docker, Postgres, Redis, or any API key (falls back to SQLite + the
built-in mock provider)."""
from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict

# repo root: apps/api/app/core/config.py -> parents[3] == repo root
API_ROOT = Path(__file__).resolve().parents[2]
REPO_ROOT = API_ROOT.parent.parent
DATA_DIR = API_ROOT / "var"
DATA_DIR.mkdir(exist_ok=True)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=(REPO_ROOT / ".env", API_ROOT / ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # ---- core ----
    crucible_env: str = "development"
    secret_key: str = "dev-insecure-secret-change-me-please-32b+"
    encryption_key: str = ""  # Fernet key; auto-generated for dev if empty

    # ---- database ----
    database_url: str = ""  # empty -> local sqlite file
    db_pool_size: int = 10          # (postgres only) base pooled connections
    db_max_overflow: int = 20       # (postgres only) burst headroom for concurrent SSE streams

    # ---- queue / cache ----
    redis_url: str = ""
    use_task_queue: bool = False

    # ---- auth ----
    access_token_expire_minutes: int = 10080
    allow_anonymous: bool = True
    first_admin_email: str = "admin@crucible.local"
    first_admin_password: str = "admin"

    # ---- cors ----
    frontend_origin: str = "http://localhost:3000"

    # ---- limits ----
    max_concurrency: int = 8
    global_run_budget_usd: float = 25.0
    request_timeout_s: int = 120

    # ---- provider keys (server-level fallback) ----
    openrouter_api_key: str = ""
    openai_api_key: str = ""
    anthropic_api_key: str = ""
    google_api_key: str = ""
    mistral_api_key: str = ""
    groq_api_key: str = ""
    ollama_base_url: str = "http://localhost:11434"

    # ---- judge / red-team defaults ----
    judge_model: str = "mock/judge-pro"
    redteam_attacker_model: str = "mock/redteam-adaptive"

    # ---- frontend ----
    next_public_api_url: str = "http://localhost:8000"

    @property
    def effective_database_url(self) -> str:
        if self.database_url:
            return self.database_url
        return f"sqlite+aiosqlite:///{DATA_DIR / 'crucible.db'}"

    @property
    def is_sqlite(self) -> bool:
        return self.effective_database_url.startswith("sqlite")

    @property
    def cors_origins(self) -> list[str]:
        origins = {self.frontend_origin, "http://localhost:3000", "http://127.0.0.1:3000"}
        return [o for o in origins if o]

    def server_key_for(self, provider: str) -> str:
        return {
            "openrouter": self.openrouter_api_key,
            "openai": self.openai_api_key,
            "anthropic": self.anthropic_api_key,
            "google": self.google_api_key,
            "mistral": self.mistral_api_key,
            "groq": self.groq_api_key,
        }.get(provider, "")


@lru_cache
def get_settings() -> Settings:
    s = Settings()
    prod = s.crucible_env.lower() == "production"
    if not s.encryption_key:
        if prod:
            # A per-process auto-generated key is disastrous with separate api/worker
            # containers (or --workers >1): each gets a different Fernet key, so stored
            # provider keys become undecryptable. Refuse to start instead of silently
            # corrupting them.
            raise RuntimeError(
                "ENCRYPTION_KEY must be set in production. Generate one with: "
                'python -c "from cryptography.fernet import Fernet; '
                'print(Fernet.generate_key().decode())"'
            )
        # Auto-provision a persistent key for zero-config dev (persisted to var/).
        key_file = DATA_DIR / ".fernet_key"
        if key_file.exists():
            s.encryption_key = key_file.read_text().strip()
        else:
            from cryptography.fernet import Fernet

            s.encryption_key = Fernet.generate_key().decode()
            key_file.write_text(s.encryption_key)
            os.chmod(key_file, 0o600)
    if prod and s.secret_key == "dev-insecure-secret-change-me-please-32b+":
        raise RuntimeError("SECRET_KEY must be set to a strong secret in production.")
    return s


settings = get_settings()
