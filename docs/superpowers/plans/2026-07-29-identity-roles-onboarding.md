# Identity: Roles, Invites & Branched Onboarding — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the platform real student / faculty / admin identity — role selection at onboarding, institution linking, and an admin-approval gate for faculty claims — so every institutional feature that already gates on `role` + `institution_id` finally has those fields populated.

**Architecture:** Migration 006 already defines the entire schema (`profiles.role`, `profiles.institution_id`, `institutions`, `institution_members`); nothing populates it. So this is wiring, not schema work, plus one small migration for the faculty-approval gate. All decision logic goes into a new pure module `services/onboarding_service.py` so it is unit-testable with no database, and the API layer stays thin. The frontend onboarding route becomes a role-branched step machine instead of a fixed 3-step student flow.

**Tech Stack:** FastAPI + Pydantic v2, Supabase (PostgREST client), pytest; React + TanStack Router, TypeScript, bun test.

## Global Constraints

- `role` defaults to `student`. Every existing account keeps working untouched.
- `profiles.role` may only ever be `student`, `faculty`, or `admin` (CHECK constraint from migration 006).
- **Faculty role is never granted by institution code.** Only by admin invite, or admin approval of a pending request. A user's `profiles.role` stays `student` until approval.
- `require_admin` (`backend/core/deps.py:103-121`) is NOT modified. It keeps reading `profiles.role` + `profiles.institution_id`.
- An admin self-serving a new institution creates it with `status='pilot'` (existing CHECK value: `pilot|active|expired`).
- Existing onboarding behavior for students (branch, year, goals, project seeding) is preserved.
- Run backend tests from the `backend/` directory: `python -m pytest`.
- Backend test doubles use the existing `fake_supabase` fixture from `backend/tests/conftest.py` with `.preload(table_name, rows)`, and `monkeypatch.setattr(<module>, "get_supabase", lambda: fake_supabase)` — the pattern in `backend/tests/test_live_reconnect.py`.

---

## File Structure

**Create:**

- `backend/migrations/007_faculty_approval.sql` — adds `requested_role` + `approved_at` to `institution_members`.
- `backend/services/onboarding_service.py` — pure decision logic: which onboarding flow a profile needs, which step it is on, and whether a faculty claim may be approved. No DB, no FastAPI.
- `backend/tests/test_onboarding_service.py` — unit tests for the pure module.
- `backend/tests/test_onboarding_api.py` — endpoint tests against `fake_supabase`.
- `src/lib/onboarding-flow.ts` — pure frontend mirror: step lists per role, and next/back resolution. Unit-tested with bun.
- `src/lib/__tests__/onboarding-flow.test.ts` — bun tests.

**Modify:**

- `backend/models/schemas.py:43-46` — extend `OnboardingComplete`; add `InstitutionCreate`, `FacultyApproval`.
- `backend/api/auth.py:176-190` — `complete_onboarding` and `onboarding_status` become role-aware.
- `backend/api/institution.py` — add faculty approval endpoints (pending list + approve/reject).
- `src/routes/onboarding.tsx` — role selection first, then role-branched steps.

---

## Task 1: Faculty-approval migration

**Files:**

- Create: `backend/migrations/007_faculty_approval.sql`

**Interfaces:**

- Consumes: `institution_members` and `institutions` from `backend/migrations/006_institutional.sql`.
- Produces: columns `institution_members.requested_role TEXT`, `institution_members.approved_at TIMESTAMPTZ`, and `institutions.verified_at TIMESTAMPTZ`, all nullable.

- [ ] **Step 1: Write the migration**

Create `backend/migrations/007_faculty_approval.sql`:

```sql
-- ---------------------------------------------------------------------------
-- 007: Faculty approval gate
--
-- A self-selected "I am faculty" claim must not grant faculty privileges by
-- itself, or any student could register as faculty and read classmates'
-- reports. The claim is parked here; `profiles.role` stays 'student' until an
-- institution admin approves it.
-- ---------------------------------------------------------------------------

ALTER TABLE institution_members
  ADD COLUMN IF NOT EXISTS requested_role TEXT;

ALTER TABLE institution_members
  DROP CONSTRAINT IF EXISTS institution_members_requested_role_check;

ALTER TABLE institution_members
  ADD CONSTRAINT institution_members_requested_role_check
  CHECK (requested_role IS NULL OR requested_role IN ('faculty', 'admin'));

ALTER TABLE institution_members
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;

-- Admins list pending claims per institution on every dashboard load.
CREATE INDEX IF NOT EXISTS idx_institution_members_pending
  ON institution_members(institution_id)
  WHERE requested_role IS NOT NULL AND approved_at IS NULL;

-- ---------------------------------------------------------------------------
-- Institution verification.
--
-- Anyone may self-serve an institution (it starts empty, so creating one
-- exposes nothing — every institution query filters by institution_id). The
-- real abuse is NAME-SQUATTING: register "NIT Trichy", share its invite code,
-- and read the reports of real students who join believing it is official.
--
-- So: self-serve institutions are unverified, students see that before they
-- join, and the bulk-data endpoints (/students, /export, /readiness-report)
-- require verification. We set verified_at by hand at sale time.
-- ---------------------------------------------------------------------------
ALTER TABLE institutions
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;
```

- [ ] **Step 2: Verify it is valid SQL and idempotent**

There is no local Postgres in this repo, so verification is by inspection against `backend/migrations/006_institutional.sql`:

- Every `ADD COLUMN` uses `IF NOT EXISTS`, every constraint is dropped before being added, and the index uses `IF NOT EXISTS`. Re-running the file is therefore safe.
- `requested_role` values are a subset of the `profiles_role_check` values from 006.

Expected: no `TODO` left in the file, and the file re-runnable without error.

- [ ] **Step 3: Commit**

```bash
git add backend/migrations/007_faculty_approval.sql
git commit -m "feat: add faculty approval columns to institution_members"
```

---

## Task 2: Pure onboarding decision module

**Files:**

- Create: `backend/services/onboarding_service.py`
- Test: `backend/tests/test_onboarding_service.py`

**Interfaces:**

