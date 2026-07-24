"""Privacy & DPDP Act 2023 compliance endpoints."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import ConsentSubmit
from services import deletion_service

router = APIRouter(prefix="/api/privacy", tags=["privacy"])

# Current policy version — bump when the policy text changes.
POLICY_VERSION = "1.0"

PRIVACY_POLICY = {
    "version": POLICY_VERSION,
    "last_updated": "2026-07-24",
    "title": "VivAI Privacy Policy",
    "sections": [
        {
            "heading": "Data We Collect",
            "body": "We collect your name, email, college, branch, and year during signup. "
                    "During practice sessions we store transcripts, scores, and delivery metrics. "
                    "Uploaded code/project files are stored encrypted to generate viva questions.",
        },
        {
            "heading": "Purpose Limitation",
            "body": "We use your code and project data ONLY to generate viva questions during your session "
                    "and to produce your private performance report. We NEVER train AI models on your code. "
                    "Your data is never sold or shared with third parties for marketing.",
        },
        {
            "heading": "Data Retention",
            "body": "Raw audio/video is processed in real-time and never persisted. Uploaded code files are "
                    "automatically deleted within 7 days of your last session. Transcripts and scores are "
                    "retained until you delete your account. You may request full deletion at any time.",
        },
        {
            "heading": "Your Rights (DPDP Act 2023)",
            "body": "You have the right to: (1) Access your data, (2) Correct inaccurate data, "
                    "(3) Erase all your data ('Delete My Data' in Profile), "
                    "(4) Withdraw consent at any time, (5) File a grievance with our officer below.",
        },
        {
            "heading": "Data Security",
            "body": "All data is encrypted at rest (AES-256) and in transit (TLS 1.3). "
                    "Data is hosted in India (AWS Mumbai). Access is restricted to authenticated users only.",
        },
        {
            "heading": "Minors (Under 18)",
            "body": "Users under 18 require verifiable parental/guardian consent. "
                    "We do not track behavioral analytics for minor users. "
                    "Aggregated, anonymized data only is used for platform improvement.",
        },
    ],
}

GRIEVANCE_OFFICER = {
    "name": "VivAI Data Protection Officer",
    "email": "grievance@vivai.app",
    "response_time": "We respond to all grievances within 7 working days.",
}


@router.post("/consent")
def submit_consent(body: ConsentSubmit, request: Request, user=Depends(get_current_user)):
    """Record consent acceptance (ToS, privacy policy, or parental consent)."""
    sb = get_supabase()
    uid = user["id"]
    now = datetime.now(timezone.utc).isoformat()

    # Log the consent action
    sb.table("consent_log").insert({
        "profile_id": uid,
        "consent_type": body.consent_type,
        "version": POLICY_VERSION,
        "accepted_at": now,
        "ip_address": request.client.host if request.client else None,
        "user_agent": request.headers.get("user-agent", "")[:500],
    }).execute()

    # Update profile consent fields
    update: dict = {}
    if body.consent_type in ("tos", "privacy"):
        update["consent_accepted_at"] = now
        update["consent_version"] = POLICY_VERSION
    if body.is_minor:
        update["is_minor"] = True
    if body.consent_type == "parental":
        update["parental_consent_at"] = now

    if update:
        sb.table("profiles").update(update).eq("id", uid).execute()

    return {"ok": True, "consent_type": body.consent_type, "version": POLICY_VERSION}


@router.get("/consent-status")
def consent_status(user=Depends(get_current_user)):
    """Return the user's current consent state."""
    profile = user.get("profile") or {}
    return {
        "consent_accepted": bool(profile.get("consent_accepted_at")),
        "consent_version": profile.get("consent_version"),
        "current_version": POLICY_VERSION,
        "is_minor": bool(profile.get("is_minor")),
        "parental_consent": bool(profile.get("parental_consent_at")),
        "consent_accepted_at": profile.get("consent_accepted_at"),
        "needs_reconsent": (
            profile.get("consent_version") != POLICY_VERSION
            if profile.get("consent_accepted_at") else True
        ),
    }


@router.post("/delete-my-data")
def request_deletion(user=Depends(get_current_user)):
    """Initiate full data deletion (Right to Erasure under DPDP Act)."""
    sb = get_supabase()
    uid = user["id"]

    # Check for existing pending/processing request
    existing = (
        sb.table("data_deletion_requests")
        .select("id, status")
        .eq("profile_id", uid)
        .in_("status", ["pending", "processing"])
        .execute().data
    )
    if existing:
        return {"ok": True, "status": existing[0]["status"], "message": "Deletion already in progress."}

    # Create deletion request
    sb.table("data_deletion_requests").insert({
        "profile_id": uid,
        "status": "pending",
    }).execute()

    # Mark profile
    sb.table("profiles").update({
        "data_deletion_requested_at": datetime.now(timezone.utc).isoformat(),
    }).eq("id", uid).execute()

    # Execute deletion synchronously (data volumes are small per-user)
    result = deletion_service.execute_deletion(uid)
    return {"ok": True, **result}


@router.get("/delete-status")
def deletion_status(user=Depends(get_current_user)):
    """Check the status of a data deletion request."""
    sb = get_supabase()
    rows = (
        sb.table("data_deletion_requests")
        .select("status, requested_at, completed_at")
        .eq("profile_id", user["id"])
        .order("requested_at", desc=True)
        .limit(1)
        .execute().data
    )
    if not rows:
        return {"status": "none", "requested_at": None, "completed_at": None}
    row = rows[0]
    return {
        "status": row["status"],
        "requested_at": row.get("requested_at"),
        "completed_at": row.get("completed_at"),
    }


@router.get("/policy")
def get_policy():
    """Return the current privacy policy (public, no auth required)."""
    return PRIVACY_POLICY


@router.get("/grievance")
def get_grievance():
    """Return grievance officer details (public, no auth required)."""
    return GRIEVANCE_OFFICER
