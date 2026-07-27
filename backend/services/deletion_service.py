"""Data deletion service — implements DPDP Act Right to Erasure.

Cascade-deletes all user data across tables and Supabase Storage,
then anonymizes the profile row.
"""
from __future__ import annotations

from datetime import datetime, timezone

from core.database import get_supabase
from core.logging import get_logger

# `get_logger` (not logging.getLogger) so this lands in the horux.* namespace
# and reaches the diagnostics sink like every other module. Erasure failures
# are exactly the kind you must not discover from a user complaint.
logger = get_logger("deletion")

# Tables with profile_id FK — deleted in dependency order.
_PROFILE_TABLES = [
    "viva_questions",  # via session_ids (handled below)
    "viva_sessions",
    "presentation_sessions",
    "activity_log",
    "code_snapshots",
    "team_viva_scores",
    "weakness_heatmaps",
    "consent_log",
    "audit_log",
]


def execute_deletion(profile_id: str) -> dict:
    """Perform full data deletion for a user. Returns summary of deleted tables."""
    sb = get_supabase()
    deleted: list[str] = []

    # Mark request as processing
    sb.table("data_deletion_requests").update(
        {"status": "processing"}
    ).eq("profile_id", profile_id).eq("status", "pending").execute()

    try:
        # 1. Delete viva_questions via session IDs (child of viva_sessions)
        sessions = sb.table("viva_sessions").select("id").eq("profile_id", profile_id).execute().data or []
        session_ids = [s["id"] for s in sessions]
        if session_ids:
            # Delete in batches to avoid URL length limits
            for i in range(0, len(session_ids), 50):
                batch = session_ids[i:i + 50]
                sb.table("viva_questions").delete().in_("session_id", batch).execute()
            deleted.append("viva_questions")

        # 2. Delete files from Supabase Storage + table
        files = sb.table("files").select("id, storage_path").eq("profile_id", profile_id).execute().data or []
        if files:
            storage_paths = [f["storage_path"] for f in files if f.get("storage_path")]
            if storage_paths:
                try:
                    sb.storage.from_("uploads").remove(storage_paths)
                except Exception as e:
                    logger.warning(
                        "storage cleanup failed",
                        exc_info=True,
                        extra={"user_id": profile_id, "event": "erasure_storage_failed"},
                    )
            sb.table("files").delete().eq("profile_id", profile_id).execute()
            deleted.append("files")

        # 3. Delete code_snapshots storage
        snapshots = sb.table("code_snapshots").select("id, storage_path").eq("profile_id", profile_id).execute().data or []
        if snapshots:
            snap_paths = [s["storage_path"] for s in snapshots if s.get("storage_path")]
            if snap_paths:
                try:
                    sb.storage.from_("uploads").remove(snap_paths)
                except Exception as e:
                    logger.warning(
                        "snapshot storage cleanup failed",
                        exc_info=True,
                        extra={"user_id": profile_id, "event": "erasure_snapshot_failed"},
                    )

        # 4. Delete from all profile-linked tables
        for table in _PROFILE_TABLES:
            try:
                sb.table(table).delete().eq("profile_id", profile_id).execute()
                deleted.append(table)
            except Exception as e:
                logger.warning(
                    "table deletion failed",
                    exc_info=True,
                    extra={"user_id": profile_id, "event": "erasure_table_failed", "tag": table},
                )

        # 5. Delete session_events (live sessions)
        try:
            sb.table("session_events").delete().eq("profile_id", profile_id).execute()
            deleted.append("session_events")
        except Exception:
            pass  # Table may not exist yet

        # 6. Delete flashcards (if table exists)
        try:
            sb.table("flashcards").delete().eq("profile_id", profile_id).execute()
            deleted.append("flashcards")
        except Exception:
            pass

        # 7. Delete bridge_gaps
        try:
            sb.table("bridge_gaps").delete().eq("profile_id", profile_id).execute()
            deleted.append("bridge_gaps")
        except Exception:
            pass

        # 8. Anonymize profile (keep row for FK integrity, remove PII)
        sb.table("profiles").update({
            "full_name": "Deleted User",
            "college_name": None,
            "year": None,
            "branch": None,
            "roll_number": None,
            "bio": None,
            "avatar_url": None,
            "onboarding_goals": [],
            "data_deletion_requested_at": datetime.now(timezone.utc).isoformat(),
        }).eq("id", profile_id).execute()
        deleted.append("profiles (anonymized)")

        # 9. Mark deletion as completed
        sb.table("data_deletion_requests").update({
            "status": "completed",
            "completed_at": datetime.now(timezone.utc).isoformat(),
            "deleted_tables": deleted,
        }).eq("profile_id", profile_id).eq("status", "processing").execute()

        logger.info(f"Data deletion completed for {profile_id}: {deleted}")
        return {"status": "completed", "deleted_tables": deleted}

    except Exception as e:
        logger.error(
            "data deletion failed",
            exc_info=True,
            extra={"user_id": profile_id, "event": "erasure_failed"},
        )
        # Leave request in 'processing' state for manual intervention
        return {"status": "error", "detail": str(e)}