- Consumes: nothing (pure).
- Produces, all importable from `services.onboarding_service`:
  - `ROLE_STEPS: dict[str, tuple[str, ...]]`
  - `resolve_role(requested: str | None) -> str` — returns `"student"` unless `requested` is exactly `"faculty"` or `"admin"`.
  - `effective_role(requested_role: str | None, approved_at: str | None) -> str` — the role a profile may actually hold: the requested role only when `approved_at` is set, else `"student"`.
  - `steps_for(role: str) -> tuple[str, ...]`
  - `onboarding_state(profile: dict) -> dict` with keys `complete: bool`, `role: str`, `steps: list[str]`, `pending_approval: bool`.
  - `can_approve(approver_profile: dict, member_row: dict) -> bool`

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_onboarding_service.py`:

```python
"""Onboarding decision logic.

Pure by design: the rule that decides whether somebody is faculty is a
security boundary, and it must be testable without a database in the way.
"""
from __future__ import annotations

from services import onboarding_service as svc


def test_a_self_selected_faculty_claim_is_not_a_faculty_role():
    """The whole point of the approval gate: claiming is not being."""
    assert svc.effective_role("faculty", None) == "student"


def test_an_approved_faculty_claim_becomes_the_real_role():
    assert svc.effective_role("faculty", "2026-07-29T06:00:00Z") == "faculty"


def test_an_unknown_requested_role_falls_back_to_student():
    for bogus in (None, "", "Faculty", "superuser", "admin ", "STUDENT"):
        assert svc.resolve_role(bogus) == "student"


def test_only_exact_faculty_and_admin_are_accepted():
    assert svc.resolve_role("faculty") == "faculty"
    assert svc.resolve_role("admin") == "admin"
    assert svc.resolve_role("student") == "student"


def test_each_role_gets_its_own_onboarding_steps():
    assert svc.steps_for("student") == ("institution", "academics", "project")
    assert svc.steps_for("faculty") == ("institution", "teaching")
    assert svc.steps_for("admin") == ("institution_create", "invite_faculty")
    # An unrecognised role must not produce an empty wizard.
    assert svc.steps_for("nonsense") == svc.steps_for("student")


def test_state_reports_pending_approval_for_an_unapproved_faculty_claim():
    state = svc.onboarding_state({
        "onboarding_complete": True,
        "role": "student",
        "requested_role": "faculty",
        "approved_at": None,
    })
    assert state["pending_approval"] is True
    assert state["role"] == "student"
    assert state["complete"] is True


def test_state_is_not_pending_once_approved():
    state = svc.onboarding_state({
        "onboarding_complete": True,
        "role": "faculty",
        "requested_role": "faculty",
        "approved_at": "2026-07-29T06:00:00Z",
    })
    assert state["pending_approval"] is False
    assert state["role"] == "faculty"


def test_a_fresh_profile_is_incomplete_and_defaults_to_student():
    state = svc.onboarding_state({})
    assert state["complete"] is False
    assert state["role"] == "student"
    assert state["steps"] == ["institution", "academics", "project"]


def test_only_an_admin_of_the_same_institution_may_approve():
    member = {"institution_id": "inst-1", "requested_role": "faculty", "approved_at": None}
    assert svc.can_approve({"role": "admin", "institution_id": "inst-1"}, member) is True
    # Wrong institution, wrong role, and already-approved are all refusals.
    assert svc.can_approve({"role": "admin", "institution_id": "inst-2"}, member) is False
    assert svc.can_approve({"role": "faculty", "institution_id": "inst-1"}, member) is False
    assert svc.can_approve({"role": "student", "institution_id": "inst-1"}, member) is False
    assert svc.can_approve(
        {"role": "admin", "institution_id": "inst-1"},
        {"institution_id": "inst-1", "requested_role": "faculty", "approved_at": "2026-01-01T00:00:00Z"},
    ) is False


def test_approval_requires_an_actual_pending_claim():
    assert svc.can_approve(
        {"role": "admin", "institution_id": "inst-1"},
        {"institution_id": "inst-1", "requested_role": None, "approved_at": None},
    ) is False
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `python -m pytest tests/test_onboarding_service.py -v`
Expected: FAIL — `ModuleNotFoundError: No module named 'services.onboarding_service'`

- [ ] **Step 3: Write minimal implementation**

Create `backend/services/onboarding_service.py`:

```python
"""Who a user is, and what they still have to fill in.

Deliberately pure — no Supabase, no FastAPI. The rule that decides whether
somebody counts as faculty is a security boundary (an unapproved claim must
never grant faculty privileges), so it lives where it can be tested directly
rather than through an HTTP round trip.
"""
from __future__ import annotations

# Roles a user may end up holding. Mirrors the profiles_role_check CHECK
# constraint added in migrations/006_institutional.sql — keep the two in step.
VALID_ROLES = ("student", "faculty", "admin")

# Roles that require an institution admin's approval before they take effect.
GATED_ROLES = ("faculty", "admin")

# The onboarding steps each role has to walk. Student steps preserve the
# existing three-step flow (institution link, academics, project seeding).
ROLE_STEPS: dict[str, tuple[str, ...]] = {
    "student": ("institution", "academics", "project"),
    "faculty": ("institution", "teaching"),
    "admin": ("institution_create", "invite_faculty"),
}


def resolve_role(requested: str | None) -> str:
    """Normalise a client-supplied role. Anything unrecognised is a student.

    Exact matching only: a stray "Faculty" or "admin " is untrusted input, not
    a near-miss to be helpfully corrected.
    """
    if requested in GATED_ROLES:
        return requested
    return "student"


def effective_role(requested_role: str | None, approved_at: str | None) -> str:
    """The role a profile may ACTUALLY hold.

    A claim with no approval timestamp is just a claim — it resolves to
    student. This is the approval gate, and it is the reason this function
    exists separately from `resolve_role`.
    """
    if not approved_at:
        return "student"
    return resolve_role(requested_role)


def steps_for(role: str) -> tuple[str, ...]:
    """Onboarding steps for a role, falling back to the student flow.

    Never returns an empty tuple: an unrecognised role must not produce a
    wizard with no steps that the user cannot complete or escape.
    """
    return ROLE_STEPS.get(role, ROLE_STEPS["student"])


def onboarding_state(profile: dict) -> dict:
    """Everything the client needs to route a user after login."""
    role = profile.get("role") or "student"
    if role not in VALID_ROLES:
        role = "student"
    requested = profile.get("requested_role")
    approved = profile.get("approved_at")
    return {
        "complete": bool(profile.get("onboarding_complete")),
        "role": role,
        "steps": list(steps_for(role)),
        "pending_approval": bool(requested) and not approved,
    }


def can_approve(approver_profile: dict, member_row: dict) -> bool:
    """May this approver grant the role `member_row` asked for?

    Three independent conditions, each one a real refusal case: the approver
    must be an admin, must belong to the SAME institution (otherwise one
    college's admin could mint faculty at another), and there must be an
    actual un-approved claim to act on.
    """
    if (approver_profile.get("role") or "student") != "admin":
        return False
    institution_id = approver_profile.get("institution_id")
    if not institution_id or institution_id != member_row.get("institution_id"):
        return False
    if member_row.get("requested_role") not in GATED_ROLES:
        return False
    if member_row.get("approved_at"):
        return False
    return True
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `python -m pytest tests/test_onboarding_service.py -v`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/services/onboarding_service.py backend/tests/test_onboarding_service.py
git commit -m "feat: add pure onboarding role/approval decision logic"
```

