"""WS0 regression coverage for viva-session creation."""
from __future__ import annotations

from types import SimpleNamespace

import pytest

from api import viva
from models.schemas import VivaSessionCreate


class _RecordingTable:
    def __init__(self) -> None:
        self.payloads: list[dict] = []

    def insert(self, payload: dict):
        self.payloads.append(payload)
        return self

    def execute(self):
        return SimpleNamespace(data=[{"id": "session-1", **self.payloads[-1]}])


class _RecordingSupabase:
    def __init__(self) -> None:
        self.viva_sessions = _RecordingTable()

    def table(self, name: str) -> _RecordingTable:
        assert name == "viva_sessions"
        return self.viva_sessions


def _body(**overrides) -> VivaSessionCreate:
    return VivaSessionCreate(
        subject="Data Structures",
        duration_minutes=15,
        difficulty="Medium",
        **overrides,
    )


def test_create_session_normalizes_language_before_insert(monkeypatch):
    supabase = _RecordingSupabase()
    monkeypatch.setattr(viva, "get_supabase", lambda: supabase)

    created = viva.create_session(_body(language="  telugu "), {"id": "profile-1"})

    assert created["id"] == "session-1"
    assert supabase.viva_sessions.payloads == [
        {
            "profile_id": "profile-1",
            "project_id": None,
            "session_type": "Subject",
            "subject": "Data Structures",
            "duration_minutes": 15,
            "difficulty": "Medium",
            "language": "Telugu",
            "persona": "balanced",
        }
    ]


def test_create_session_does_not_hide_a_failed_persona_insert(monkeypatch):
    class FailingTable:
        def __init__(self) -> None:
            self.insert_calls = 0

        def insert(self, payload: dict):
            self.insert_calls += 1
            raise RuntimeError("column persona does not exist")

    table = FailingTable()
    monkeypatch.setattr(viva, "get_supabase", lambda: SimpleNamespace(table=lambda _name: table))

    with pytest.raises(RuntimeError, match="persona"):
        viva.create_session(_body(), {"id": "profile-1"})

    assert table.insert_calls == 1
