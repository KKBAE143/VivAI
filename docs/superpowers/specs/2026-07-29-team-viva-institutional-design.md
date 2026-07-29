# Team Viva for Institutions — Design

Date: 2026-07-29
Status: awaiting review

## Goal

Turn Team Viva from an experimental student-lead feature into the platform's
flagship institutional feature: a faculty-conducted group oral exam that
produces per-student, attributed, defensible marks — with faculty able to
observe, pause, and take over the AI live.

This is **integrated into the existing project**, not a standalone build. Every
change extends what is already in `backend/ai/team_room.py`,
`backend/api/team_live.py`, `src/lib/useTeamViva.ts` and
`src/components/live/team-viva-room.tsx`. Existing student-lead practice
sessions must keep working exactly as they do today.

## Verified current state

Established by reading the code, not assumed:

- `backend/main.py:98` registers `team_live.router` — the feature is wired end
  to end, not a stub. `tests/test_team_room_reconnect.py` passes.
- **Students cannot hear each other.** `route_client_audio` →
  `_enqueue_audio` → pump to Gemini only. `broadcast_bytes` is called *only*
  for AI speech. There is no human-to-human audio path in the room at all.
- **Faculty cannot join a room.** `team_live.py:135` closes the socket for
  anyone failing `_membership(team_id, user_id)`. Faculty are not team members.
- **Only the team lead can create or start a session.** `team_live.py:42`
  raises 403 otherwise; `VoiceRoom.start` re-checks `requester_id == lead_id`.
- **The room has no pause.** `VoiceRoom` has no pause/resume state; solo live's
  pause is client-side only and does not exist here.
- `MAX_PARTICIPANTS = 5` counts raw connections, so an observer would consume a
  student slot.
- `backend/migrations/006_institutional.sql` already defines the whole identity
  layer: `profiles.role` (CHECK `student|faculty|admin`),
  `profiles.institution_id`, `institutions` (with `invite_code`, `status
  pilot|active|expired`, seat caps), and `institution_members` (`status
  active|invited`). `require_admin` (`backend/core/deps.py:103-121`) already
  gates on role + `institution_id`. **Nothing populates any of it** — no
  registration path sets a role. So identity is a wiring gap, not a schema gap.
- `teams` has no `institution_id` (columns: `id, name, project_id, invite_code,
  created_at, created_by`), so a team cannot be resolved to an institution
  directly. This is why faculty authority is recorded on the session instead.
- `src/routes/onboarding.tsx` is a fixed 3-step student-only flow (project
  seeding). No role selection, no faculty or admin path.
- Nothing guarantees the AI calls on every participant. The model decides via
  `call_on_participant`, unchecked.

## Non-goals

- No "pressure/rapid-fire" intensity modes. The examiner stays realistic.
- No replacement of the real viva. Marks are advisory until faculty sign-off.
- No changes to solo live sessions beyond what is shared in `live_service.py`.

---

## Part 1 — Identity: registration, roles, onboarding

### Problem

There is login but no notion of *what kind of user* signed up. Every
institutional feature (faculty dashboard, admin panel, assessed sessions) is
gated on `role` + `institution_id`, and nothing ever populates them.

### Role model

Three roles on the existing profiles `role` field:

| Role | Gets | Institution link |
|---|---|---|
| `student` | practice + assessed sessions, own reports | optional |
| `faculty` | creates assessed sessions, faculty dashboard, live takeover | required |
| `admin` | institution-wide dashboards, faculty/student management | required |

`role` defaults to `student` so every existing account keeps working untouched.

### Institution linking, and why it is gated

An account claiming `faculty` must not be self-certifying — otherwise any
student registers as faculty and reads classmates' reports. Two paths:

1. **Invite (primary).** An `admin` invites faculty/students by email from the
   admin panel. The invite carries `institution_id` + `role`; accepting it sets
   both. `backend/api/institution.py:374` already has `invite_students` to
   extend rather than replace.
2. **Institution code (fallback).** `institutions.invite_code` already exists. A
   user entering it during onboarding is linked as `student` only. Faculty role
   is never granted by code. A self-selected `faculty` claim is stored as
   `institution_members.requested_role` with `approved_at IS NULL` and carries
   **no privileges** until an admin approves it — `require_admin` continues to
   read `profiles.role`, which stays `student` until approval.

An admin may self-serve: creating an institution puts it in `status='pilot'`
(already in the schema) with a low seat cap, which we flip to `active` at sale
time. That keeps signup unblocked without handing out institutional trust.

### Onboarding flow

Post-login, branch on state rather than assuming a student:

- Not onboarded → **role selection** (Student / Faculty / Admin), then the
  role's own steps.
