"""Auth + onboarding routes (Supabase Auth backed)."""
from fastapi import APIRouter, Depends, HTTPException
from supabase import create_client
from supabase_auth.helpers import generate_pkce_verifier, generate_pkce_challenge

from core.config import get_settings
from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    OnboardingComplete,
    ProfileUpdate,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
)

router = APIRouter(prefix="/api/auth", tags=["auth"])
onboarding_router = APIRouter(prefix="/api/onboarding", tags=["onboarding"])


def _auth_client():
    s = get_settings()
    return create_client(s.supabase_url, s.supabase_anon_key or s.supabase_service_role_key)


@router.get("/oauth/google")
def oauth_google(redirect_to: str = "http://localhost:8080/"):
    try:
        client = _auth_client()
        res = client.auth.sign_in_with_oauth({
            "provider": "google",
            "options": {
                "redirect_to": redirect_to
            }
        })
        storage_key = client.auth._storage_key
        verifier = client.auth._storage.get_item(f"{storage_key}-code-verifier")
        return {"url": res.url, "code_verifier": verifier}
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"OAuth failed: {exc}")



@router.get("/callback")
def auth_callback(code: str, code_verifier: str):
    try:
        res = _auth_client().auth.exchange_code_for_session({
            "auth_code": code,
            "code_verifier": code_verifier
        })
        return {
            "access_token": res.session.access_token,
            "refresh_token": res.session.refresh_token,
            "user": {
                "id": res.user.id,
                "email": res.user.email,
            }
        }
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Code exchange failed: {exc}")





@router.post("/signup")
def signup(body: SignupRequest):
    try:
        res = _auth_client().auth.sign_up({"email": body.email, "password": body.password})
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Signup failed: {exc}")
    if res.user is None:
        raise HTTPException(status_code=400, detail="Signup failed")
    get_supabase().table("profiles").upsert(
        {
            "id": res.user.id,
            "full_name": body.name,
            "college_name": body.college,
            "year": body.year,
            "branch": body.branch,
        }
    ).execute()
    token = res.session.access_token if res.session else None
    refresh = res.session.refresh_token if res.session else None
    return {
        "user_id": res.user.id,
        "access_token": token,
        "refresh_token": refresh,
        "email_confirmation_required": token is None,
    }


@router.post("/login")
def login(body: LoginRequest):
    try:
        res = _auth_client().auth.sign_in_with_password(
            {"email": body.email, "password": body.password}
        )
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid email or password")
    prof = get_supabase().table("profiles").select("*").eq("id", res.user.id).execute()
    return {
        "access_token": res.session.access_token,
        "refresh_token": res.session.refresh_token,
        "user": {
            "id": res.user.id,
            "email": res.user.email,
            "profile": prof.data[0] if prof.data else None,
        },
    }


@router.post("/refresh")
def refresh(body: RefreshRequest):
    """Exchange a refresh token for a fresh access token.

    Supabase access tokens (the JWT we store client-side) expire after ~1 hour.
    Without this, users get silently logged out mid-session ("Not
    Authenticated"). The client calls this when it sees a 401 and retries.
    """
    try:
        res = _auth_client().auth.refresh_session(body.refresh_token)
    except Exception:
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    if not getattr(res, "session", None):
        raise HTTPException(status_code=401, detail="Session expired. Please sign in again.")
    return {
        "access_token": res.session.access_token,
        "refresh_token": res.session.refresh_token,
    }


@router.post("/logout")
def logout(user=Depends(get_current_user)):
    # Stateless JWT: the client discards the token.
    return {"ok": True}


@router.post("/forgot-password")
def forgot_password(body: ForgotPasswordRequest):
    try:
        _auth_client().auth.reset_password_email(body.email)
    except Exception:
        pass  # Do not leak whether the email exists.
    return {"ok": True}


@router.post("/reset-password")
def reset_password(body: ResetPasswordRequest):
    sb = get_supabase()
    try:
        u = sb.auth.get_user(body.access_token)
        sb.auth.admin.update_user_by_id(u.user.id, {"password": body.new_password})
    except Exception:
        raise HTTPException(status_code=400, detail="Invalid or expired reset token")
    return {"ok": True}


@router.get("/me")
def me(user=Depends(get_current_user)):
    return user


@router.put("/profile")
def update_profile(body: ProfileUpdate, user=Depends(get_current_user)):
    data = {k: v for k, v in body.model_dump().items() if v is not None}
    if not data:
        raise HTTPException(status_code=400, detail="Nothing to update")
    res = get_supabase().table("profiles").update(data).eq("id", user["id"]).execute()
    return res.data[0] if res.data else {}


@onboarding_router.post("/complete")
def complete_onboarding(body: OnboardingComplete, user=Depends(get_current_user)):
    data: dict = {"onboarding_complete": True, "onboarding_goals": body.goals}
    if body.branch:
        data["branch"] = body.branch
    if body.year:
        data["year"] = body.year
    get_supabase().table("profiles").update(data).eq("id", user["id"]).execute()
    return {"ok": True}


@onboarding_router.get("/status")
def onboarding_status(user=Depends(get_current_user)):
    profile = user.get("profile") or {}
    return {"complete": bool(profile.get("onboarding_complete"))}