---

## Task 3: Role-aware onboarding schemas

**Files:**

- Modify: `backend/models/schemas.py:43-46`

**Interfaces:**

- Consumes: `services.onboarding_service.VALID_ROLES` (import not required; values duplicated as literals in validation is NOT acceptable — import it).
- Produces:
  - `OnboardingComplete` gains `role: str | None`, `institution_code: str | None`, `subjects: list[str]`, `department: str | None`.
  - `InstitutionCreate(name: str, tier: str = "lite")`
  - `FacultyApproval(member_id: str, approve: bool)`

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_onboarding_service.py`:

```python
def test_onboarding_payload_accepts_role_and_institution_fields():
    from models.schemas import OnboardingComplete

    body = OnboardingComplete(
        role="faculty",
        institution_code="ABC123",
        department="CSE",
        subjects=["DBMS", "OS"],
    )
    assert body.role == "faculty"
    assert body.institution_code == "ABC123"
    assert body.subjects == ["DBMS", "OS"]
    # Existing student fields still work, and everything stays optional so the
    # current student flow keeps posting exactly what it posts today.
    legacy = OnboardingComplete(branch="CSE", year="4th", goals=["viva"])
    assert legacy.role is None
    assert legacy.subjects == []


def test_institution_and_approval_payloads_exist():
    from models.schemas import FacultyApproval, InstitutionCreate

    assert InstitutionCreate(name="NIT Trichy").tier == "lite"
    assert FacultyApproval(member_id="m1", approve=True).approve is True
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `python -m pytest tests/test_onboarding_service.py -k payload -v`
Expected: FAIL — `TypeError`/`ValidationError` for unexpected keyword `role`, then `ImportError` for `InstitutionCreate`.

- [ ] **Step 3: Write minimal implementation**

In `backend/models/schemas.py`, replace the existing `OnboardingComplete` (lines 43-46):

```python
class OnboardingComplete(BaseModel):
    branch: str | None = None
    year: str | None = None
    goals: list[str] = []
    # Role-aware onboarding. All optional so the existing student flow keeps
    # posting the same payload it posts today.
    role: str | None = None
    institution_code: str | None = None
    # Faculty-only: what they teach.
    department: str | None = None
    subjects: list[str] = []


class InstitutionCreate(BaseModel):
    name: str
    tier: str = "lite"


class FacultyApproval(BaseModel):
    member_id: str
    approve: bool
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `python -m pytest tests/test_onboarding_service.py -v`
Expected: PASS (12 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/models/schemas.py backend/tests/test_onboarding_service.py
git commit -m "feat: add role and institution fields to onboarding payloads"
```

---

## Task 4: Role-aware onboarding endpoints

**Files:**

- Modify: `backend/api/auth.py:176-190`
- Test: `backend/tests/test_onboarding_api.py`

**Interfaces:**

- Consumes: `services.onboarding_service.{resolve_role, onboarding_state, GATED_ROLES}`; `models.schemas.OnboardingComplete`.
- Produces: `POST /api/onboarding/complete` writes role/institution links; `GET /api/onboarding/status` returns the `onboarding_state` dict.

- [ ] **Step 1: Write the failing test**

Create `backend/tests/test_onboarding_api.py`:

