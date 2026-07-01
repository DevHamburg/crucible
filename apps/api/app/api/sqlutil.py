"""Cross-dialect SQL helpers."""
from __future__ import annotations

from sqlalchemy import case


def bool_num(expr):
    """AVG-safe boolean -> 1.0/0.0.

    PostgreSQL rejects ``CAST(boolean AS double precision)`` (and bool->int), which
    SQLite happily allows. A CASE expression is portable across both.
    """
    return case((expr, 1.0), else_=0.0)
