# Quality Upgrade — Root Causes, Architecture, Risks

This documents the comprehensive quality upgrade covering the live-session engine
(double greeting, silent audio, personas/scenarios, evidence-based feedback),
Kanban, and Teams. Migration: `backend/migrations/002_quality_upgrade.sql`.

## Per-issue root cause

### 1. Double greeting
The client opened its mic gate on Gemini's `turn_complete` while several
seconds of greeting audio were still scheduled in the playback `AudioContext`.
Capture and playback use separate `AudioContext`s (defeating the browser's
echo cancellation), so the tail of the greeting leaked into the mic and Gemini
heard itself, greeting a second time. Secondary cause: two independent
greeting mechanisms (`SPEAK FIRST` in the system prompt *and* an explicit
greeting-trigger turn) that could both fire.

**Fix:** the client now opens the mic gate only after the scheduled playback
actually drains (`remainingPlaybackMs()` in `src/lib/useLiveSession.ts`, gate
opens after the remaining audio duration + a small acoustic-latency pad), with
immediate opening on barge-in (`interrupted`). The server consolidates to a
single greeting source (the explicit trigger; the prompt now just says "wait
for the start message"), plus a narrow, always-on, safety-netted server-side
mic gate as defense-in-depth for old/broken clients (`api/live.py`,
`first_turn_done` event, 20s safety release so it can never deadlock).

### 2. Configured (project-based / non-English) Mock Viva connected but produced no audio
Discovered and fixed *during* this upgrade (not present in the original issue
list, but a direct regression surfaced once the "backend is not running" bug —
issue 6 below — was fixed and non-English sessions could finally reach Gemini).
Gemini's half-cascade Live models synthesize speech via TTS, which needs an
explicit target language (`speech_config.language_code`). Without it, a
non-English session produced a transcript (text generation succeeded) but no
audio (TTS had no language to render). A second, independent bug was present
in how the audio bytes were read from the SDK response
(`response.data` vs. `server_content.model_turn.parts[].inline_data`) across
`google-genai` versions.

**Fix:** `core/languages.py:audio_language_code()` maps each supported
language to a BCP-47 code, set on `speech_config.language_code` for every
non-English language (English stays unset — zero risk to the already-working
path); `connect_with_fallback` retries once with the code stripped if a model
rejects it. `api/live.py:_response_audio_chunks()` reads audio from both SDK
response shapes so the app is robust to `google-genai` version drift.

### 3. Shallow scenarios and personas
Personas were a single tone sentence; all coach scenarios shared one
generic playbook, defined only in the frontend.

**Fix:** `backend/ai/registry.py` — 20 scenarios across 5 categories
(academic, placement, corporate, public, school/daily), each with a
role, objectives, dialogue style, interaction policy, coaching focus, and a
weighted rubric. 5 personas (`friendly`, `calm`, `balanced`, `strict`,
`hostile`) as a 7-axis behavioral matrix, not just a tone string. Server-owned
via `GET /api/catalog/scenarios` / `/personas` (prompt text stays private).

### 4. Generic feedback
Live tips came from a sparse, undeduped `flag_moment` tool with no evidence
requirement; the final report was one text-model pass with no citation
discipline; pitch persisted nothing.

**Fix:** `log_observation` tool requires evidence (a quote or concrete visible
detail) for every call, deduped per `(dimension, kind)` within a 20s window
(`LivePersistence.on_tool`). Deterministic delivery metrics
(`ai/delivery_metrics.py:from_transcript`) compute filler rate, estimated WPM,
talk ratio, response latency, and longest monologue directly from the
timestamped transcript — no model call, always available. The report
generator (`ai/report_service.py`) feeds the rubric + timestamped transcript +
observation log to one `generate_json` call under hard citation rules, then
`_validate_report()` — a pure function — drops any finding whose
`evidence_refs` don't resolve, forces `body_language: not_observed` when the
camera was off, clamps scores, and recomputes the overall score as the
rubric-weighted mean (fixing the old bug where
`clarity == confidence == coverage == overall`). Pitch now launches a real
`presentation_sessions` row (`session_type: "Pitch"`) and persists a report
through the same path as Presentation and Coach.

### 5. Fake Kanban / orphaned teams
Tasks board was 3 columns with a "move to next" button and no persisted
order; `create_team` inserted the membership row without checking the
result, so a failed insert could return 201 with an orphaned team invisible
to its own creator (`list_teams` is membership-driven).

**Fix (Kanban):** `@dnd-kit` board with 4 columns (adds `Review`), a
`sort_order` column with sparse (×1000) spacing (`compute_sort_order` in
`api/tasks.py`), a `PUT /api/projects/{id}/tasks/reorder` batch endpoint, and
full TanStack Query optimistic-update cycle (`useReorderTasks`).

**Fix (Teams):** `create_team_with_lead` Postgres RPC does the team insert +
Lead membership insert atomically. If the RPC hasn't reached an older
Supabase instance yet, a compensating fallback inserts both rows manually and
rolls back (deletes the team) if the membership insert fails — the API can
never return 201 with an orphan again. `list_teams` also self-heals: any
`created_by`-owned team missing its membership row gets one inserted on read,
so historical orphans become visible and functional.

### 6. "Backend is not running" on non-English project viva
`viva_sessions.language` CHECK allowed only 3 languages against 13 offered in
the UI. The failed insert became an unhandled 500, and because FastAPI's
`ServerErrorMiddleware` sits *outside* `CORSMiddleware`, that 500 carried no
CORS headers — the browser blocked the response outright, and every fetch
rejection was mapped to a generic "backend is not running" message.

**Fix:** migration widens the CHECK to all 13 languages (and adds `calm` to
the persona CHECK). `core/errors.py:CatchAllErrorMiddleware` is a pure-ASGI
middleware added **before** `CORSMiddleware` in code order (last-added =
outermost), so every unhandled 500 still passes back out through CORS and is
readable by the browser. `core/languages.py:normalize_language()` is a
belt-and-braces server-side guard. `src/lib/api.ts`'s network-error message
now distinguishes "unreachable" from "reached the server but it crashed /
CORS blocked the response."

## Architecture decisions

- **Evidence-log pattern (WS3).** The live model is only ever asked to
  *observe*, never to *score*. Scoring happens once, post-session, from
  persisted evidence (transcript + observation log + deterministic metrics).
  This mirrors the dominant production pattern in realtime AI coaching
  (LiveKit Agents' thin-conversation/fat-analysis split; Yoodli/Orai-style
  separation of the conversational layer from the analytics layer) —
  it keeps the latency-sensitive live prompt small and stable, and makes the
  report auditable (`_validate_report` can mechanically reject unsupported
  claims because every claim carries an `evidence_refs` list).

- **Registry composition (WS2).** Scenario and persona are orthogonal
  dataclasses composed into the live system prompt (`render_scenario_block` +
  `render_persona_block`), not string interpolation into one blob. This is
  what makes personas *observably* different (a 7-axis behavioral contract,
  not one adjective) while keeping the catalog unit-testable (rubric weights
  sum to 1.0, every `report_framework` reference resolves, every scenario ×
  persona × mode combination fits the live instruction budget — enforced by
  `tests/test_registry.py`).

- **Error-middleware ordering.** `app.add_middleware()` calls stack
  last-added-outermost. The catch-all is added *before* `CORSMiddleware` so
  CORS wraps it. This is the one ordering that makes an unhandled exception
  produce a CORS-visible response — the alternative
  (`@app.exception_handler(Exception)`) runs in Starlette's
  `ServerErrorMiddleware`, which sits outside `CORSMiddleware` regardless of
  decoration order, and silently reproduces the original bug.

- **Dual tool-name transition.** `flag_moment` (legacy) and `log_observation`
  (current) are both registered as live tools and both handled in
  `LivePersistence.on_tool`. This means an in-flight session or a model that
  still emits the legacy name never silently drops an observation — the two
  names were kept side by side rather than a hard cutover.

## Remaining risks

- **Prompt-budget headroom.** Every scenario × persona × mode combination
  measures ~5.5k characters against a 9k test ceiling (`test_registry.py`) —
  comfortable headroom today, but a good scenario/persona addition should
  re-run that test, not just eyeball length.
- **Server-side mic gate is unconditional but narrow.** It only ever gates
  audio frames before the *first* `turn_complete`, with a 20s safety release —
  bounded and tested (`test_live_gate.py`), but it is new production surface.
- **`_validate_report` degrades gracefully, not silently.** If the model
  fabricates a claim with no matching evidence id, the finding is dropped —
  the report can end up sparser than the conversation, which is correct
  behavior but worth knowing when debugging a "thin" report.
- **No RLS in this schema; the backend uses the Supabase service-role key.**
  All authorization is enforced in Python (`core/deps.py`,
  `require_project_owner`, team-membership checks). This is intentional given
  the current single-service architecture, but it means a bug in one of those
  checks is not backstopped by the database.

## Future recommendations

- If report generation cost/latency grows, move `report_service.build_report`
  off the finalize hot path into a queued job keyed by `session_id`, since all
  of its inputs (transcript, observations, metrics) are already persisted to
  `session_events` before the report call runs.
- If the scenario catalog needs to grow beyond a static Python list (e.g.
  per-institution custom scenarios), introduce a repository interface in
  front of `ai/registry.py` rather than hand-editing the literal — the
  dataclass validation tests should move with it.
- Kanban `sort_order` uses integer ×1000 spacing with gap renumbering; if
  multi-user concurrent drag contention becomes a real problem, migrate to
  fractional/lexicographic rank keys (no renumbering, no cross-client races).