```python
"""Onboarding endpoints: what actually gets written to a profile.

The security-critical assertion here is that claiming faculty does NOT set
profiles.role — it parks a request for an admin to approve.
"""
from __future__ import annotations

import pytest

from api import auth as auth_api
from models.schemas import OnboardingComplete


@pytest.fixture
def onboarding(monkeypatch, fake_supabase):
    fake_supabase.preload("profiles", [{"id": "u1", "role": "student"}])
    fake_supabase.preload("institutions", [
        {"id": "inst-1", "name": "NIT Trichy", "invite_code": "ABC123", "status": "pilot"},
    ])
    fake_supabase.preload("institution_members", [])
    monkeypatch.setattr(auth_api, "get_supabase", lambda: fake_supabase)
    return fake_supabase


def _updates(fake, table):
    """Every payload written to `table`, in order."""
    return fake.table(table).updates


def test_a_student_with_a_valid_code_is_linked_to_the_institution(onboarding):
    auth_api.complete_onboarding(
        OnboardingComplete(role="student", institution_code="ABC123", branch="CSE", year="4th"),
        user={"id": "u1", "profile": {"role": "student"}},
    )
    written = _updates(onboarding, "profiles")[-1]
    assert written["role"] == "student"
    assert written["institution_id"] == "inst-1"
    assert written["onboarding_complete"] is True
    assert written["branch"] == "CSE"


def test_claiming_faculty_does_not_grant_the_faculty_role(onboarding):
    """The approval gate. A claim is parked, never applied."""
    auth_api.complete_onboarding(
        OnboardingComplete(role="faculty", institution_code="ABC123", department="CSE"),
        user={"id": "u1", "profile": {"role": "student"}},
    )
    written = _updates(onboarding, "profiles")[-1]
    assert written["role"] == "student", "an unapproved faculty claim must stay a student"
    member = onboarding.table("institution_members").inserts[-1]
    assert member["requested_role"] == "faculty"
    assert member["approved_at"] is None
    assert member["profile_id"] == "u1"
    assert member["institution_id"] == "inst-1"


def test_an_unknown_institution_code_is_rejected(onboarding):
    from fastapi import HTTPException

    with pytest.raises(HTTPException) as exc:
        auth_api.complete_onboarding(
            OnboardingComplete(role="student", institution_code="NOPE"),
            user={"id": "u1", "profile": {"role": "student"}},
        )
    assert exc.value.status_code == 400


def test_a_student_without_a_code_still_completes(onboarding):
    """Institution linking is optional for students — B2C signup must not break."""
    auth_api.complete_onboarding(
        OnboardingComplete(branch="ECE", year="3rd", goals=["viva"]),
        user={"id": "u1", "profile": {"role": "student"}},
    )
    written = _updates(onboarding, "profiles")[-1]
    assert written["onboarding_complete"] is True
    assert "institution_id" not in written
    assert written["role"] == "student"


def test_status_reports_the_flow_the_client_should_render(onboarding):
    state = auth_api.onboarding_status(user={
        "id": "u1",
        "profile": {"onboarding_complete": False, "role": "student"},
    })
    assert state["complete"] is False
    assert state["role"] == "student"
    assert state["steps"] == ["institution", "academics", "project"]
    assert state["pending_approval"] is False
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `python -m pytest tests/test_onboarding_api.py -v`
Expected: FAIL — `complete_onboarding` ignores `role`/`institution_code`, so `written["institution_id"]` raises `KeyError` and no row is inserted into `institution_members`.

If `_updates`/`.inserts`/`.updates` are not exposed by `FakeSupabase` in `backend/tests/conftest.py`, add them there as plain lists appended to by the fake's `update()`/`insert()` methods before continuing — the fake is a test double owned by this repo, so extending it is expected.

- [ ] **Step 3: Write minimal implementation**

In `backend/api/auth.py`, add to the imports:

```python
from models.schemas import (
    ForgotPasswordRequest,
    LoginRequest,
    OnboardingComplete,
    ProfileUpdate,
    RefreshRequest,
    ResetPasswordRequest,
    SignupRequest,
)
from services import onboarding_service
```

Then replace `complete_onboarding` and `onboarding_status` (lines 176-190):

```python
def _resolve_institution(sb, code: str) -> dict:
    """Look up an institution by its invite code, or 400.

    A bad code is user error at a wizard step, not a server fault — the client
    needs a message it can render next to the input.
    """
    res = sb.table("institutions").select("*").eq("invite_code", code.strip()).execute()
    if not res.data:
        raise HTTPException(status_code=400, detail="That institution code was not recognised.")
    return res.data[0]


@onboarding_router.post("/complete")
def complete_onboarding(body: OnboardingComplete, user=Depends(get_current_user)):
    sb = get_supabase()
    requested = onboarding_service.resolve_role(body.role)

    # A gated role (faculty/admin) is only ever a REQUEST. profiles.role stays
    # 'student' until an institution admin approves it, so a self-selected
    # claim can never read another student's reports.
    data: dict = {
        "onboarding_complete": True,
        "onboarding_goals": body.goals,
        "role": "student",
    }
    if body.branch:
        data["branch"] = body.branch
    if body.year:
        data["year"] = body.year

    institution = None
    if body.institution_code:
        institution = _resolve_institution(sb, body.institution_code)
        data["institution_id"] = institution["id"]

    sb.table("profiles").update(data).eq("id", user["id"]).execute()

    if requested in onboarding_service.GATED_ROLES:
        if institution is None:
            raise HTTPException(
                status_code=400,
                detail="An institution code is required to request faculty or admin access.",
            )
        sb.table("institution_members").insert({
            "institution_id": institution["id"],
            "profile_id": user["id"],
            "status": "invited",
            "requested_role": requested,
            "approved_at": None,
        }).execute()

    return {"ok": True, "pending_approval": requested in onboarding_service.GATED_ROLES}


@onboarding_router.get("/status")
def onboarding_status(user=Depends(get_current_user)):
    return onboarding_service.onboarding_state(user.get("profile") or {})
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `python -m pytest tests/test_onboarding_api.py -v`
Expected: PASS (5 tests)

Then confirm nothing regressed: `python -m pytest -q`
Expected: all previously-passing tests still pass (210 before this plan, plus the new ones).

- [ ] **Step 5: Commit**

```bash
git add backend/api/auth.py backend/tests/test_onboarding_api.py backend/tests/conftest.py
git commit -m "feat: make onboarding role-aware with a faculty approval gate"
```

---

## Task 5: Admin approval endpoints

**Files:**

- Modify: `backend/api/institution.py`
- Test: `backend/tests/test_onboarding_api.py`

**Interfaces:**

- Consumes: `services.onboarding_service.can_approve`; `models.schemas.FacultyApproval`; existing `require_admin` from `core.deps`.
- Produces: `GET /api/institution/pending-faculty` → `{"pending": [...]}`; `POST /api/institution/approve-faculty` → `{"ok": True, "role": "<granted role>"}`.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_onboarding_api.py`:

```python
def test_approving_a_claim_grants_the_role_on_the_profile(monkeypatch, fake_supabase):
    from api import institution as inst_api
    from models.schemas import FacultyApproval

    fake_supabase.preload("institution_members", [{
        "id": "m1", "institution_id": "inst-1", "profile_id": "u2",
        "requested_role": "faculty", "approved_at": None, "status": "invited",
    }])
    fake_supabase.preload("profiles", [{"id": "u2", "role": "student"}])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    out = inst_api.approve_faculty(
        FacultyApproval(member_id="m1", approve=True),
        user={"id": "u1", "profile": {"role": "admin", "institution_id": "inst-1"}},
    )
    assert out["role"] == "faculty"
    profile_write = fake_supabase.table("profiles").updates[-1]
    assert profile_write["role"] == "faculty"
    assert profile_write["institution_id"] == "inst-1"
    member_write = fake_supabase.table("institution_members").updates[-1]
    assert member_write["approved_at"] is not None
    assert member_write["status"] == "active"


