"""Faculty console endpoints.

The load-bearing assertions here are the 403 boundaries. Three separate ways a
caller must be refused — unapproved role, wrong institution, and a student's own
practice session — and an untested authorization check is exactly the kind of
thing that silently does not work.
"""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from api import faculty as faculty_api
from core import deps
from models.schemas import AssessedVivaCreate, SessionReview
from services import faculty_service


FACULTY = {"id": "f1", "profile": {"role": "faculty", "institution_id": "inst-1"}}
OTHER_FACULTY = {"id": "f9", "profile": {"role": "faculty", "institution_id": "inst-2"}}


def _assessed_session(session_id="s1", status="Completed", score=70, context_extra=None):
    context = faculty_service.build_assessed_context(
        team_id="t1", faculty_id="f1", institution_id="inst-1"
    )
    context.update(context_extra or {})
    return {
        "id": session_id,
        "profile_id": "f1",
        "session_type": "TeamViva",
        "subject": "DBMS",
        "status": status,
        "score": score,
        "created_at": "2026-07-29T05:00:00Z",
        "completed_at": "2026-07-29T05:30:00Z",
        "join_code": "abcd1234",
        "context": context,
    }


@pytest.fixture
def faculty_sb(monkeypatch, fake_supabase):
    monkeypatch.setattr(faculty_api, "get_supabase", lambda: fake_supabase)
    return fake_supabase


# --------------------------------------------------------------------------- #
# require_faculty gate
# --------------------------------------------------------------------------- #
def test_a_student_is_refused_the_faculty_console():
    with pytest.raises(HTTPException) as exc:
        deps.require_faculty({"id": "s1", "profile": {"role": "student", "institution_id": "inst-1"}})
    assert exc.value.status_code == 403
    assert exc.value.detail["error"] == "faculty_required"


def test_an_unapproved_faculty_claim_is_still_a_student_here():
    """The approval gate has to hold at the console door too, not just at signup."""
    with pytest.raises(HTTPException) as exc:
        deps.require_faculty({
            "id": "u1",
            "profile": {"role": "student", "institution_id": "inst-1", "requested_role": "faculty"},
        })
    assert exc.value.status_code == 403


def test_faculty_without_an_institution_is_refused():
    with pytest.raises(HTTPException) as exc:
        deps.require_faculty({"id": "f1", "profile": {"role": "faculty", "institution_id": None}})
    assert exc.value.detail["error"] == "no_institution"


def test_faculty_and_admin_both_pass():
    assert deps.require_faculty(FACULTY)["id"] == "f1"
    admin = {"id": "a1", "profile": {"role": "admin", "institution_id": "inst-1"}}
    assert deps.require_faculty(admin)["id"] == "a1"


# --------------------------------------------------------------------------- #
# Dashboard
# --------------------------------------------------------------------------- #
def test_the_dashboard_summarizes_and_names_teams(faculty_sb):
    faculty_sb.preload("viva_sessions", [
        _assessed_session("s1", status="Completed"),
        _assessed_session("s2", status="Pending"),
    ])
    faculty_sb.preload("teams", [{"id": "t1", "name": "Team Alpha"}])

    out = faculty_api.faculty_dashboard(user=FACULTY)

    assert out["summary"]["total"] == 2
    assert out["summary"]["completed"] == 1
    assert out["summary"]["scheduled"] == 1
    # A completed viva nobody signed off is work still owed to students.
    assert out["summary"]["awaiting_review"] == 1
    assert out["sessions"][0]["team_name"] == "Team Alpha"
    assert out["sessions"][0]["join_code"] == "abcd1234"


def test_the_dashboard_excludes_student_practice_sessions(faculty_sb):
    """Defence in depth: the JSONB institution filter is not the only guard."""
    practice = {
        "id": "p1", "session_type": "TeamViva", "status": "Completed",
        "context": {"team_id": "t1"},  # no `assessed` flag
    }
    faculty_sb.preload("viva_sessions", [practice, _assessed_session("s1")])
    faculty_sb.preload("teams", [{"id": "t1", "name": "Team Alpha"}])

    out = faculty_api.faculty_dashboard(user=FACULTY)

    ids = [s["id"] for s in out["sessions"]]
    assert ids == ["s1"], "a student's own rehearsal is not institutional data"


def test_the_dashboard_is_empty_not_broken_for_a_new_faculty(faculty_sb):
    faculty_sb.preload("viva_sessions", [])
    out = faculty_api.faculty_dashboard(user=FACULTY)
    assert out["sessions"] == []
    assert out["summary"]["total"] == 0


def test_faculty_with_no_institution_cannot_load_the_dashboard(faculty_sb):
    with pytest.raises(HTTPException) as exc:
        faculty_api.faculty_dashboard(
            user={"id": "f1", "profile": {"role": "faculty", "institution_id": None}}
        )
    assert exc.value.status_code == 403


# --------------------------------------------------------------------------- #
# Scheduling an assessed viva
# --------------------------------------------------------------------------- #
def test_scheduling_records_the_authority_that_makes_marks_defensible(faculty_sb):
    faculty_sb.preload("teams", [{"id": "t1", "name": "Team Alpha"}])
    faculty_sb.preload("viva_sessions", [])

    out = faculty_api.create_assessed_viva(
        AssessedVivaCreate(team_id="t1", subject="DBMS"), user=FACULTY
    )

    assert out["join_code"]
    assert out["team_name"] == "Team Alpha"
    written = faculty_sb.table("viva_sessions").inserts[-1]
    assert written["session_type"] == "TeamViva"
    assert written["status"] == "Pending"
    context = written["context"]
    assert context["assessed"] is True
    assert context["faculty_id"] == "f1"
    assert context["institution_id"] == "inst-1"
    assert context["team_id"] == "t1"


