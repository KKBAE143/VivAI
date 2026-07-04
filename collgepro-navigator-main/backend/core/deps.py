"""Shared FastAPI dependencies."""
from fastapi import Depends, HTTPException
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from .database import get_supabase

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
        print(f"Failed to fetch/create profile: {exc}")
        profile_data = None

    return {
        "id": user.id,
        "email": user.email,
        "profile": profile_data,
    }


def require_project_owner(project_id: str, user_id: str) -> dict:
    sb = get_supabase()
    res = sb.table("projects").select("*").eq("id", project_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Project not found")
    project = res.data[0]
    if project["owner_id"] != user_id:
        raise HTTPException(status_code=403, detail="Not your project")
    return project
