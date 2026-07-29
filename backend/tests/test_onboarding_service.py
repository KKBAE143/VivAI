"""Onboarding decision logic.

Pure by design: the rule that decides whether somebody is faculty is a
security boundary, and it must be testable without a database in the way.
"""
from __future__ import annotations

from services import onboarding_service as svc


def test_a_self_selected_faculty_claim_is_not_a_faculty_role():
    """The whole point of the approval gate: claiming is not being."""
    assert svc.effective_role("faculty", None) == "student"


def test_an_approved_faculty_claim_becomes_the_real_role():
    assert svc.effective_role("faculty", "2026-07-29T06:00:00Z") == "faculty"


def test_an_unknown_requested_role_falls_back_to_student():
    for bogus in (None, "", "Faculty", "superuser", "admin ", "STUDENT"):
        assert svc.resolve_role(bogus) == "student"


def test_only_exact_faculty_and_admin_are_accepted():
    assert svc.resolve_role("faculty") == "faculty"
    assert svc.resolve_role("admin") == "admin"
    assert svc.resolve_role("student") == "student"


def test_each_role_gets_its_own_onboarding_steps():
    assert svc.steps_for("student") == ("institution", "academics", "project")
    assert svc.steps_for("faculty") == ("institution", "teaching")
    assert svc.steps_for("admin") == ("institution_create", "invite_faculty")
    # An unrecognised role must not produce an empty wizard.
    assert svc.steps_for("nonsense") == svc.steps_for("student")


def test_state_reports_pending_approval_for_an_unapproved_faculty_claim():
    state = svc.onboarding_state({
        "onboarding_complete": True,
        "role": "student",
        "requested_role": "faculty",
        "approved_at": None,
    })
    assert state["pending_approval"] is True
    assert state["role"] == "student"
    assert state["complete"] is True


def test_state_is_not_pending_once_approved():
    state = svc.onboarding_state({
        "onboarding_complete": True,
        "role": "faculty",
        "requested_role": "faculty",
        "approved_at": "2026-07-29T06:00:00Z",
    })
    assert state["pending_approval"] is False
    assert state["role"] == "faculty"


def test_a_fresh_profile_is_incomplete_and_defaults_to_student():
    state = svc.onboarding_state({})
    assert state["complete"] is False
    assert state["role"] == "student"
    assert state["steps"] == ["institution", "academics", "project"]


def test_only_an_admin_of_the_same_institution_may_approve():
    member = {"institution_id": "inst-1", "requested_role": "faculty", "approved_at": None}
    assert svc.can_approve({"role": "admin", "institution_id": "inst-1"}, member) is True
    # Wrong institution, wrong role, and already-approved are all refusals.
    assert svc.can_approve({"role": "admin", "institution_id": "inst-2"}, member) is False
    assert svc.can_approve({"role": "faculty", "institution_id": "inst-1"}, member) is False
    assert svc.can_approve({"role": "student", "institution_id": "inst-1"}, member) is False
    assert svc.can_approve(
        {"role": "admin", "institution_id": "inst-1"},
        {"institution_id": "inst-1", "requested_role": "faculty", "approved_at": "2026-01-01T00:00:00Z"},
    ) is False


def test_approval_requires_an_actual_pending_claim():
    assert svc.can_approve(
        {"role": "admin", "institution_id": "inst-1"},
        {"institution_id": "inst-1", "requested_role": None, "approved_at": None},
    ) is False


def test_onboarding_payload_accepts_role_and_institution_fields():
    from models.schemas import OnboardingComplete

    body = OnboardingComplete(
        role="faculty",
        institution_code="ABC123",
        department="CSE",
        subjects=["DBMS", "OS"],
    )
    assert body.role == "faculty"
    assert body.institution_code == "ABC123"
    assert body.subjects == ["DBMS", "OS"]
    # Existing student fields still work, and everything stays optional so the
    # current student flow keeps posting exactly what it posts today.
    legacy = OnboardingComplete(branch="CSE", year="4th", goals=["viva"])
    assert legacy.role is None
    assert legacy.subjects == []


def test_institution_and_approval_payloads_exist():
    from models.schemas import FacultyApproval, InstitutionCreate

    assert InstitutionCreate(name="NIT Trichy").tier == "lite"
    assert FacultyApproval(member_id="m1", approve=True).approve is True