def test_an_admin_from_another_institution_cannot_approve(monkeypatch, fake_supabase):
    from fastapi import HTTPException

    from api import institution as inst_api
    from models.schemas import FacultyApproval

    fake_supabase.preload("institution_members", [{
        "id": "m1", "institution_id": "inst-1", "profile_id": "u2",
        "requested_role": "faculty", "approved_at": None, "status": "invited",
    }])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    with pytest.raises(HTTPException) as exc:
        inst_api.approve_faculty(
            FacultyApproval(member_id="m1", approve=True),
            user={"id": "u9", "profile": {"role": "admin", "institution_id": "inst-2"}},
        )
    assert exc.value.status_code == 403


def test_rejecting_a_claim_clears_it_without_granting_anything(monkeypatch, fake_supabase):
    from api import institution as inst_api
    from models.schemas import FacultyApproval

    fake_supabase.preload("institution_members", [{
        "id": "m1", "institution_id": "inst-1", "profile_id": "u2",
        "requested_role": "faculty", "approved_at": None, "status": "invited",
    }])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    out = inst_api.approve_faculty(
        FacultyApproval(member_id="m1", approve=False),
        user={"id": "u1", "profile": {"role": "admin", "institution_id": "inst-1"}},
    )
    assert out["role"] == "student"
    member_write = fake_supabase.table("institution_members").updates[-1]
    assert member_write["requested_role"] is None
    assert member_write["approved_at"] is None
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `python -m pytest tests/test_onboarding_api.py -k faculty -v`
Expected: FAIL — `AttributeError: module 'api.institution' has no attribute 'approve_faculty'`

- [ ] **Step 3: Write minimal implementation**

Add to `backend/api/institution.py` (imports first):

```python
from datetime import datetime, timezone

from models.schemas import FacultyApproval
from services import onboarding_service
```

Then the endpoints:

```python
@router.get("/pending-faculty")
def pending_faculty(user=Depends(require_admin)):
    """Un-approved faculty/admin claims for this admin's institution."""
    sb = get_supabase()
    inst_id = _get_institution_id(user)
    rows = (
        sb.table("institution_members")
        .select("*, profiles(full_name)")
        .eq("institution_id", inst_id)
        .is_("approved_at", "null")
        .execute()
        .data
        or []
    )
    return {"pending": [r for r in rows if r.get("requested_role")]}


@router.post("/approve-faculty")
def approve_faculty(body: FacultyApproval, user=Depends(require_admin)):
    """Grant or refuse a requested role.

    Granting is the ONLY path by which profiles.role becomes 'faculty', so the
    same-institution check in `can_approve` is the security boundary here — an
    admin at one college must never be able to mint faculty at another.
    """
    sb = get_supabase()
    res = sb.table("institution_members").select("*").eq("id", body.member_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="No such membership request")
    member = res.data[0]
    profile = user.get("profile") or {}

    if not onboarding_service.can_approve(profile, member):
        raise HTTPException(status_code=403, detail="You cannot approve this request")

    if not body.approve:
        # Clear the claim rather than deleting the membership: the person is
        # still a student at this institution, just not faculty.
        sb.table("institution_members").update(
            {"requested_role": None, "approved_at": None, "status": "active"}
        ).eq("id", body.member_id).execute()
        return {"ok": True, "role": "student"}

    granted = onboarding_service.resolve_role(member.get("requested_role"))
    now = datetime.now(timezone.utc).isoformat()
    sb.table("institution_members").update(
        {"approved_at": now, "status": "active"}
    ).eq("id", body.member_id).execute()
    sb.table("profiles").update(
        {"role": granted, "institution_id": member["institution_id"]}
    ).eq("id", member["profile_id"]).execute()
    return {"ok": True, "role": granted}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `python -m pytest tests/test_onboarding_api.py -v`
Expected: PASS (8 tests)

Then: `python -m pytest -q` — expected all green.

- [ ] **Step 5: Commit**

```bash
git add backend/api/institution.py backend/tests/test_onboarding_api.py
git commit -m "feat: add admin approval endpoints for faculty role requests"
```

---

## Task 6: Frontend onboarding step machine (pure)

**Files:**

- Create: `src/lib/onboarding-flow.ts`
- Test: `src/lib/__tests__/onboarding-flow.test.ts`

**Interfaces:**

- Consumes: nothing (pure). Mirrors `ROLE_STEPS` from Task 2 — the two must stay in step.
- Produces: `export type OnboardingRole = "student" | "faculty" | "admin"`; `export const ROLE_STEPS: Record<OnboardingRole, string[]>`; `export function stepsFor(role: string): string[]`; `export function totalSteps(role: string): number`; `export function nextStep(role: string, index: number): number`; `export function prevStep(index: number): number`; `export function isLastStep(role: string, index: number): boolean`.

- [ ] **Step 1: Write the failing test**

Create `src/lib/__tests__/onboarding-flow.test.ts`:

```typescript
import { describe, expect, it } from "bun:test";

import {
  isLastStep,
  nextStep,
  prevStep,
  ROLE_STEPS,
  stepsFor,
  totalSteps,
} from "../onboarding-flow";

