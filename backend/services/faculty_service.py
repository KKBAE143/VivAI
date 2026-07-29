"""Faculty-conducted assessment: pure logic for assessed sessions.

Kept free of Supabase and FastAPI so the rules that decide who may read or
review a graded session — a security boundary — are testable directly.

The key distinction this module encodes is PRACTICE vs ASSESSED:

- A practice session is created by a student (team lead) for their own rehearsal.
  It produces no institutional record and nobody signs it off.
- An assessed session is created by a faculty member. It carries the faculty and
  institution ids in `viva_sessions.context`, which is what makes per-student
  marks attributable and defensible later.

`teams` has no institution_id column, so a team cannot be resolved to an
institution directly. Recording the authority on the SESSION at creation time is
what closes that gap without a migration.
"""
from __future__ import annotations

# Statuses a viva_sessions row may hold (see supabase_schema.sql).
STATUS_PENDING = "Pending"
STATUS_IN_PROGRESS = "In Progress"
STATUS_COMPLETED = "Completed"


def build_assessed_context(
    *,
    team_id: str,
    faculty_id: str,
    institution_id: str,
    project_id: str | None = None,
) -> dict:
    """The `context` blob that marks a session as faculty-assessed.

    `assessed: True` is the single flag every downstream consumer checks, so a
    practice session can never be mistaken for a graded one.
    """
    context: dict = {
        "team_id": team_id,
        "assessed": True,
        "faculty_id": faculty_id,
        "institution_id": institution_id,
    }
    if project_id:
        context["project_id"] = project_id
    return context


def is_assessed(session: dict) -> bool:
    """Whether this session is a faculty-conducted assessment."""
    return bool((session.get("context") or {}).get("assessed"))


def can_review(faculty_profile: dict, session: dict) -> bool:
    """May this faculty member read and sign off this session?

    Two ways to qualify, both deliberate: the faculty who created it, or any
    faculty/admin of the SAME institution (so a colleague can cover, and a HOD
    can audit). A practice session has no institutional owner and is therefore
    never reviewable — it is the student's own rehearsal.
    """
    if not is_assessed(session):
        return False
    role = faculty_profile.get("role") or "student"
    if role not in ("faculty", "admin"):
        return False
    context = session.get("context") or {}
    if context.get("faculty_id") and context["faculty_id"] == faculty_profile.get("id"):
        return True
    institution_id = faculty_profile.get("institution_id")
    return bool(institution_id) and institution_id == context.get("institution_id")


def summarize_sessions(sessions: list[dict]) -> dict:
    """Counts a faculty dashboard leads with.

    `awaiting_review` is the number that actually drives action: a completed
    assessment nobody has signed off is work still owed to students.
    """
    scheduled = in_progress = completed = awaiting_review = 0
    for s in sessions:
        status = s.get("status")
        if status == STATUS_COMPLETED:
            completed += 1
            if not (s.get("context") or {}).get("reviewed_at"):
                awaiting_review += 1
        elif status == STATUS_IN_PROGRESS:
            in_progress += 1
        else:
            scheduled += 1
    return {
        "scheduled": scheduled,
        "in_progress": in_progress,
        "completed": completed,
        "awaiting_review": awaiting_review,
        "total": len(sessions),
    }
