"""Data deletion service — implements DPDP Act Right to Erasure.

Cascade-deletes all user data across tables and Supabase Storage,
then anonymizes the profile row.
"""
from __future__ import annotations

from datetime import datetime, timezone

from core.config import get_settings
from core.database import get_supabase
from core.logging import get_logger

# `get_logger` (not logging.getLogger) so this lands in the horux.* namespace
# and reaches the diagnostics sink like every other module. Erasure failures
# are exactly the kind you must not discover from a user complaint.
logger = get_logger("deletion")

# Every table that directly identifies a profile. Children are removed first.
_PROFILE_TABLES = [
    "faculty_sim_ratings", "team_viva_scores", "bridge_gaps", "session_events",
    "bank_questions", "flashcards", "question_banks", "achievements",
    "readiness_snapshots", "weakness_heatmaps", "presentation_sessions",
    "viva_sessions", "activity_log", "code_snapshots", "files",
    "project_team_requests", "team_members", "institution_members", "consent_log",
]


def _record_failure(failures: list[dict], step: str, exc: Exception) -> None:
    failures.append({"step": step, "detail": str(exc)})
    logger.error("erasure step failed", exc_info=True, extra={"event": "erasure_step_failed", "tag": step})


def execute_deletion(profile_id: str) -> dict:
    """Erase one account. Safe to retry; completion requires every required step."""
    sb = get_supabase()
    deleted: list[str] = []
    failures: list[dict] = []
    now = datetime.now(timezone.utc).isoformat()
    requests = sb.table("data_deletion_requests")
    requests.update({"status": "processing", "failure_detail": []}).eq(
        "profile_id", profile_id
    ).in_("status", ["pending", "failed", "processing"]).execute()

    # Storage objects are external to FK cascades and therefore mandatory.
    paths: list[str] = []
    for table in ("files", "code_snapshots"):
        try:
            rows = sb.table(table).select("storage_path").eq("profile_id", profile_id).execute().data or []
            paths.extend(row["storage_path"] for row in rows if row.get("storage_path"))
        except Exception as exc:
            _record_failure(failures, f"discover_storage:{table}", exc)
    if paths:
        try:
            sb.storage.from_(get_settings().storage_bucket).remove(sorted(set(paths)))
            deleted.append("storage_objects")
        except Exception as exc:
            _record_failure(failures, "storage_objects", exc)

    # Session children with no direct ownership FK.
    try:
        sessions = sb.table("viva_sessions").select("id").eq("profile_id", profile_id).execute().data or []
        ids = [row["id"] for row in sessions]
        for start in range(0, len(ids), 50):
            sb.table("viva_questions").delete().in_("session_id", ids[start:start + 50]).execute()
        deleted.append("viva_questions")
    except Exception as exc:
        _record_failure(failures, "viva_questions", exc)

    # Shared resources survive. Remove membership/assignment and detach ownership;
    # projects with no team are private and can be deleted without harming others.
    try:
        projects = sb.table("projects").select("id, team_id").eq("owner_id", profile_id).execute().data or []
        private_ids = [row["id"] for row in projects if not row.get("team_id")]
        shared_ids = [row["id"] for row in projects if row.get("team_id")]
        if private_ids:
            sb.table("projects").delete().in_("id", private_ids).execute()
        if shared_ids:
            sb.table("projects").update({"owner_id": None}).in_("id", shared_ids).execute()
        sb.table("tasks").update({"assignee_id": None}).eq("assignee_id", profile_id).execute()
        sb.table("teams").update({"created_by": None}).eq("created_by", profile_id).execute()
        sb.table("institutions").update({"admin_profile_id": None}).eq("admin_profile_id", profile_id).execute()
        deleted.append("project_and_shared_relationships")
    except Exception as exc:
        _record_failure(failures, "shared_relationships", exc)

    for table in _PROFILE_TABLES:
        try:
            sb.table(table).delete().eq("profile_id", profile_id).execute()
            deleted.append(table)
        except Exception as exc:
            _record_failure(failures, table, exc)

    # Audit records are legally useful but must no longer identify the person.
    try:
        sb.table("audit_log").update({"profile_id": None}).eq("profile_id", profile_id).execute()
        deleted.append("audit_log (de-identified)")
    except Exception as exc:
        _record_failure(failures, "audit_log", exc)

    if not failures:
        try:
            sb.table("profiles").delete().eq("id", profile_id).execute()
            deleted.append("profiles")
            sb.auth.admin.delete_user(profile_id)
            deleted.append("auth.users")
        except Exception as exc:
            _record_failure(failures, "profile_or_auth_account", exc)

    status = "failed" if failures else "completed"
    payload = {
        "status": status,
        "completed_at": None if failures else now,
        "deleted_tables": deleted,
        "failure_detail": failures,
    }
    # Migration 008 keeps this row after profile deletion and de-identifies it.
    requests.update(payload).eq("profile_id", profile_id).execute()
    if not failures:
        requests.update({"profile_id": None}).eq("profile_id", profile_id).execute()
    return {"status": status, "deleted_tables": deleted, "failures": failures}