describe("onboarding flow", () => {
  it("keeps the existing three-step student wizard", () => {
    expect(ROLE_STEPS.student).toEqual(["institution", "academics", "project"]);
    expect(totalSteps("student")).toBe(3);
  });

  it("gives faculty and admin their own steps", () => {
    expect(stepsFor("faculty")).toEqual(["institution", "teaching"]);
    expect(stepsFor("admin")).toEqual(["institution_create", "invite_faculty"]);
  });

  it("falls back to the student flow for an unknown role", () => {
    // Never return an empty wizard — the user would be stuck on a dead screen.
    expect(stepsFor("nonsense")).toEqual(ROLE_STEPS.student);
    expect(stepsFor("")).toEqual(ROLE_STEPS.student);
  });

  it("clamps navigation at both ends", () => {
    expect(nextStep("faculty", 0)).toBe(1);
    // Faculty has 2 steps, so index 1 is the last: next must not overrun.
    expect(nextStep("faculty", 1)).toBe(1);
    expect(prevStep(0)).toBe(0);
    expect(prevStep(2)).toBe(1);
  });

  it("knows the final step per role", () => {
    expect(isLastStep("faculty", 1)).toBe(true);
    expect(isLastStep("faculty", 0)).toBe(false);
    expect(isLastStep("student", 2)).toBe(true);
    expect(isLastStep("student", 1)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `bun test src/lib/__tests__/onboarding-flow.test.ts`
Expected: FAIL — cannot resolve module `../onboarding-flow`

- [ ] **Step 3: Write minimal implementation**

Create `src/lib/onboarding-flow.ts`:

```typescript
/**
 * Which onboarding steps each role walks, and how to move between them.
 *
 * Pure and separate from the route component so the step machine is testable
 * without rendering a wizard. Mirrors ROLE_STEPS in
 * backend/services/onboarding_service.py — change both together.
 */
export type OnboardingRole = "student" | "faculty" | "admin";

export const ROLE_STEPS: Record<OnboardingRole, string[]> = {
  student: ["institution", "academics", "project"],
  faculty: ["institution", "teaching"],
  admin: ["institution_create", "invite_faculty"],
};

/** Steps for a role, falling back to the student flow for anything unknown. */
export function stepsFor(role: string): string[] {
  return ROLE_STEPS[role as OnboardingRole] ?? ROLE_STEPS.student;
}

export function totalSteps(role: string): number {
  return stepsFor(role).length;
}

/** Advance, clamped to the last step so Next can never overrun the wizard. */
export function nextStep(role: string, index: number): number {
  return Math.min(index + 1, totalSteps(role) - 1);
}

/** Go back, clamped at the first step. */
export function prevStep(index: number): number {
  return Math.max(index - 1, 0);
}

export function isLastStep(role: string, index: number): boolean {
  return index >= totalSteps(role) - 1;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `bun test src/lib/__tests__/onboarding-flow.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Commit**

```bash
git add src/lib/onboarding-flow.ts src/lib/__tests__/onboarding-flow.test.ts
git commit -m "feat: add role-branched onboarding step machine"
```

---

## Task 7: Role selection in the onboarding route

**Files:**

- Modify: `src/routes/onboarding.tsx`

**Interfaces:**

- Consumes: `stepsFor`, `nextStep`, `prevStep`, `isLastStep`, `totalSteps` from `src/lib/onboarding-flow.ts` (Task 6); `POST /api/onboarding/complete` accepting `role`, `institution_code`, `department`, `subjects` (Task 4).
- Produces: no new exports. The route renders a role picker, then that role's steps.

- [ ] **Step 1: Read the existing route and keep its student path intact**

Read `src/routes/onboarding.tsx` in full (259 lines). Note how `step` state,
the progress bar at lines ~103-112, the three `step === N` blocks, and the
Back/Next buttons at lines ~232-240 work today. The existing student screens
(academics + project seeding) are reused verbatim as the `academics` and
`project` steps — do not rewrite them.

- [ ] **Step 2: Add a role gate before the wizard**

Add `role` state initialised to `null`, and render a picker when it is null.
Once a role is chosen, drive the wizard from `stepsFor(role)` and switch the
step blocks from `step === 0|1|2` to the step NAME
(`stepsFor(role)[step] === "academics"`), so the same screens serve every role
that includes them.

```tsx
const [role, setRole] = useState<string | null>(null);
const steps = stepsFor(role ?? "student");
const current = steps[step];

if (!role) {
  return (
    <RoleChooser
      onChoose={(chosen) => {
        setRole(chosen);
        setStep(0);
      }}
    />
  );
}
```

`RoleChooser` is three buttons — "I'm a student", "I'm a faculty member",
"I'm an institution admin" — each calling `onChoose` with `"student"`,
`"faculty"`, `"admin"`. Under the faculty and admin buttons, render the honest
caveat: "Faculty and admin access needs approval from your institution's admin
before it takes effect." Announce the gate rather than surprising them with it
after signup.

- [ ] **Step 3: Add the new step screens**

Three screens the student flow does not have:

- `institution` — one text input for the institution code, plus a "Skip for
  now" affordance **only when `role === "student"`** (faculty and admin
  require a code; Task 4's endpoint returns 400 without one).
- `teaching` — department text input and a comma-separated subjects input.
- `institution_create` / `invite_faculty` — institution name input, then an
  email input to invite the first faculty member (`invite_faculty` may be
  skipped).

- [ ] **Step 4: Send the new fields on completion**

The existing completion call must now carry the role fields:

```tsx
await api.post("/api/onboarding/complete", {
  role,
  institution_code: institutionCode || undefined,
  department: department || undefined,
  subjects: subjects
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  branch,
  year,
  goals,
});
```

Match the existing file's own API-call style (whatever helper it already uses
for the current completion call) rather than introducing a new one. If the
response has `pending_approval: true`, route to a "waiting for approval"
screen instead of the dashboard — a pending faculty has no faculty privileges
yet, and silently landing them on a student dashboard would look like a bug.

- [ ] **Step 5: Verify the build and the existing student path**

Run: `bun run build` (or the project's typecheck script from `package.json`)
Expected: no TypeScript errors.

Run: `bun test`
Expected: all frontend tests pass, including Task 6's.

Manually walk the student path end to end and confirm it behaves exactly as
before: three steps, skippable institution code, project seeding still fires.

- [ ] **Step 6: Commit**

```bash
git add src/routes/onboarding.tsx
git commit -m "feat: branch onboarding by role with an approval-pending state"
```

---

## Task 8: Route users to their role's landing surface

**Files:**

- Modify: `src/routes/__root.tsx` (or wherever the post-login redirect is decided — confirm by reading it first)

**Interfaces:**

- Consumes: `GET /api/onboarding/status` returning `{complete, role, steps, pending_approval}` (Task 4).
- Produces: no new exports.

- [ ] **Step 1: Find the current post-login redirect**

Read `src/routes/__root.tsx` and `src/routes/login.tsx` (244 lines) and locate
where a logged-in user is sent after auth, and where an incomplete onboarding
redirect happens today. Do not guess — the redirect must be changed in the one
place that already owns it.

- [ ] **Step 2: Branch the destination on role**

Rules, in order:

1. `complete === false` → `/onboarding` (unchanged behavior).
2. `pending_approval === true` → the approval-pending screen.
3. `role === "admin"` → the institution/admin dashboard.
4. `role === "faculty"` → the faculty dashboard.
5. Otherwise → the existing student dashboard.

Students land exactly where they land today; only the new roles branch. If a
faculty or admin dashboard route does not exist yet, send them to the existing
institution surface that `backend/api/institution.py` already serves
(`/api/institution/dashboard`) rather than inventing a new route in this task —
the faculty console is a later plan.

- [ ] **Step 3: Verify**

Run: `bun run build` — expected no type errors.
Run: `bun test` — expected all pass.

Manually: log in as an existing (student) account and confirm the destination
is unchanged.

- [ ] **Step 4: Commit**

```bash
git add src/routes/__root.tsx
git commit -m "feat: route each role to its own landing surface after login"
```

---

## Task 9: Self-serve institution creation, safely

**Files:**

- Modify: `backend/api/institution.py`
- Test: `backend/tests/test_onboarding_api.py`

**Interfaces:**

- Consumes: `models.schemas.InstitutionCreate` (Task 3); `institutions.verified_at` (Task 1); `core.deps.get_current_user`.
- Produces: `POST /api/institution` → `{"id": str, "invite_code": str, "verified": False}`. Grants the creator `role="admin"` and links them.

Why this is safe to leave open: a new institution is **empty**, and every
`institution.py` query filters by `institution_id`, so creating one exposes
nothing. The abuse to prevent is name-squatting (register a real college's name,
share the code, harvest the students who join), which Task 10 handles by gating
bulk data on verification. The guard that belongs _here_ is rule 1 below.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_onboarding_api.py`:

```python
def test_creating_an_institution_makes_the_creator_an_unverified_admin(monkeypatch, fake_supabase):
    from api import institution as inst_api
    from models.schemas import InstitutionCreate

    fake_supabase.preload("institutions", [])
    fake_supabase.preload("institution_members", [])
    fake_supabase.preload("profiles", [{"id": "u1", "role": "student", "institution_id": None}])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    out = inst_api.create_institution(
        InstitutionCreate(name="Sunrise Institute of Technology"),
        user={"id": "u1", "profile": {"role": "student", "institution_id": None}},
    )
    assert out["verified"] is False
    assert out["invite_code"]

    row = fake_supabase.table("institutions").inserts[-1]
    assert row["status"] == "pilot", "self-serve starts as a pilot, not an active customer"
    assert row["verified_at"] is None, "self-serve is never pre-verified"
    assert row["seat_limit"] == inst_api.SELF_SERVE_SEAT_LIMIT
    assert row["admin_profile_id"] == "u1"

    written = fake_supabase.table("profiles").updates[-1]
    assert written["role"] == "admin"
    assert written["institution_id"] == row["id"]


def test_a_user_already_in_an_institution_cannot_create_one(monkeypatch, fake_supabase):
    """Otherwise a student at a real paying college creates their own
    institution, overwrites their institution_id, and walks out from under
    their college's oversight — as an admin."""
    from fastapi import HTTPException

    from api import institution as inst_api
    from models.schemas import InstitutionCreate

    fake_supabase.preload("institutions", [])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    with pytest.raises(HTTPException) as exc:
        inst_api.create_institution(
            InstitutionCreate(name="Breakaway College"),
            user={"id": "u2", "profile": {"role": "student", "institution_id": "inst-1"}},
        )
    assert exc.value.status_code == 409
    assert fake_supabase.table("institutions").inserts == []
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `python -m pytest tests/test_onboarding_api.py -k institution -v`
Expected: FAIL — `AttributeError: module 'api.institution' has no attribute 'create_institution'`

- [ ] **Step 3: Write minimal implementation**

Add to `backend/api/institution.py` (imports and a constant near the top):

```python
import secrets

from core.deps import get_current_user
from models.schemas import InstitutionCreate

# Seat cap for an institution nobody has verified yet. Deliberately small: it
# bounds the blast radius of a name-squatter, and we raise it by hand when a
# real college is verified at sale time.
SELF_SERVE_SEAT_LIMIT = 25
```

Then the endpoint:

```python
@router.post("", status_code=201)
def create_institution(body: InstitutionCreate, user=Depends(get_current_user)):
    """Self-serve a pilot institution and become its admin.

    Open on purpose: a curious HOD can try the product on a Saturday without
    emailing us, which is the top of the B2B funnel. It is safe because the new
    institution is EMPTY and unverified — see Task 10 for what unverified
    cannot do.

    The one hard refusal is a user who already belongs to an institution:
    letting them create their own would silently move them out from under their
    college's oversight and hand them admin over the new shell.
    """
    profile = user.get("profile") or {}
    if profile.get("institution_id"):
        raise HTTPException(
            status_code=409,
            detail="You already belong to an institution. Ask its admin for access.",
        )

    sb = get_supabase()
    name = body.name.strip()
    if not name:
        raise HTTPException(status_code=400, detail="An institution name is required.")

    row = {
        "name": name,
        "tier": body.tier,
        "status": "pilot",
        "seat_limit": SELF_SERVE_SEAT_LIMIT,
        "admin_profile_id": user["id"],
        "invite_code": secrets.token_hex(4).upper(),
        # Verification is a human step we perform at sale time, never automatic.
        "verified_at": None,
    }
    created = sb.table("institutions").insert(row).execute().data[0]

    sb.table("profiles").update(
        {"role": "admin", "institution_id": created["id"]}
    ).eq("id", user["id"]).execute()
    sb.table("institution_members").insert({
        "institution_id": created["id"],
        "profile_id": user["id"],
        "status": "active",
        "requested_role": "admin",
        "approved_at": datetime.now(timezone.utc).isoformat(),
    }).execute()

    return {"id": created["id"], "invite_code": created["invite_code"], "verified": False}
```

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `python -m pytest tests/test_onboarding_api.py -v`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add backend/api/institution.py backend/tests/test_onboarding_api.py
git commit -m "feat: allow self-serve pilot institutions with a squatting guard"
```

---

## Task 10: Gate bulk student data on verification

**Files:**

- Modify: `backend/api/institution.py:143` (`list_students`), `:240` (`readiness_report`), `:391` (`export_csv`)
- Test: `backend/tests/test_onboarding_api.py`

**Interfaces:**

- Consumes: `institutions.verified_at` (Task 1); existing `require_admin`, `_get_institution`, `_get_institution_id`.
- Produces: `require_verified_institution(user) -> dict` in `backend/api/institution.py`, raising 403 with `error: "institution_unverified"`.

These three endpoints return aggregated data across every student in an
institution — precisely what a name-squatter would want. Everything else (running
assessed sessions, seeing your own teams) stays available, so a genuine trial is
unaffected.

- [ ] **Step 1: Write the failing test**

Append to `backend/tests/test_onboarding_api.py`:

```python
def test_an_unverified_institution_cannot_list_its_students(monkeypatch, fake_supabase):
    from fastapi import HTTPException

    from api import institution as inst_api

    fake_supabase.preload("institutions", [{
        "id": "inst-1", "name": "Sunrise Institute", "status": "pilot", "verified_at": None,
    }])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    with pytest.raises(HTTPException) as exc:
        inst_api.require_verified_institution(
            {"id": "u1", "profile": {"role": "admin", "institution_id": "inst-1"}}
        )
    assert exc.value.status_code == 403
    assert exc.value.detail["error"] == "institution_unverified"


def test_a_verified_institution_passes_the_gate(monkeypatch, fake_supabase):
    from api import institution as inst_api

    fake_supabase.preload("institutions", [{
        "id": "inst-1", "name": "NIT Trichy", "status": "active",
        "verified_at": "2026-07-01T00:00:00Z",
    }])
    monkeypatch.setattr(inst_api, "get_supabase", lambda: fake_supabase)

    out = inst_api.require_verified_institution(
        {"id": "u1", "profile": {"role": "admin", "institution_id": "inst-1"}}
    )
    assert out["id"] == "inst-1"
```

- [ ] **Step 2: Run test to verify it fails**

Run from `backend/`: `python -m pytest tests/test_onboarding_api.py -k verified -v`
Expected: FAIL — `AttributeError: module 'api.institution' has no attribute 'require_verified_institution'`

- [ ] **Step 3: Write minimal implementation**

Add to `backend/api/institution.py`:

```python
def require_verified_institution(user: dict) -> dict:
    """Gate for endpoints that return data about OTHER students in bulk.

    Anyone may self-serve an institution, so an unverified one must not become a
    way to harvest a real college's cohort by registering its name and sharing
    the invite code. Verification is set by hand at sale time.
    """
    sb = get_supabase()
    institution = _get_institution(sb, _get_institution_id(user))
    if not institution.get("verified_at"):
        raise HTTPException(
            status_code=403,
            detail={
                "error": "institution_unverified",
                "message": (
                    "This institution has not been verified yet. Contact us to verify it "
                    "and unlock cohort reports and exports."
                ),
            },
        )
    return institution
```

Then call it as the first line of the three bulk endpoints — `list_students`
(`:143`), `readiness_report` (`:240`) and `export_csv` (`:391`):

```python
    require_verified_institution(user)
```

Leave `dashboard` (`:32`), `weak_topics` (`:327`) and `invite_students` (`:374`)
ungated: an unverified pilot admin still needs to invite people and see their own
institution's summary, or a genuine trial is useless.

- [ ] **Step 4: Run test to verify it passes**

Run from `backend/`: `python -m pytest tests/test_onboarding_api.py -v`
Expected: PASS (12 tests)

Then: `python -m pytest -q` — expected all green.

- [ ] **Step 5: Commit**

```bash
git add backend/api/institution.py backend/tests/test_onboarding_api.py
git commit -m "feat: require institution verification for bulk student data"
```

---

## Self-Review

**Spec coverage (Part 1 of the design doc):**

- Role model (student/faculty/admin on `profiles.role`) → Tasks 2, 4.
- Invite-primary linking → Task 5 (approval) + existing `institution.py:374` `invite_students`, unchanged.
- Institution code fallback, student-only → Tasks 4, 7.
- Faculty never granted by code; `requested_role` + `approved_at` gate → Tasks 1, 2, 4, 5.
- Admin self-serve at `status='pilot'` → Tasks 9, 10 (creation, squatting guard, verification gate).
- Branched onboarding flows → Tasks 6, 7.
- `complete_onboarding` / `onboarding_status` extended → Task 4.
- Route guards per role → Task 8.
- `require_admin` untouched → honored throughout.

**The first-admin gap, now closed (Tasks 9-10).** Self-serve creation is left
open because a new institution is empty and every `institution.py` query filters
by `institution_id` — creating one exposes nothing. Four guards carry the risk
instead:

1. A user who already belongs to an institution cannot create one (Task 9) —
   otherwise a student at a paying college moves out from under its oversight
   and becomes admin of their own shell.
2. Self-serve institutions are unverified, and students see that before joining
   (`verified_at`, Task 1).
3. Bulk cohort data — `list_students`, `readiness_report`, `export_csv` — is
   gated on verification (Task 10). That is what a name-squatter actually wants.
4. Unverified pilots get `SELF_SERVE_SEAT_LIMIT = 25` seats, bounding the blast
   radius of a successful squat.

Verification is a human step performed at sale time, which makes it a _sales_
gate rather than a signup blocker.

**Not built, deliberately:** email-domain binding (requiring `@college.edu` to
join an institution). It is the strongest control and standard practice, but many
Indian colleges have students on Gmail, so as a hard requirement it would block
real customers. Better later as an optional per-institution setting.

**Frontend follow-through:** Task 7 Step 3's `institution_create` screen must
`POST /api/institution` (Task 9) before completing onboarding, and render the
returned `invite_code` so the new admin can share it. Task 8's admin destination
should surface the unverified state rather than hiding it.

**Placeholder scan:** no TBD/TODO. Every code step carries real code. Task 7
and 8 are edit-in-place tasks against files whose exact current shape must be
read first, so they specify rules and the exact fields to send rather than a
full file rewrite — deliberate, not a placeholder.

**Type consistency:** `ROLE_STEPS` values match between
`onboarding_service.py` (Task 2) and `onboarding-flow.ts` (Task 6) —
`student: institution/academics/project`, `faculty: institution/teaching`,
`admin: institution_create/invite_faculty`. `resolve_role`, `effective_role`,
`steps_for`, `onboarding_state`, `can_approve` are named identically where used
in Tasks 4 and 5. `FacultyApproval(member_id, approve)` and
`InstitutionCreate(name, tier)` match Task 3's definitions.

**Note on `effective_role`:** defined and tested in Task 2 but not consumed by
Tasks 4-8, because approval writes the granted role directly to
`profiles.role`. It is the reference implementation of the gate rule and the
guard for any future code path that reads a claim before approval. Keep it.
