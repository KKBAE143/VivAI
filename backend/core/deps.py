"""Shared FastAPI dependencies."""
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .database import get_supabase
from core.logging import get_logger


logger = get_logger("deps")

security = HTTPBearer(auto_error=False)


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
) -> dict:
    """Validate the Supabase JWT and return the user + profile."""
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    sb = get_supabase()
    try:
        res = sb.auth.get_user(credentials.credentials)
        user = res.user
    except Exception:
        user = None
    if user is None:
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    
    try:
        prof = sb.table("profiles").select("*").eq("id", user.id).execute()
        if prof.data:
            profile_data = prof.data[0]
        else:
            # First-time Google login: automatically create profile using user metadata
            metadata = user.user_metadata or {}
            full_name = metadata.get("full_name") or metadata.get("name") or user.email.split("@")[0]
            new_prof = sb.table("profiles").insert({
                "id": user.id,
                "full_name": full_name,
                "onboarding_complete": False
            }).execute()
            profile_data = new_prof.data[0] if new_prof.data else None
    except Exception as exc:
        logger.warning(
            "failed to fetch or create profile",
            exc_info=True,
            extra={"event": "profile_fetch_failed"},
        )
        profile_data = None

    return {
        "id": user.id,
        "email": user.email,
        "profile": profile_data,
    }


def user_from_token(token: str) -> dict | None:
    """Validate a raw Supabase JWT (not an Authorization header) and return a
    lightweight user dict. For WebSocket routes, which receive the token as a
    query param instead of a Bearer header."""
    sb = get_supabase()
    try:
        res = sb.auth.get_user(token)
        user = res.user
    except Exception:
        return None
    if not user:
        return None
    meta = dict(getattr(user, "user_metadata", None) or {})
    raw_name = (meta.get("full_name") or meta.get("name") or "").strip()
    # Use just the first name so a live-session examiner addresses them naturally.
    first_name = raw_name.split()[0] if raw_name else ""
    return {"id": user.id, "email": user.email, "name": first_name}


def require_project_owner(project_id: str, user_id: str) -> dict:
    sb = get_supabase()
    res = sb.table("projects").select("*").eq("id", project_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    project = res.data[0]
    if project["owner_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not your project")
    return project


def require_consent(user: dict = Depends(get_current_user)) -> dict:
    """Gate that ensures the user has accepted the current privacy policy.

    Use on session-creating endpoints (viva start, presentation start, live WS).
    Returns the user dict if consent is valid, raises 403 otherwise.
    """
    profile = user.get("profile") or {}
    if not profile.get("consent_accepted_at"):
        raise HTTPException(
            status_code=403,
            detail={"error": "consent_required", "message": "You must accept the Privacy Policy before starting a session."},
        )
    return user


def require_admin(user: dict = Depends(get_current_user)) -> dict:
    """Gate that ensures the user has an institutional admin or faculty role.

    Used on all /api/institution/* routes. Returns user dict with institution_id
    if authorized, raises 403 otherwise.
    """
    profile = user.get("profile") or {}
    role = profile.get("role", "student")
    if role not in ("faculty", "admin"):
        raise HTTPException(
            status_code=403,
            detail={"error": "admin_required", "message": "Institutional admin or faculty access required."},
        )
    if not profile.get("institution_id"):
        raise HTTPException(
            status_code=403,
            detail={"error": "no_institution", "message": "You are not linked to an institution."},
        )
    return user
