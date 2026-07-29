"""Onboarding endpoints: what actually gets written to a profile.

The security-critical assertion here is that claiming faculty does NOT set
profiles.role — it parks a request for an admin to approve.
"""
from __future__ import annotations

import pytest

from api import auth as auth_api
from models.schemas import OnboardingComplete


@pytest.fixture
def onboarding(monkeypatch, fake_supabase):
    fake_supabase.preload("profiles", [{"id": "u1", "role": "student"}])
    fake_supabase.preload("institutions", [
        {"id": "inst-1", "name": "NIT Trichy", "invite_code": "ABC123", "status": "pilot"},
    ])
    fake_supabase.preload("institution_members", [])
    monkeypatch.setattr(auth_api, "get_supabase", lambda: fake_supabase)
    return fake_supabase


def _updates(fake, table):
    """Every payload written to `table`, in order."""
    return fake.table(table).updates


def test_a_student_with_a_valid_code_is_linked_to_the_institution(onboarding):
    auth_api.complete_onboarding(
        OnboardingComplete(role="student", institution_code="ABC123", branch="CSE", year="4th"),
        user={"id": "u1", "profile": {"role": "student"}},
    )
    written = _updates(onboarding, "profiles")[-1]
    assert written["role"] == "student"
    assert written["institution_id"] == "inst-1"
    assert written["onboarding_complete"] is True
    assert written["branch"] == "CSE"


def test_claiming_faculty_does_not_grant_the_faculty_role(onboarding):
    """The approval gate. A claim is parked, never applied."""
    auth_api.complete_onboarding(
        OnboardingComplete(role="faculty", institution_code="ABC123", department="CSE"),
        user={"id": "u1", "profile": {"role": "student"}},
    )
    written = _updates(onboarding, "profiles")[-1]
    assert written["role"] == "student", "an unapproved faculty claim must stay a student"
    member = onboarding.table("institution_members").inserts[-1]
    assert member["requested_role"] == "faculty"
    assert member["approved_at"] is None
    assert member["profile_id"] == "u1"
    assert member["institution_id"] == "inst-1"


def test_an_unknown_institution_code_is_rejected(monkeypatch, fake_supabase):
    """A code matching no institution must 400 rather than silently completing.

    `FakeTable` does not evaluate `.eq()` filters, so "no match" is expressed by
    preloading an empty table — the same thing PostgREST returns for a code that
    matches nothing.
    """
    from fastapi import HTTPException

    fake_supabase.preload("profiles", [{"id": "u1", "role": "student"}])
    fake_supabase.preload("institutions", [])
    monkeypatch.setattr(auth_api, "get_supabase", lambda: fake_supabase)

    with pytest.raises(HTTPException) as exc:
        auth_api.complete_onboarding(
            OnboardingComplete(role="student", institution_code="NOPE"),
            user={"id": "u1", "profile": {"role": "student"}},
        )
    assert exc.value.status_code == 400
    # Nothing was written: a rejected code must not half-complete the profile.
    assert fake_supabase.table("profiles").updates == []


def test_a_student_without_a_code_still_completes(onboarding):
    """Institution linking is optional for students — B2C signup must not break."""
    auth_api.complete_onboarding(
        OnboardingComplete(branch="ECE", year="3rd", goals=["viva"]),
        user={"id": "u1", "profile": {"role": "student"}},
    )
    written = _updates(onboarding, "profiles")[-1]
    assert written["onboarding_complete"] is True
    assert "institution_id" not in written
    assert written["role"] == "student"


def test_requesting_faculty_without_a_code_is_rejected(onboarding):
    """A gated role has to be scoped to an institution, or there is nobody with
    the authority to approve it."""
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        auth_api.complete_onboarding(
            OnboardingComplete(role="faculty", department="CSE"),
            user={"id": "u1", "profile": {"role": "student"}},
        )
    assert exc.value.status_code == 400


def test_status_reports_the_flow_the_client_should_render(onboarding):
    state = auth_api.onboarding_status(user={
        "id": "u1",
        "profile": {"onboarding_complete": False, "role": "student"},
    })
    assert state["complete"] is False
    assert state["role"] == "student"
    assert state["steps"] == ["institution", "academics", "project", "goals"]
    assert state["pending_approval"] is False


# --------------------------------------------------------------------------- #
# Admin approval
# --------------------------------------------------------------------------- #
def test_approving_a_claim_grants_the_role_on_the_profile(monkeypatch, fake_supabase):
    from api import institution as inst_api
    from models.schemas import FacultyApproval

    fake_supabase.preload("institution_members", [{
        "id": "m1", "institution_id": "inst-1", "profile_id": "u2",
        "requested_role": "faculty", "approved_at": None, "status": "invited",
    }])
    fake_supabase.preload("profiles", [{"id": "u2", "role": "student"}])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    out = inst_api.approve_faculty(
        FacultyApproval(member_id="m1", approve=True),
        user={"id": "u1", "profile": {"role": "admin", "institution_id": "inst-1"}},
    )
    assert out["role"] == "faculty"
    profile_write = fake_supabase.table("profiles").updates[-1]
    assert profile_write["role"] == "faculty"
    assert profile_write["institution_id"] == "inst-1"
    member_write = fake_supabase.table("institution_members").updates[-1]
    assert member_write["approved_at"] is not None
    assert member_write["status"] == "active"


