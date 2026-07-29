"""Who a user is, and what they still have to fill in.

Deliberately pure — no Supabase, no FastAPI. The rule that decides whether
somebody counts as faculty is a security boundary (an unapproved claim must
never grant faculty privileges), so it lives where it can be tested directly
rather than through an HTTP round trip.
"""
from __future__ import annotations

# Roles a user may end up holding. Mirrors the profiles_role_check CHECK
# constraint added in migrations/006_institutional.sql — keep the two in step.
VALID_ROLES = ("student", "faculty", "admin")

# Roles that require an institution admin's approval before they take effect.
GATED_ROLES = ("faculty", "admin")

# The onboarding steps each role has to walk. Student steps preserve the
# existing three-step flow (institution link, academics, project seeding).
ROLE_STEPS: dict[str, tuple[str, ...]] = {
    "student": ("institution", "academics", "project"),
    "faculty": ("institution", "teaching"),
    "admin": ("institution_create", "invite_faculty"),
}


def resolve_role(requested: str | None) -> str:
    """Normalise a client-supplied role. Anything unrecognised is a student.

    Exact matching only: a stray "Faculty" or "admin " is untrusted input, not
    a near-miss to be helpfully corrected.
    """
    if requested in GATED_ROLES:
        return requested
    return "student"


def effective_role(requested_role: str | None, approved_at: str | None) -> str:
    """The role a profile may ACTUALLY hold.

    A claim with no approval timestamp is just a claim — it resolves to
    student. This is the approval gate, and it is the reason this function
    exists separately from `resolve_role`.
    """
    if not approved_at:
        return "student"
    return resolve_role(requested_role)


def steps_for(role: str) -> tuple[str, ...]:
    """Onboarding steps for a role, falling back to the student flow.

    Never returns an empty tuple: an unrecognised role must not produce a
    wizard with no steps that the user cannot complete or escape.
    """
    return ROLE_STEPS.get(role, ROLE_STEPS["student"])


def onboarding_state(profile: dict) -> dict:
    """Everything the client needs to route a user after login."""
    role = profile.get("role") or "student"
    if role not in VALID_ROLES:
        role = "student"
    requested = profile.get("requested_role")
    approved = profile.get("approved_at")
    return {
        "complete": bool(profile.get("onboarding_complete")),
        "role": role,
        "steps": list(steps_for(role)),
        "pending_approval": bool(requested) and not approved,
    }


def can_approve(approver_profile: dict, member_row: dict) -> bool:
    """May this approver grant the role `member_row` asked for?

    Three independent conditions, each one a real refusal case: the approver
    must be an admin, must belong to the SAME institution (otherwise one
    college's admin could mint faculty at another), and there must be an
    actual un-approved claim to act on.
    """
    if (approver_profile.get("role") or "student") != "admin":
        return False
    institution_id = approver_profile.get("institution_id")
    if not institution_id or institution_id != member_row.get("institution_id"):
        return False
    if member_row.get("requested_role") not in GATED_ROLES:
        return False
    if member_row.get("approved_at"):
        return False
    return True
