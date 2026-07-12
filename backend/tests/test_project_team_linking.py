"""Coverage for the project<->team linking core: permission gating and the
shared activate_link() side effects (single source of truth for the write)."""
from __future__ import annotations

from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from api import project_team, teams as teams_api


class _Result:
    def __init__(self, data):
        self.data = data


class _Table:
    """Minimal per-table fake supporting the specific chains this module uses."""

    def __init__(self, rows, on_execute=None):
        self.rows = rows
        self.filters: dict = {}
        self.updated: list[dict] = []
        self._on_execute = on_execute

    def select(self, *_a):
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def neq(self, key, value):
        self.filters[f"not_{key}"] = value
        return self

    def update(self, payload):
        self._pending_update = payload
        return self

    def insert(self, payload):
        row = {"id": f"generated-{len(self.rows) + 1}", "status": "pending", **payload}
        self._pending_insert = row
        return self

    def _matching(self):
        return [
            r for r in self.rows
            if all(r.get(k) == v for k, v in self.filters.items() if not k.startswith("not_"))
            and all(r.get(k[4:]) != v for k, v in self.filters.items() if k.startswith("not_"))
        ]

    def execute(self):
        if self._on_execute:
            return self._on_execute(self)
        inserted = getattr(self, "_pending_insert", None)
        if inserted is not None:
            self.rows.append(inserted)
            self._pending_insert = None
            self.filters = {}
            return _Result([inserted])
        matched = self._matching()
        pending = getattr(self, "_pending_update", None)
        if pending is not None:
            # Snapshot the fully-built filter chain (eq/neq are applied AFTER
            # .update() in real query builders) at execution time, not when
            # .update() was first called.
            self.updated.append({**self.filters, "payload": pending})
            for row in matched:
                row.update(pending)
            self._pending_update = None
        self.filters = {}
        return _Result(matched)


class _FakeSupabase:
    def __init__(self, tables: dict[str, list[dict]]):
        self._tables = {name: _Table(rows) for name, rows in tables.items()}
        self.activity_inserts: list[dict] = []
        self._tables.setdefault("activity_log", _Table([], on_execute=self._record_activity))

    def _record_activity(self, table):
        # log_activity calls .insert(...).execute() — captured via a thin shim below.
        return _Result([])

    def table(self, name):
        return self._tables[name]


@pytest.fixture
def patched_supabase(monkeypatch):
    def _apply(tables: dict[str, list[dict]]):
        fake = _FakeSupabase(tables)
        # activate_link and project_team both call get_supabase() via their own
        # module references — patch each.
        import services.team_project_service as tps
        import services.activity_service as act_svc

        monkeypatch.setattr(tps, "get_supabase", lambda: fake)
        monkeypatch.setattr(project_team, "get_supabase", lambda: fake)
        monkeypatch.setattr(act_svc, "get_supabase", lambda: fake)
        return fake

    return _apply


def test_activate_link_sets_team_id_and_declines_rival_pending_requests(patched_supabase):
    project = {"id": "p1", "title": "Capstone", "team_id": None}
    team = {"id": "t1", "name": "Alpha"}
    fake = patched_supabase(
        {
            "projects": [project],
            "project_team_requests": [
                {"id": "r1", "project_id": "p1", "team_id": "t2", "status": "pending"},
                {"id": "r2", "project_id": "p1", "team_id": "t1", "status": "pending"},
            ],
        }
    )

    from services.team_project_service import activate_link

    updated = activate_link(project, team, "user-1")

    assert updated["team_id"] == "t1"
    # Only the rival request (t2, not the winning t1) should be declined.
    ptr_updates = fake.table("project_team_requests").updated
    assert any(u["project_id"] == "p1" and u["status"] == "pending" and u["not_team_id"] == "t1" for u in ptr_updates)


def test_link_team_rejects_non_member(monkeypatch, patched_supabase):
    patched_supabase({"projects": [{"id": "p1", "owner_id": "owner-1", "team_id": None}]})
    monkeypatch.setattr(project_team, "require_project_owner", lambda pid, uid: {"id": "p1", "title": "X", "team_id": None})
    monkeypatch.setattr(project_team, "_membership", lambda team_id, uid: None)

    with pytest.raises(HTTPException) as exc:
        project_team.link_team("p1", project_team.LinkTeamRequest(team_id="t1"), {"id": "owner-1"})
    assert exc.value.status_code == 403


