from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from api import teams


class _Result:
    def __init__(self, data):
        self.data = data


class _CreateTable:
    def __init__(self, name: str, events: list[tuple]):
        self.name = name
        self.events = events
        self.operation = ""
        self.payload = None

    def insert(self, payload):
        self.operation, self.payload = "insert", payload
        self.events.append((self.name, "insert", payload))
        return self

    def delete(self):
        self.operation = "delete"
        self.events.append((self.name, "delete"))
        return self

    def eq(self, *_args):
        return self

    def execute(self):
        if self.name == "team_members" and self.operation == "insert":
            raise RuntimeError("membership insert failed")
        if self.name == "teams" and self.operation == "insert":
            return _Result([{"id": "team-1", "name": self.payload["name"]}])
        return _Result([])


class _MissingRpcSupabase:
    def __init__(self):
        self.events: list[tuple] = []

    def rpc(self, *_args):
        raise RuntimeError("Could not find the function create_team_with_lead")

    def table(self, name):
        return _CreateTable(name, self.events)


def test_create_team_rolls_back_if_legacy_membership_insert_fails(monkeypatch):
    sb = _MissingRpcSupabase()
    monkeypatch.setattr(teams, "get_supabase", lambda: sb)
    monkeypatch.setattr(teams, "log_activity", lambda *_args: None)

    with pytest.raises(HTTPException) as raised:
        teams.create_team(teams.TeamCreate(name="Capstone"), {"id": "profile-1"})

    assert raised.value.status_code == 500
    assert "rolled back" in raised.value.detail
    assert ("teams", "delete") in sb.events


class _ListTable:
    def __init__(self, name: str, sb):
        self.name = name
        self.sb = sb
        self.operation = ""
        self.filters: list[tuple] = []

    def select(self, *_args):
        return self

    def eq(self, key, value):
        self.filters.append((key, value))
        return self

    def in_(self, key, values):
        self.filters.append((key, tuple(values)))
        return self

    def insert(self, payload):
        self.operation = "insert"
        self.sb.inserts.append(payload)
        return self

    def execute(self):
        if self.name == "team_members" and self.operation != "insert":
            return _Result([])
        if self.name == "teams" and ("created_by", "profile-1") in self.filters:
            return _Result([{"id": "orphan-team", "name": "Historical team"}])
        return _Result([])


class _ListSupabase:
    def __init__(self):
        self.inserts: list[dict] = []

    def table(self, name):
        return _ListTable(name, self)


def test_list_teams_self_heals_creator_team_without_membership(monkeypatch):
    sb = _ListSupabase()
    monkeypatch.setattr(teams, "get_supabase", lambda: sb)

    result = teams.list_teams({"id": "profile-1"})

    assert result == [{"id": "orphan-team", "name": "Historical team"}]
    assert sb.inserts == [{"team_id": "orphan-team", "profile_id": "profile-1", "role": "Lead"}]
