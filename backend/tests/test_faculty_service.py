"""Faculty assessment logic.

The load-bearing rule here is PRACTICE vs ASSESSED: a student's own rehearsal
must never be readable by faculty, and a graded assessment must never be
readable by faculty from another institution.
"""
from __future__ import annotations

from services import faculty_service as svc


def test_an_assessed_context_records_who_has_authority():
    ctx = svc.build_assessed_context(
        team_id="t1", faculty_id="f1", institution_id="inst-1", project_id="p1"
    )
    assert ctx["assessed"] is True
    assert ctx["team_id"] == "t1"
    assert ctx["faculty_id"] == "f1"
    assert ctx["institution_id"] == "inst-1"
    assert ctx["project_id"] == "p1"


def test_project_id_is_omitted_when_absent_rather_than_stored_as_null():
    ctx = svc.build_assessed_context(team_id="t1", faculty_id="f1", institution_id="inst-1")
    assert "project_id" not in ctx


def test_a_student_practice_session_is_not_assessed():
    assert svc.is_assessed({"context": {"team_id": "t1"}}) is False
    assert svc.is_assessed({}) is False
    assert svc.is_assessed({"context": {"assessed": True}}) is True


def test_faculty_cannot_review_a_student_practice_session():
    """A practice run is the student's own rehearsal, not institutional data."""
    practice = {"context": {"team_id": "t1"}}
    assert svc.can_review({"id": "f1", "role": "faculty", "institution_id": "inst-1"}, practice) is False


def test_the_faculty_who_created_it_can_review_it():
    session = {"context": svc.build_assessed_context(
        team_id="t1", faculty_id="f1", institution_id="inst-1"
    )}
    assert svc.can_review({"id": "f1", "role": "faculty", "institution_id": "inst-1"}, session) is True


def test_a_colleague_at_the_same_institution_can_review_it():
    """Cover for an absent examiner, and let a HOD audit."""
    session = {"context": svc.build_assessed_context(
        team_id="t1", faculty_id="f1", institution_id="inst-1"
    )}
    assert svc.can_review({"id": "f2", "role": "faculty", "institution_id": "inst-1"}, session) is True
    assert svc.can_review({"id": "a1", "role": "admin", "institution_id": "inst-1"}, session) is True


def test_faculty_from_another_institution_cannot_review_it():
    session = {"context": svc.build_assessed_context(
        team_id="t1", faculty_id="f1", institution_id="inst-1"
    )}
    assert svc.can_review({"id": "f9", "role": "faculty", "institution_id": "inst-2"}, session) is False


def test_a_student_can_never_review_even_at_the_same_institution():
    session = {"context": svc.build_assessed_context(
        team_id="t1", faculty_id="f1", institution_id="inst-1"
    )}
    assert svc.can_review({"id": "s1", "role": "student", "institution_id": "inst-1"}, session) is False


def test_faculty_with_no_institution_cannot_review_someone_elses_session():
    session = {"context": svc.build_assessed_context(
        team_id="t1", faculty_id="f1", institution_id="inst-1"
    )}
    assert svc.can_review({"id": "f9", "role": "faculty", "institution_id": None}, session) is False


def test_the_summary_counts_what_the_dashboard_leads_with():
    sessions = [
        {"status": "Pending", "context": {}},
        {"status": "In Progress", "context": {}},
        {"status": "Completed", "context": {}},
        {"status": "Completed", "context": {"reviewed_at": "2026-07-29T00:00:00Z"}},
    ]
    out = svc.summarize_sessions(sessions)
    assert out == {
        "scheduled": 1,
        "in_progress": 1,
        "completed": 2,
        # Only the completed-but-unsigned one is work still owed to students.
        "awaiting_review": 1,
        "total": 4,
    }


def test_an_empty_dashboard_summarizes_to_zeroes_not_an_error():
    assert svc.summarize_sessions([])["total"] == 0