def test_unlink_allows_owner_or_linked_team_lead_only(monkeypatch, patched_supabase):
    project = {"id": "p1", "owner_id": "owner-1", "team_id": "t1", "title": "X"}
    fake = patched_supabase({"projects": [project]})
    monkeypatch.setattr(project_team, "_membership", lambda team_id, uid: {"role": "Lead"} if uid == "lead-1" else None)

    # A random third party (not owner, not the linked team's lead) is rejected.
    with pytest.raises(HTTPException) as exc:
        project_team.unlink_team("p1", {"id": "stranger"})
    assert exc.value.status_code == 403

    # The linked team's Lead IS allowed, even though they don't own the project.
    project_team.unlink_team("p1", {"id": "lead-1"})
    assert fake.table("projects").updated[-1]["payload"] == {"team_id": None}


def test_unlink_rejects_when_no_team_linked(monkeypatch, patched_supabase):
    patched_supabase({"projects": [{"id": "p1", "owner_id": "owner-1", "team_id": None}]})
    with pytest.raises(HTTPException) as exc:
        project_team.unlink_team("p1", {"id": "owner-1"})
    assert exc.value.status_code == 400


def test_request_team_link_shortcuts_to_instant_when_already_a_member(monkeypatch, patched_supabase):
    """Entering your own team's invite code should link instantly, not queue
    a pending request that then needs self-approval."""
    fake = patched_supabase(
        {
            "projects": [{"id": "p1", "title": "X", "team_id": None}],
            "teams": [{"id": "t1", "name": "Alpha", "invite_code": "ABC123"}],
            "project_team_requests": [],
        }
    )
    monkeypatch.setattr(project_team, "require_project_owner", lambda pid, uid: {"id": "p1", "title": "X", "team_id": None})
    monkeypatch.setattr(project_team, "_membership", lambda team_id, uid: {"role": "Member"})

    result = project_team.request_team_link(
        "p1", project_team.RequestTeamLinkRequest(invite_code="ABC123"), {"id": "user-1"}
    )

    assert result["team_id"] == "t1"
    # No pending row should have been created for the shortcut path.
    assert fake.table("project_team_requests").rows == []


def test_request_team_link_creates_pending_row_when_not_a_member(monkeypatch, patched_supabase):
    fake = patched_supabase(
        {
            "projects": [{"id": "p1", "title": "X", "team_id": None}],
            "teams": [{"id": "t1", "name": "Alpha", "invite_code": "ABC123"}],
            "project_team_requests": [],
        }
    )
    monkeypatch.setattr(project_team, "require_project_owner", lambda pid, uid: {"id": "p1", "title": "X", "team_id": None})
    monkeypatch.setattr(project_team, "_membership", lambda team_id, uid: None)

    result = project_team.request_team_link(
        "p1", project_team.RequestTeamLinkRequest(invite_code="ABC123"), {"id": "user-1"}
    )

    assert result["status"] == "pending"
    assert result["team_id"] == "t1"
    assert fake.table("projects").rows[0]["team_id"] is None  # not activated


def test_compute_workload_counts_per_member_by_status():
    members = [
        {"profile_id": "u1", "role": "Lead", "profiles": {"full_name": "Asha"}},
        {"profile_id": "u2", "role": "Member", "profiles": {"full_name": "Karthik"}},
    ]
    tasks = [
        {"assignee_id": "u1", "status": "Done"},
        {"assignee_id": "u1", "status": "In Progress"},
        {"assignee_id": "u2", "status": "Review"},
        {"assignee_id": "u2", "status": "Done"},
        {"assignee_id": "u2", "status": "Done"},
        {"assignee_id": None, "status": "To Do"},  # unassigned: excluded from any member's totals
        {"assignee_id": "ghost", "status": "To Do"},  # assignee not on the team: excluded, not crashed
    ]
    workload = {w["profile_id"]: w for w in teams_api.compute_workload(members, tasks)}

    assert workload["u1"]["total"] == 2
    assert workload["u1"]["done"] == 1
    assert workload["u1"]["in_progress"] == 1
    assert workload["u2"]["total"] == 3
    assert workload["u2"]["done"] == 2
    assert workload["u2"]["review"] == 1
    assert set(workload) == {"u1", "u2"}  # no phantom entries for None/ghost assignees
