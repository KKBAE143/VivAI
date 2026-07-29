"""Who may read a Team Viva session and its marks.

`GET /team-viva/sessions/{id}` and `GET /team-viva/{id}/report` used to require
only a valid token: any authenticated user could read any team's assessment
record, and the report handler did not even load the session, so an unknown id
returned an empty report while a real one returned real marks. The WebSocket
checked membership properly all along — the two paths were allowed to disagree,
which is why they now share `_access_role`.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from api import team_live


ASSESSED = {
    "id": "s1",
    "profile_id": "faculty-1",
    "session_type": "TeamViva",
    "context": {"team_id": "t1", "institution_id": "inst-1"},
}
PRACTICE = {
    "id": "s2",
    "profile_id": "student-1",
    "session_type": "TeamViva",
    "context": {"team_id": "t1"},
}


@pytest.fixture
def members(monkeypatch):
    """Team t1 = student-1, student-2. Nobody else."""
    roster = {("t1", "student-1"), ("t1", "student-2")}
    monkeypatch.setattr(
        team_live,
        "_membership",
        lambda team_id, profile_id: {"role": "Member"} if (team_id, profile_id) in roster else None,
    )
    return roster


def student(institution: str | None = None) -> dict:
    return {"role": "student", "institution_id": institution}


def faculty(institution: str | None) -> dict:
    return {"role": "faculty", "institution_id": institution}


# --------------------------------------------------------------------------- #
# Participants
# --------------------------------------------------------------------------- #
def test_a_team_member_is_a_participant(members):
    assert team_live._access_role(ASSESSED, "student-1", student()) == "participant"


def test_a_stranger_has_no_access(members):
    assert team_live._access_role(ASSESSED, "student-9", student()) is None


def test_sharing_an_institution_is_not_access(members):
    """The bug this closes: a classmate is in the same institution as the viva
    and must still not be able to read another team's marks."""
    assert team_live._access_role(ASSESSED, "student-9", student("inst-1")) is None


def test_a_session_with_no_team_admits_nobody_as_a_participant(members):
    assert team_live._access_role({"context": {}}, "student-1", student()) is None


# --------------------------------------------------------------------------- #
# Faculty observers
# --------------------------------------------------------------------------- #
def test_faculty_of_the_scheduling_institution_is_an_observer(members):
    assert team_live._access_role(ASSESSED, "faculty-1", faculty("inst-1")) == "observer"


def test_an_admin_is_an_observer_too(members):
    role = team_live._access_role(ASSESSED, "hod-1", {"role": "admin", "institution_id": "inst-1"})
    assert role == "observer"


def test_faculty_from_another_institution_is_refused(members):
    assert team_live._access_role(ASSESSED, "faculty-2", faculty("inst-2")) is None


def test_faculty_cannot_walk_into_a_practice_session(members):
    """A practice viva records no institution, so no faculty authority exists
    over it — students practising are not being assessed."""
    assert team_live._access_role(PRACTICE, "faculty-1", faculty("inst-1")) is None


def test_faculty_with_no_institution_is_refused(members):
    assert team_live._access_role(ASSESSED, "faculty-3", faculty(None)) is None


def test_a_missing_profile_is_refused_rather_than_crashing(members):
    """WebSocket routes look the profile up separately and can get nothing."""
    assert team_live._access_role(ASSESSED, "ghost", None) is None


def test_membership_wins_over_the_observer_branch(members):
    """A faculty member who is also on the team is examined like anyone else —
    otherwise they would silently escape the participant slot accounting."""
    assert team_live._access_role(ASSESSED, "student-2", faculty("inst-1")) == "participant"


# --------------------------------------------------------------------------- #
# The gate itself
# --------------------------------------------------------------------------- #
def test_the_gate_raises_403_for_an_outsider(members):
    with pytest.raises(HTTPException) as exc:
        team_live._require_session_access(ASSESSED, {"id": "student-9", "profile": student()})
    assert exc.value.status_code == 403


def test_the_gate_returns_the_role_for_an_insider(members):
    role = team_live._require_session_access(ASSESSED, {"id": "student-1", "profile": student()})
    assert role == "participant"
