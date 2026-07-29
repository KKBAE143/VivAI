"""Privacy & DPDP Act 2023 compliance endpoints."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import ConsentSubmit
from services import deletion_service

router = APIRouter(prefix="/api/privacy", tags=["privacy"])

# Current notice version — bump whenever the text below changes materially.
#
# A bump invalidates every existing consent (`needs_reconsent` compares the
# stored version against this one) and the app asks again. That is the point: a
# consent given against a different description of the processing is not consent
# to this one.
#
# 2.0 restructures the notice to the itemised shape the DPDP Rules 2025 require,
# and removes three claims the previous version made that the code did not
# support — see the comment above `PRIVACY_POLICY`.
POLICY_VERSION = "2.0"

# Shaped for Rule 3 of the Digital Personal Data Protection Rules 2025 (notified
# 13 November 2025), which requires a notice that stands on its own, in plain
# language, and that ITEMISES the personal data collected against the specific
# purpose for each item and the goods or services that processing enables. It
# also requires a stated means to withdraw consent, exercise rights, and complain
# to the Data Protection Board. Rules 3 and 5-16 carry a compliance date of
# 13 May 2027, so this is ahead of the deadline rather than behind it.
#
# Three claims from version 1.0 were removed because nothing in the codebase
# backs them, and an unsupported statement in a privacy notice is worse than a
# vague one:
#
#   1. "Uploaded code files are automatically deleted within 7 days." There is no
#      job that deletes code_snapshots. Retention now describes what actually
#      happens: uploads persist until the student deletes them or their account.
#   2. "Data is hosted in India (AWS Mumbai)" and "encrypted end-to-end". The
#      hosting region is a property of the Supabase project, not of this code, and
#      the transport to Gemini is TLS in transit — not end-to-end encryption.
#   3. "Never shared with third parties." Session audio, transcripts and code
#      summaries are sent to Google's Gemini API — that IS a third-party
#      processor, and it is the core of how the product works. Concealing it while
#      claiming otherwise is the opposite of informed consent.
#
# Anything a maintainer must confirm before this is published commercially is
# marked "verify" in the section body rather than asserted.
PRIVACY_POLICY = {
    "version": POLICY_VERSION,
    "last_updated": "2026-07-29",
    "title": "VivAI Privacy Notice",
    "law": "Digital Personal Data Protection Act 2023 and the DPDP Rules 2025 (India)",
    "data_fiduciary": "VivAI",
    "summary": (
        "VivAI is an Indian platform for Indian students. This notice tells you exactly what we "
        "collect, why, who processes it, how long we keep it, and how to withdraw consent or have "
        "everything erased. You can refuse — practice sessions will not run, but nothing else about "
        "your account changes."
    ),
    # Rule 3(b): itemised data, itemised purpose, and the service each enables.
    "items": [
        {
            "data": "Name, email address",
            "purpose": "Create and secure your account; address you by name during a session",
            "enables": "Sign-in, and an examiner that speaks to you personally",
        },
        {
            "data": "College, branch, year, roll number (optional)",
            "purpose": "Set the academic level of your questions and place you in your institution",
            "enables": "Questions pitched at your year, and your college's readiness reports",
        },
        {
            "data": "Your speech during a practice session, as live audio",
            "purpose": "Conduct the spoken examination in real time",
            "enables": "The AI viva, presentation, pitch and coaching sessions",
        },
        {
            "data": "The text transcript of what you and the examiner said",
            "purpose": "Grade your answers and build your report",
            "enables": "Your scores, feedback, model answers and progress history",
        },
        {
            "data": "Camera and screen video, where a mode uses it",
            "purpose": "Coach your delivery, or follow the slides you are presenting",
            "enables": "Presentation review and communication coaching",
        },
        {
            "data": "Delivery measurements derived from your speech (pace, filler words, talk ratio)",
            "purpose": "Show you how you communicated, not only what you said",
            "enables": "Your delivery scorecard",
        },
        {
            "data": "Project files and source code you upload",
            "purpose": "Generate questions about the work you actually submitted",
            "enables": "Code-aware viva, which examines you on your own project",
        },
        {
            "data": "Scores, weak topics and session history",
            "purpose": "Track your readiness over time",
            "enables": "Readiness score, weakness heatmap, leaderboard position",
        },
        {
            "data": "Your institution membership and role",
            "purpose": "Let your faculty run and review assessed vivas",
            "enables": "Assessed sessions, faculty sign-off and cohort reporting",
        },
    ],
    "sections": [
        {
            "heading": "Who processes your data",
            "body": "VivAI is the data fiduciary — we decide what is collected and why. Two "
                    "processors act on our instructions: Supabase, which stores your account, "
                    "sessions and uploads, and Google (Gemini API), which runs the AI examiner. "
                    "Your session audio, transcript and a summary of your uploaded code are sent to "
                    "Google's API so the examiner can speak with you and grade your answers. That "
                    "processing may happen on servers outside India; the DPDP Rules permit "
                    "cross-border transfer except to territories the Central Government has "
                    "restricted. We do not sell your data, and we do not share it for advertising.",
        },
        {
            "heading": "We do not train models on your work",
            "body": "Your code, transcripts and reports are used to run YOUR session and produce "
                    "YOUR report. We do not use them to train or fine-tune any model, and we do not "
                    "build a product out of your project. If that ever changes we will ask you "
                    "again — a new purpose needs new consent, not a quiet update.",
        },
        {
            "heading": "How long we keep it",
            "body": "Live audio and video are processed as they happen and are not stored. "
                    "Transcripts, scores, reports and uploaded project files are kept until you "
                    "delete them or delete your account, because they are what your progress history "
                    "and your faculty's records are made of. Per-turn diagnostic events are kept for "
                    "90 days and then pruned. If your institution is required by its own regulations "
                    "to retain assessment records, that obligation takes precedence over erasure for "
                    "those records only.",
        },
        {
            "heading": "Your rights under the DPDP Act 2023",
            "body": "You may: access a summary of your data and how it is processed; have inaccurate "
                    "or incomplete data corrected or completed; have your data erased; withdraw "
                    "consent at any time, as easily as you gave it; nominate another person to "
                    "exercise these rights if you are unable to; and complain to us, and to the Data "
                    "Protection Board of India, without our permission. Withdrawing consent stops "
                    "future processing — it does not undo processing already carried out lawfully.",
        },
        {
            "heading": "How to exercise them",
            "body": "Erase everything: Profile, then Delete All My Data. Withdraw consent: the same "
                    "control — erasing your data withdraws the consent it was based on. Correct your "
                    "details: edit them on your Profile. Or write to the grievance officer below and "
                    "we will action it for you.",
        },
        {
            "heading": "If you are under 18",
            "body": "The DPDP Act requires verifiable consent from a parent or lawful guardian before "
                    "a child's data is processed, and forbids tracking, behavioural monitoring and "
                    "targeted advertising directed at children. Tell us at signup that you are under "
                    "18 and we will record the parental consent; we do not run behavioural analytics "
                    "or advertising for these accounts. If you are a guardian and want a child's data "
                    "removed, write to the officer below.",
        },
        {
            "heading": "Security",
            "body": "Access requires authentication, and every query is scoped to the signed-in "
                    "account: your sessions are not readable by other students, and cohort data is "
                    "restricted to verified institutions. Traffic to our backend and to our "
                    "processors travels over TLS, and both Supabase and Google encrypt data at rest. "
                    "We do not claim end-to-end encryption, because the AI examiner has to be able to "
                    "read what you say in order to examine you.",
        },
        {
            "heading": "If something goes wrong",
            "body": "The DPDP Rules require a personal data breach to be reported to the Data "
                    "Protection Board and to every affected person within 72 hours of us becoming "
                    "aware of it. We will tell you what happened, what data was involved, and what to "
                    "do about it, without waiting to be asked.",
        },
    ],
}

GRIEVANCE_OFFICER = {
    "name": "VivAI Grievance Officer",
    "email": "grievance@vivai.app",
    # The DPDP Rules set 90 days as the outer limit for answering a grievance.
    # Stating our own target alongside it keeps the promise honest: 7 working days
    # is what we aim for, 90 days is the statutory backstop.
    "response_time": (
        "We aim to respond within 7 working days, and in any case within the 90 days the "
        "DPDP Rules 2025 allow."
    ),
    "escalation": (
        "If we do not resolve your complaint, you may take it to the Data Protection Board of "
        "India. You do not need our permission to do so."
    ),
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
    """Return the current privacy notice (public, no auth required).

    The single source of truth. `/privacy` used to hardcode its own copy of this
    text in the page component, so the notice a student read and the notice the
    API served could — and did — drift apart. Only one of them is versioned
    against their recorded consent, which makes the divergence a compliance
    problem rather than a cosmetic one.
    """
    return {**PRIVACY_POLICY, "grievance_officer": GRIEVANCE_OFFICER}


@router.get("/grievance")
def get_grievance():
    """Return grievance officer details (public, no auth required)."""
    return GRIEVANCE_OFFICER
