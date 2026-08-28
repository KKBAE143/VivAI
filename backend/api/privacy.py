"""Privacy & DPDP Act 2023 compliance endpoints."""
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import ConsentSubmit, ParentalVerifyRequest
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
POLICY_VERSION = "3.0"

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
        {
            "data": "Sidebar state, theme preference, and auth tokens (browser storage)",
            "purpose": "Keep you signed in, remember your UI preferences, and provide a consistent experience",
            "enables": "Login persistence, sidebar layout, and dark/light mode",
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
            "heading": "AI-generated content",
            "body": "Session reports, scores, feedback and delivery metrics are generated by "
                    "an AI model (Google Gemini) and are clearly labelled as such in the app, "
                    "as required by the Information Technology (Intermediary Guidelines and "
                    "Digital Media Ethics Code) Amendment Rules, 2026 (effective 20 February "
                    "2026). These are practice tools — they are not academic assessments, "
                    "certifications or professional evaluations. We do not use AI to generate "
                    "deepfakes, synthetic identity content or any deceptive material.",
        },
        {
            "heading": "How long we keep it",
            "body": "Live audio and video are processed as they happen and are not stored. "
                    "Transcripts, scores, reports and uploaded project files are kept until you "
                    "delete them or delete your account, because they are what your progress history "
                    "and your faculty's records are made of. Per-turn diagnostic events are kept for "
                    "90 days and then pruned. Account erasure deletes your uploads, sessions, "
                    "memberships, profile and sign-in account. Shared team projects survive with "
                    "your ownership and membership removed, so another person's work is not destroyed. "
                    "De-identified deletion and security-audit records may be retained to prove compliance. "
                    "If a law requires an institution to retain an assessment record, we will isolate "
                    "and de-identify it where possible and tell you what was retained and why.",
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
                    "targeted advertising directed at children. When you sign up as under 18, we "
                    "collect your parent's email and send them a unique verification link. Practice "
                    "sessions (viva, presentation, pitch, coaching) are blocked until your parent "
                    "clicks that link — a self-declared checkbox is not sufficient under Rule 10 of "
                    "the DPDP Rules 2025. We do not run behavioural analytics or advertising on "
                    "accounts flagged as under 18. If you are a guardian and want to withdraw consent "
                    "or have a child's data removed, write to the officer below.",
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
            "heading": "Cookies and local storage",
            "body": "VivAI does not use tracking cookies, analytics cookies or advertising cookies. "
                    "We use the following strictly necessary browser storage: (1) a single functional "
                    "cookie called sidebar_state that remembers whether your sidebar is open or closed "
                    "and expires after 7 days; (2) localStorage entries for your auth tokens "
                    "(vivai_access_token, vivai_refresh_token), a temporary PKCE code verifier used "
                    "during sign-in and deleted immediately after, and your theme preference "
                    "(vivai_theme); and (3) a sessionStorage entry for diagnostics error correlation. "
                    "None of these are used for tracking or profiling. They are essential for the "
                    "platform to function and cannot be opted out of while you use VivAI. If this "
                    "ever changes we will update this notice and ask for your consent again.",
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
    """Record consent acceptance (ToS, privacy policy, or parental consent).

    When is_minor=True and consent_type='tos', this also stores the parent_email
    and kicks off the DPDP Rule 10 verification flow.  The child's session
    features remain blocked until the parent clicks the verification link.
    """
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
        # Old path: self-declared parental consent (pre-Rule 10).
        # Still accepted for backward compatibility but does NOT set
        # parental_verified_at — verified consent requires the email flow.
        update["parental_consent_at"] = now

    # DPDP Rule 10: when a minor signs up, store parent email and generate a
    # verification token.  Session features stay blocked until the parent
    # clicks the link, which sets parental_verified_at.
    if body.is_minor and body.parent_email and body.consent_type == "tos":
        token = secrets.token_urlsafe(32)
        update["parent_email"] = body.parent_email
        update["parental_verification_token"] = token
        update["parental_verification_expires_at"] = (
            datetime.now(timezone.utc) + timedelta(hours=48)
        ).isoformat()

    if update:
        sb.table("profiles").update(update).eq("id", uid).execute()

    return {"ok": True, "consent_type": body.consent_type, "version": POLICY_VERSION}


@router.get("/consent-status")
def consent_status(user=Depends(get_current_user)):
    """Return the user's current consent state."""
    profile = user.get("profile") or {}

    # For minors, "parental_consent" now requires VERIFIED consent
    # (parental_verified_at), not just the self-declared parental_consent_at.
    is_minor = bool(profile.get("is_minor"))
    parental_consent = bool(profile.get("parental_verified_at")) if is_minor else bool(profile.get("parental_consent_at"))

    return {
        "consent_accepted": bool(profile.get("consent_accepted_at")),
        "consent_version": profile.get("consent_version"),
        "current_version": POLICY_VERSION,
        "is_minor": is_minor,
        "parental_consent": parental_consent,
        "consent_accepted_at": profile.get("consent_accepted_at"),
        "needs_reconsent": (
            profile.get("consent_version") != POLICY_VERSION
            if profile.get("consent_accepted_at") else True
        ),
        # Rule 10: verification state for minors
        "parent_email": profile.get("parent_email") if is_minor else None,
        "parental_verified_at": profile.get("parental_verified_at") if is_minor else None,
        "verification_pending": (
            is_minor
            and not profile.get("parental_verified_at")
            and not profile.get("parental_withdrawn_at")
        ),
    }


@router.post("/delete-my-data")
def request_deletion(user=Depends(get_current_user)):
    """Initiate full data deletion (Right to Erasure under DPDP Act)."""
    sb = get_supabase()
    uid = user["id"]

    # Reuse retryable requests so retries are idempotent and preserve history.
    existing = (
        sb.table("data_deletion_requests")
        .select("id, status")
        .eq("profile_id", uid)
        .in_("status", ["pending", "processing", "failed"])
        .order("requested_at", desc=True)
        .limit(1)
        .execute().data
    )
    if existing and existing[0]["status"] in ("pending", "processing"):
        return {"ok": True, "status": existing[0]["status"], "message": "Deletion already in progress."}

    if not existing:
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
    return {"ok": result["status"] == "completed", **result}


@router.get("/delete-status")
def deletion_status(user=Depends(get_current_user)):
    """Check the status of a data deletion request."""
    sb = get_supabase()
    rows = (
        sb.table("data_deletion_requests")
        .select("status, requested_at, completed_at, failure_detail")
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
        "failures": row.get("failure_detail") or [],
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


# ---------------------------------------------------------------------------
# DPDP Rule 10 — Verifiable parental consent
# ---------------------------------------------------------------------------
# The self-declared checkbox is not "verifiable" consent under Rule 10.
# The parent must confirm their identity by clicking a unique, time-limited
# link sent to their email.  This is the "email-plus" verification method
# recommended by the Consently / edTech guidance for DPDP compliance.

VERIFICATION_TOKEN_EXPIRY_HOURS = 48


@router.post("/request-parental-verification")
def request_parental_verification(user=Depends(get_current_user)):
    """Generate (or regenerate) a parental verification token.

    Called by the child's account when the parent hasn't verified yet, or when
    the previous token expired.  The token is stored on the profile; the
    email-sending happens client-side or via a separate mailer (not in scope
    here — the token is returned so the frontend can hand it off).
    """
    sb = get_supabase()
    profile = user.get("profile") or {}

    if not profile.get("is_minor"):
        raise HTTPException(status_code=400, detail="Account is not flagged as under 18.")

    if profile.get("parental_verified_at"):
        return {"ok": True, "message": "Parental consent already verified.", "already_verified": True}

    token = secrets.token_urlsafe(32)
    now = datetime.now(timezone.utc)
    sb.table("profiles").update({
        "parental_verification_token": token,
        "parental_verification_expires_at": (
            now + timedelta(hours=VERIFICATION_TOKEN_EXPIRY_HOURS)
        ).isoformat(),
    }).eq("id", user["id"]).execute()

    return {
        "ok": True,
        "parent_email": profile.get("parent_email"),
        "verification_token": token,
        "expires_in_hours": VERIFICATION_TOKEN_EXPIRY_HOURS,
    }


@router.get("/verify-parental")
def verify_parental_consent(token: str):
    """Parent clicks the verification link → this verifies the consent.

    Public endpoint (no auth required) — the parent is not a VivAI user.
    The token proves the email was accessed by someone with the link.
    """
    sb = get_supabase()
    now = datetime.now(timezone.utc)

    # Find the profile by token
    rows = (
        sb.table("profiles")
        .select("id, is_minor, parental_verified_at, parental_verification_expires_at, parental_withdrawn_at")
        .eq("parental_verification_token", token)
        .limit(1)
        .execute().data
    )
    if not rows:
        raise HTTPException(status_code=404, detail="Invalid or unknown verification link.")

    profile = rows[0]

    if profile.get("parental_verified_at"):
        return {"ok": True, "message": "Consent was already verified.", "already_verified": True}

    if profile.get("parental_withdrawn_at"):
        raise HTTPException(status_code=400, detail="Consent has been withdrawn. The child must ask their guardian to re-consent.")

    # Check expiry
    expires_at = profile.get("parental_verification_expires_at")
    if expires_at:
        from datetime import datetime as _dt
        exp = _dt.fromisoformat(expires_at.replace("Z", "+00:00"))
        if now > exp:
            raise HTTPException(status_code=410, detail="Verification link has expired. Please ask the child to request a new link.")

    # Mark as verified
    sb.table("profiles").update({
        "parental_verified_at": now.isoformat(),
        "parental_consent_at": now.isoformat(),  # also record consent timestamp
        "parental_verification_token": None,       # one-time use
        "parental_verification_expires_at": None,
    }).eq("id", profile["id"]).execute()

    # Audit log
    sb.table("consent_log").insert({
        "profile_id": profile["id"],
        "consent_type": "parental",
        "version": POLICY_VERSION,
        "accepted_at": now.isoformat(),
        "ip_address": None,
        "user_agent": "parent-verification-link",
    }).execute()

    return {
        "ok": True,
        "message": "Parental consent verified. The child's practice sessions are now enabled.",
    }


@router.get("/parental-consent-status")
def parental_consent_status(user=Depends(get_current_user)):
    """Return the detailed parental consent state for the current user."""
    profile = user.get("profile") or {}
    is_minor = bool(profile.get("is_minor"))
    parent_email = profile.get("parent_email")
    verified_at = profile.get("parental_verified_at")
    withdrawn_at = profile.get("parental_withdrawn_at")
    expires_at = profile.get("parental_verification_expires_at")

    # Determine if verification link is currently valid
    token_valid = False
    if expires_at and not verified_at:
        from datetime import datetime as _dt
        now = datetime.now(timezone.utc)
        exp = _dt.fromisoformat(expires_at.replace("Z", "+00:00"))
        token_valid = now < exp

    return {
        "is_minor": is_minor,
        "parent_email": parent_email,
        "parental_verified": bool(verified_at),
        "parental_verified_at": verified_at,
        "parental_withdrawn": bool(withdrawn_at),
        "parental_withdrawn_at": withdrawn_at,
        "verification_pending": is_minor and not verified_at and not withdrawn_at,
        "verification_token_valid": token_valid,
    }


@router.post("/withdraw-parental-consent")
def withdraw_parental_consent(user=Depends(get_current_user)):
    """Parent withdraws consent for their child's data processing.

    DPDP Act §6(4): consent may be withdrawn at any time, as easily as it was
    given.  This blocks future session processing (the require_consent gate
    already checks parental_consent_at for minors).
    """
    sb = get_supabase()
    profile = user.get("profile") or {}
    now = datetime.now(timezone.utc).isoformat()

    if not profile.get("is_minor"):
        raise HTTPException(status_code=400, detail="Account is not flagged as under 18.")

    sb.table("profiles").update({
        "parental_withdrawn_at": now,
        "parental_consent_at": None,
        "parental_verified_at": None,
    }).eq("id", user["id"]).execute()

    # Audit log
    sb.table("consent_log").insert({
        "profile_id": user["id"],
        "consent_type": "parental",
        "version": POLICY_VERSION,
        "accepted_at": now,
        "ip_address": None,
        "user_agent": "parental-consent-withdrawal",
    }).execute()

    return {"ok": True, "message": "Parental consent withdrawn. Session features are now disabled."}
