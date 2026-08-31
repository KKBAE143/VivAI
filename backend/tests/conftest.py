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
# Diagnostics capture writes into <repo>/diagnostics/. Tests deliberately raise
# exceptions, so leaving it on would fill the developer's real sink with
# synthetic failures and make a genuine report unreadable. Tests that exercise
# the sink construct their own under tmp_path.
os.environ.setdefault("DIAGNOSTICS_ENABLED", "false")

# backend/ (parent of tests/) on the path so top-level packages import cleanly.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))


class FakeTable:
    """Minimal chainable Supabase table stub. Records calls; returns canned data."""

    def __init__(self, rows: list[dict] | None = None):
        self._rows = rows if rows is not None else []
        self.calls: list[tuple] = []
        # Payloads written through this table, so a test can assert on what the
        # code under test actually persisted rather than only that it tried.
        self.inserts: list[dict] = []
        self.updates: list[dict] = []
        self._pending: list[dict] | None = None

    def _chain(self, name, *args):
        self.calls.append((name, args))
        return self

    # every query-builder method just records and returns self
    def __getattr__(self, name):
        def method(*args, **kwargs):
            self.calls.append((name, args, kwargs))
            return self
        return method

    def insert(self, payload, *args, **kwargs):
        """Record the payload and echo it back, the way PostgREST does.

        Real Supabase returns the inserted row (with server-generated columns),
        and callers legitimately read `.execute().data[0]["id"]`. Returning the
        preloaded rows instead would make those callers fail for a reason that
        has nothing to do with the code under test.
        """
        self.calls.append(("insert", (payload,), kwargs))
        rows = payload if isinstance(payload, list) else [payload]
        echoed = []
        for row in rows:
            self.inserts.append(row)
            echoed.append({"id": f"fake_{len(self.inserts)}", **row})
        self._pending = echoed
        return self

    def update(self, payload, *args, **kwargs):
        self.calls.append(("update", (payload,), kwargs))
        self.updates.append(payload)
        return self

    def execute(self):
        pending, self._pending = self._pending, None
        return SimpleNamespace(data=pending if pending is not None else self._rows)


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


@pytest.fixture
def live_harness(monkeypatch, fake_supabase):
    """Drive the real `live_ws` handler against fakes, capturing each Gemini config.

    Lives here rather than in one test module because several suites now exercise
    the live session end to end — the reconnect supervisor, the automatic ending,
    and the vision observer all need the same setup, and duplicating it would let
    the copies drift apart.

    Call the yielded function with the list of `FakeGeminiSession`s the test
    scripts; connecting more times than that is an assertion failure, which is how a
    reconnect bug shows up as a test failure rather than as a hang.
    """
    import contextlib

    from api import live as live_api

    live_api._active_live_owners.clear()
    fake_supabase.preload("viva_sessions", [{"id": "s1", "profile_id": "u1", "persona": "balanced",
                                             "language": "English", "subject": "DBMS",
                                             "session_type": "Subject", "context": {}}])
    fake_supabase.preload("viva_questions", [])
    monkeypatch.setattr(live_api, "get_supabase", lambda: fake_supabase)
    monkeypatch.setattr(live_api, "user_from_token", lambda t: {"id": "u1", "name": "Asha"})
    monkeypatch.setattr(live_api, "_project_context", lambda pid, user_id=None: "")
    monkeypatch.setattr(live_api, "log_activity", lambda *a, **k: None)
    monkeypatch.setattr(live_api.gamification_service, "award_xp", lambda *a, **k: None)

    state = SimpleNamespace(sessions=[], configs=[])

    def install(sessions: list):
        state.sessions = list(sessions)
        pending = list(sessions)

        @contextlib.asynccontextmanager
        async def fake_connect(config):
            state.configs.append(config)
            if not pending:
                raise AssertionError("connected more times than the test scripted")
            yield pending.pop(0)

        monkeypatch.setattr(live_api.live_service, "connect_with_fallback", fake_connect)
        return state

    yield install
    live_api._active_live_owners.clear()
