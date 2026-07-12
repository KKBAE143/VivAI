"""Shared pytest fixtures + environment stubs.

Sets fake credentials BEFORE any backend module imports so `get_settings()`
(pydantic BaseSettings) never needs real keys, and puts `backend/` on sys.path
so `import core...` / `import ai...` resolve when pytest is run from anywhere.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

# --- env stubs (must run at import time, before core.config is imported) ---
os.environ.setdefault("SUPABASE_URL", "http://localhost")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "test-service-role")
os.environ.setdefault("SUPABASE_ANON_KEY", "test-anon")
os.environ.setdefault("GEMINI_API_KEY", "test-gemini")

# backend/ (parent of tests/) on the path so top-level packages import cleanly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FakeTable:
    """Minimal chainable Supabase table stub. Records calls; returns canned data."""

    def __init__(self, rows: list[dict] | None = None):
        self._rows = rows if rows is not None else []
        self.calls: list[tuple] = []

    def _chain(self, name, *args):
        self.calls.append((name, args))
        return self

    # every query-builder method just records and returns self
    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return self
        return method

    def execute(self):
        return SimpleNamespace(data=self._rows)


class FakeSupabase:
    """Returns a FakeTable per table name; lets tests preload rows / inspect calls."""

    def __init__(self):
        self.tables: dict[str, FakeTable] = {}
        self.rpc_calls: list[tuple] = []

    def table(self, name: str) -> FakeTable:
        return self.tables.setdefault(name, FakeTable())

    def preload(self, name: str, rows: list[dict]) -> FakeTable:
        t = FakeTable(rows)
        self.tables[name] = t
        return t

    def rpc(self, name: str, params: dict):
        self.rpc_calls.append((name, params))
        return SimpleNamespace(execute=lambda: SimpleNamespace(data=[]))


@pytest.fixture
def fake_supabase() -> FakeSupabase:
    return FakeSupabase()


@pytest.fixture
def stub_generate_json(monkeypatch):
    """Patch ai.gemini_service.generate_json to return a fixed dict.

    Usage:  stub_generate_json({"overall": 80, ...})
    """

    def _apply(return_value: dict):
        import ai.gemini_service as gs

        monkeypatch.setattr(gs, "generate_json", lambda *a, **k: return_value)
        return return_value

    return _apply