def test_scheduling_for_a_team_that_does_not_exist_is_a_404(faculty_sb):
    faculty_sb.preload("teams", [])
    with pytest.raises(HTTPException) as exc:
        faculty_api.create_assessed_viva(AssessedVivaCreate(team_id="nope"), user=FACULTY)
    assert exc.value.status_code == 404
    assert faculty_sb.table("viva_sessions").inserts == []


def test_duration_is_bounded_so_one_session_cannot_run_all_day():
    # An unbounded duration would let a single viva hold a Gemini connection
    # indefinitely, which is a cost and a capacity problem.
    with pytest.raises(ValueError):
        AssessedVivaCreate(team_id="t1", duration_minutes=600)
    with pytest.raises(ValueError):
        AssessedVivaCreate(team_id="t1", duration_minutes=1)
    assert AssessedVivaCreate(team_id="t1").duration_minutes == 20


# --------------------------------------------------------------------------- #
# Reading one session
# --------------------------------------------------------------------------- #
def test_faculty_from_another_institution_cannot_read_a_session(faculty_sb):
    faculty_sb.preload("viva_sessions", [_assessed_session("s1")])
    faculty_sb.preload("viva_questions", [])
    with pytest.raises(HTTPException) as exc:
        faculty_api.get_assessed_session("s1", user=OTHER_FACULTY)
    assert exc.value.status_code == 403


def test_a_colleague_at_the_same_institution_can_read_it(faculty_sb):
    faculty_sb.preload("viva_sessions", [_assessed_session("s1")])
    faculty_sb.preload("viva_questions", [{"id": "q1", "session_id": "s1", "question": "What is 2NF?"}])

    out = faculty_api.get_assessed_session(
        "s1", user={"id": "f2", "profile": {"role": "faculty", "institution_id": "inst-1"}}
    )
    assert out["session"]["id"] == "s1"
    assert len(out["questions"]) == 1


def test_reading_a_practice_session_is_refused(faculty_sb):
    faculty_sb.preload("viva_sessions", [{
        "id": "p1", "session_type": "TeamViva", "status": "Completed",
        "context": {"team_id": "t1"},
    }])
    with pytest.raises(HTTPException) as exc:
        faculty_api.get_assessed_session("p1", user=FACULTY)
    assert exc.value.status_code == 403


def test_a_missing_session_is_a_404(faculty_sb):
    faculty_sb.preload("viva_sessions", [])
    with pytest.raises(HTTPException) as exc:
        faculty_api.get_assessed_session("gone", user=FACULTY)
    assert exc.value.status_code == 404


# --------------------------------------------------------------------------- #
# Sign-off
# --------------------------------------------------------------------------- #
def test_signing_off_stamps_who_reviewed_it_and_when(faculty_sb):
    faculty_sb.preload("viva_sessions", [_assessed_session("s1", status="Completed")])

    out = faculty_api.review_assessed_session("s1", SessionReview(note="Solid defence."), user=FACULTY)

    assert out["ok"] is True
    assert out["score_overridden"] is False
    written = faculty_sb.table("viva_sessions").updates[-1]
    assert written["context"]["reviewed_by"] == "f1"
    assert written["context"]["reviewed_at"]
    assert written["context"]["faculty_note"] == "Solid defence."
    # No override requested, so the score column is left alone.
    assert "score" not in written


def test_an_override_preserves_the_ai_score_so_it_is_auditable(faculty_sb):
    faculty_sb.preload("viva_sessions", [_assessed_session("s1", status="Completed", score=62)])

    out = faculty_api.review_assessed_session("s1", SessionReview(score_override=78), user=FACULTY)

    assert out["score"] == 78
    assert out["score_overridden"] is True
    written = faculty_sb.table("viva_sessions").updates[-1]
    assert written["score"] == 78
    # The model's original number survives — an override must not be silent.
    assert written["context"]["ai_score"] == 62
    assert written["context"]["score_overridden"] is True


def test_an_unfinished_viva_cannot_be_signed_off(faculty_sb):
    faculty_sb.preload("viva_sessions", [_assessed_session("s1", status="In Progress")])
    with pytest.raises(HTTPException) as exc:
        faculty_api.review_assessed_session("s1", SessionReview(), user=FACULTY)
    assert exc.value.status_code == 409
    assert faculty_sb.table("viva_sessions").updates == []


def test_faculty_from_another_institution_cannot_sign_off(faculty_sb):
    faculty_sb.preload("viva_sessions", [_assessed_session("s1", status="Completed")])
    with pytest.raises(HTTPException) as exc:
        faculty_api.review_assessed_session("s1", SessionReview(score_override=100), user=OTHER_FACULTY)
    assert exc.value.status_code == 403
    assert faculty_sb.table("viva_sessions").updates == []


def test_an_override_outside_zero_to_hundred_is_rejected():
    for bad in (-1, 101, 1000):
        with pytest.raises(ValueError):
            SessionReview(score_override=bad)