def test_an_admin_from_another_institution_cannot_approve(monkeypatch, fake_supabase):
    from fastapi import HTTPException

    from api import institution as inst_api
    from models.schemas import FacultyApproval

    fake_supabase.preload("institution_members", [{
        "id": "m1", "institution_id": "inst-1", "profile_id": "u2",
        "requested_role": "faculty", "approved_at": None, "status": "invited",
    }])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    with pytest.raises(HTTPException) as exc:
        inst_api.approve_faculty(
            FacultyApproval(member_id="m1", approve=True),
            user={"id": "u9", "profile": {"role": "admin", "institution_id": "inst-2"}},
        )
    assert exc.value.status_code == 403
    assert fake_supabase.table("profiles").updates == []


def test_rejecting_a_claim_clears_it_without_granting_anything(monkeypatch, fake_supabase):
    from api import institution as inst_api
    from models.schemas import FacultyApproval

    fake_supabase.preload("institution_members", [{
        "id": "m1", "institution_id": "inst-1", "profile_id": "u2",
        "requested_role": "faculty", "approved_at": None, "status": "invited",
    }])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    out = inst_api.approve_faculty(
        FacultyApproval(member_id="m1", approve=False),
        user={"id": "u1", "profile": {"role": "admin", "institution_id": "inst-1"}},
    )
    assert out["role"] == "student"
    member_write = fake_supabase.table("institution_members").updates[-1]
    assert member_write["requested_role"] is None
    assert member_write["approved_at"] is None


# --------------------------------------------------------------------------- #
# Self-serve institutions + verification gate
# --------------------------------------------------------------------------- #
def test_creating_an_institution_makes_the_creator_an_unverified_admin(monkeypatch, fake_supabase):
    from api import institution as inst_api
    from models.schemas import InstitutionCreate

    fake_supabase.preload("institutions", [])
    fake_supabase.preload("institution_members", [])
    fake_supabase.preload("profiles", [{"id": "u1", "role": "student", "institution_id": None}])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    out = inst_api.create_institution(
        InstitutionCreate(name="Sunrise Institute of Technology"),
        user={"id": "u1", "profile": {"role": "student", "institution_id": None}},
    )
    assert out["verified"] is False
    assert out["invite_code"]

    row = fake_supabase.table("institutions").inserts[-1]
    assert row["status"] == "pilot", "self-serve starts as a pilot, not an active customer"
    assert row["verified_at"] is None, "self-serve is never pre-verified"
    assert row["seat_limit"] == inst_api.SELF_SERVE_SEAT_LIMIT
    assert row["admin_profile_id"] == "u1"

    written = fake_supabase.table("profiles").updates[-1]
    assert written["role"] == "admin"
    assert written["institution_id"] == out["id"]


def test_a_user_already_in_an_institution_cannot_create_one(monkeypatch, fake_supabase):
    """Otherwise a student at a real paying college creates their own
    institution, overwrites their institution_id, and walks out from under
    their college's oversight — as an admin."""
    from fastapi import HTTPException

    from api import institution as inst_api
    from models.schemas import InstitutionCreate

    fake_supabase.preload("institutions", [])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    with pytest.raises(HTTPException) as exc:
        inst_api.create_institution(
            InstitutionCreate(name="Breakaway College"),
            user={"id": "u2", "profile": {"role": "student", "institution_id": "inst-1"}},
        )
    assert exc.value.status_code == 409
    assert fake_supabase.table("institutions").inserts == []


def test_an_unverified_institution_cannot_list_its_students(monkeypatch, fake_supabase):
    from fastapi import HTTPException

    from api import institution as inst_api

    fake_supabase.preload("institutions", [{
        "id": "inst-1", "name": "Sunrise Institute", "status": "pilot", "verified_at": None,
    }])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    with pytest.raises(HTTPException) as exc:
        inst_api.require_verified_institution(
            {"id": "u1", "profile": {"role": "admin", "institution_id": "inst-1"}}
        )
    assert exc.value.status_code == 403
    assert exc.value.detail["error"] == "institution_unverified"


def test_a_verified_institution_passes_the_gate(monkeypatch, fake_supabase):
    from api import institution as inst_api

    fake_supabase.preload("institutions", [{
        "id": "inst-1", "name": "NIT Trichy", "status": "active",
        "verified_at": "2026-07-01T00:00:00Z",
    }])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    out = inst_api.require_verified_institution(
        {"id": "u1", "profile": {"role": "admin", "institution_id": "inst-1"}}
    )
    assert out["id"] == "inst-1"
