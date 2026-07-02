"""Test bootstrap.

Point every test at an isolated throwaway SQLite file *before* app modules import
(the async engine is built at import time from settings), so tests never touch the
developer's real ``var/crucible.db`` and start from a clean schema.
"""
from __future__ import annotations

import os
import tempfile
from pathlib import Path

_TEST_DB = Path(tempfile.gettempdir()) / "crucible_test.db"
if _TEST_DB.exists():
    _TEST_DB.unlink()
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{_TEST_DB}"