- **Student:** institution code (optional, skippable) → branch/year → project
  seeding (the current 3 steps, preserved).
- **Faculty:** invite acceptance or institution code → department/subjects
  taught → done. If unapproved, land on a "pending approval" screen.
- **Admin:** institution name/details → invite first faculty → done.

`complete_onboarding` (`backend/api/auth.py:176`) is extended to accept role +
institution fields; `onboarding_status` reports which flow and step. Route
guards send each role to its own landing surface after login.

### Gaps fixed here

- Nothing sets `role`/`institution_id` → onboarding now does.
- Self-certified faculty would be a data-leak hole → invite-or-approval gate.
- Onboarding assumes "student with a project" → branches by role.

---

## Part 2 — Session origin: practice and assessed

Two origins, one room engine. Distinguished by a marker on the session
(`created_by` role / `assessed` flag in `viva_sessions.context`):

- **Practice (existing, unchanged).** Student lead creates, lead starts.
  `team_live.py:42` behavior preserved verbatim for this path. No institutional
  record.
- **Assessed (new).** Faculty creates from the faculty dashboard, picks the
  team, sets subject/project context, gets a join code. Students join from
  their own logins — identity comes from the JWT, never a typed name, which is
  what makes per-student marks defensible.

Faculty attendance is **optional per session**, not a mode: the scalability
pitch ("faculty need not attend") and the control objection ("but you can, and
you can take over") are both satisfied without a second code path.

Assessed sessions with no faculty present auto-start on quorum
(`MIN_PARTICIPANTS_TO_START = 3`) — nobody in the room has authority to press
start, so nobody should have to.

---

## Part 3 — Human-to-human audio relay

The core missing capability. Everyone must hear whoever is speaking: students
and faculty alike.

### Design

`route_client_audio(profile_id, data)` gains a fan-out step alongside the
existing Gemini pump:

1. Accept audio from any client cleared to speak — the AI-granted floor holder,
   or faculty when they hold the floor.
2. **Broadcast** that audio to every *other* connected participant (skip the
   sender, who hears themselves acoustically).
3. **Forward to Gemini** only what the AI should hear: the floor holder's
   answers, and faculty speech while faculty holds the floor (so the transcript
   captures faculty questions).

Mic frames from participants with no floor are still dropped server-side, as
today. That is what keeps the graded transcript clean and is preserved.

### Client changes

`useTeamViva.ts` currently treats every inbound binary frame as AI speech at
24kHz. Student mic is PCM16 **16kHz**, so a relayed student frame played at
24kHz would be chipmunked. Frames therefore need a sample-rate tag — a small
header or a parallel JSON `speaking` event naming the sender and rate — and two
playback paths. This is the subtlest part of the feature and the most likely
source of "it sounds broken" bugs.

### Consequences accepted

Students can talk over each other, and transcript attribution gets murkier when
they do. Accepted deliberately: it makes the room a real group viva. Floor
control still means only one student is *asked* at a time, so grading stays
attributable even when side conversation happens.

---

## Part 4 — Faculty live controls

Prerequisites (both currently blocking):

- `team_live.py:135` gains a second accepted entry path: `faculty`/`admin` whose
  `institution_id` matches the team's institution. Team membership is no longer
  the only key.
- Observers are tracked separately from participants so faculty never consume a
  student slot against `MAX_PARTICIPANTS` and are never eligible for the
  AI-granted floor.

Controls, in build order:

1. **Observe** — join silently, hear AI + all participants, see live scoring and
   floor state. Mostly reuses existing lobby/floor broadcasts.
2. **Pause / resume AI** — new room-level `paused` state. The AI stops taking
   turns; the Gemini connection is *not* torn down (tearing it down would lose
   the conversation and re-trigger the greeting path). While paused, audio relay
   between humans continues.
3. **Manual floor grant** — faculty picks a student, overriding the model's
   `call_on_participant`.
4. **Take over / hand back** — faculty speaks to the room; on hand-back the AI
   resumes with the conversation intact and is told what faculty already asked,
   so it does not repeat the question.

Faculty questions and faculty-assigned scores are recorded **attributed to
faculty**, not the AI. The report shows plainly which marks are human — worth
more to a HOD than the AI's own scores.

### Risk called out

Hand-back is the same class of problem as the double-greeting bug fixed on
2026-07-29 (`live.py`: greeting gated on the resumption handle rather than a
"have we greeted" flag). Resuming an AI mid-session without it repeating itself
needs an explicit state flag and its own regression test, not a prompt request.

---

## Part 5 — Per-student coverage tracking

For institutional marks this is not optional: **a student who was never asked a
question cannot be graded.** The model currently decides who to call on, with
nothing verifying it covered everyone.

- The room tracks questions-asked per participant.
- Under-questioned participants are surfaced to the AI (and to faculty in the
  live UI) so the imbalance is corrected during the session.
- The report carries a coverage line per student, so an unbalanced viva is
  visible rather than silent.

## Part 6 — Outputs

- **Per-student report:** questions asked, answers, rubric scores, coverage,
  and which marks came from faculty vs AI.
- **Faculty team roll-up:** all members side by side, per-question detail,
  score override, sign-off. Signed reports are the accreditation artifact.
- **Admin/HOD:** aggregates across teams, hung on the existing
  `institution.py` dashboard/readiness scaffolding.

Because an unattended assessed session means the report *is* the product, it
must be defensible standalone — hence coverage tracking above.

## Part 7 — In-app feature explainers

Every AI feature gets a short "How this works / What it does not do" panel
written for faculty, not students. For Team Viva, stated plainly: the examiner
is AI; sessions are unlimited so students can fail safely and repeat; marks are
advisory until faculty sign-off; this prepares students for the real viva and
hands faculty the evidence — it does not replace the viva.

Conceding the limits up front is what makes the rest credible, and it answers
the "AI can't replace me" objection before it is raised. Small, independent
piece of work; no dependency on Parts 1-6.

---

## Testing

- **Unit/integration (pytest, existing fakes):** role gating on session
  creation; faculty admitted without team membership; observer excluded from
  slot count and floor eligibility; audio relay fan-out targets (sender
  excluded, Gemini receives only floor + faculty); pause blocks AI turns without
  dropping the connection; hand-back does not re-greet; coverage tracking
  counts per participant.
- **Frontend (bun test):** dual-rate playback routing; role-branched onboarding
  step machine.
- **Manual, and mandatory:** 3+ real browsers in one room, plus a faculty
  observer. Every fake-based test passes today while the feature still feels
  experimental — concurrent real clients are the unverified risk, including a
  floor holder dropping mid-answer (the floor may currently never be reclaimed;
  unconfirmed).

## Build order

1. Identity: roles, invites, branched onboarding (unblocks everything).
2. Faculty room entry + observer accounting.
3. Human-to-human audio relay (highest user-visible value).
4. Pause/resume + manual floor grant.
5. Takeover + hand-back.
6. Coverage tracking + reports.
7. Feature explainer panels (independent; any time).

## Resolved blockers

Each blocker from "Verified current state" with its chosen solution.

**Identity schema already exists.** `backend/migrations/006_institutional.sql`
adds `profiles.role` (CHECK `student|faculty|admin`), `profiles.institution_id`,
an `institutions` table with `invite_code`, and `institution_members` with
`status active|invited`. Part 1 is therefore *wiring*, not schema work. The only
new migration needed is `requested_role` + `approved_at` on
`institution_members`, to hold a self-selected faculty claim that an admin has
not yet approved.

**Faculty room entry, without touching `teams`.** `teams` has no
`institution_id` (columns: `id, name, project_id, invite_code, created_at,
created_by`), so team→institution cannot be resolved directly. Rather than add
a column and backfill it, an assessed session records `faculty_id` and
`institution_id` into `viva_sessions.context` at creation. Room entry resolves
to one of three outcomes: team member → participant; faculty/admin whose
`institution_id` matches the session's → observer; otherwise reject. Authority
is recorded on the object that actually carries it, and no migration is needed.

**Observer accounting.** A separate `observers` dict alongside `connections`.
`MAX_PARTICIPANTS` and floor eligibility read `connections` only; broadcasts
iterate both. Faculty can never be selected by `call_on_participant`.

**Audio relay sample rates.** Reuse the protocol-version negotiation already
used on the solo live socket (`pv=1`). Clients sending `pv>=1` receive every
binary frame with a small header carrying kind (AI vs human) and rate code, and
route to the matching playback path. Clients without `pv` keep receiving
untagged AI-only audio exactly as today — non-breaking by construction.

**Room pause.** A `paused` flag gating the Gemini pump: while paused the model
receives no audio and so stays silent, while the human relay keeps running so
faculty and students talk normally. The Gemini connection is never torn down.

**Hand-back without repeating.** On resume, inject a text turn carrying what
faculty asked and what the student answered, plus an explicit instruction not to
repeat it. Same shape as the `_greeted` flag fix (2026-07-29): state, not a
politely-worded prompt.

**Dropped floor holder.** A watchdog returns the floor to the AI when the floor
holder disconnects and tells the model that participant dropped, so the room
cannot stall waiting for someone who left.

**First admin per institution.** Admin self-serve creates the institution in
`status='pilot'` (already in the schema) with a low seat cap; we flip it to
`active` at sale time. Faculty role is never granted by institution code — only
by admin invite or admin approval of a `requested_role` claim.
