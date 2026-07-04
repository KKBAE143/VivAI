"""Activity feed logging used across all routes."""
from core.database import get_supabase


def log_activity(
    profile_id: str,
    activity_type: str,
    text: str,
    project_id: str | None = None,
    entity_type: str | None = None,
    entity_id: str | None = None,
) -> None:
    try:
        get_supabase().table("activity_log").insert(
            {
                "profile_id": profile_id,
                "activity_type": activity_type,
                "activity_text": text,
                "project_id": project_id,
                "entity_type": entity_type,
                "entity_id": entity_id,
            }
        ).execute()
    except Exception:
        # Activity logging must never break the main request.
        pass
