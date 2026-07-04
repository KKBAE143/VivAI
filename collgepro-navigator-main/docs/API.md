# API Reference

Base URL: `http://localhost:8000`. All endpoints are JSON unless noted.
Auth: send `Authorization: Bearer <access_token>` (Supabase JWT from login/signup). Auth required = **Y** unless marked **N**.

```bash
# Common curl prelude
TOKEN="<access_token>"
AUTH="Authorization: Bearer $TOKEN"
JSON="Content-Type: application/json"
```

## Auth (`/api/auth`, `/api/onboarding`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/auth/signup` | POST | N | Create account (Supabase Auth + profile row) |
| `/api/auth/login` | POST | N | Password login |
| `/api/auth/logout` | POST | Y | Stateless logout |
| `/api/auth/forgot-password` | POST | N | Send reset email |
| `/api/auth/reset-password` | POST | N | Set new password with reset token |
| `/api/auth/me` | GET | Y | Current user + profile |
| `/api/auth/profile` | PUT | Y | Update profile fields |
| `/api/onboarding/complete` | POST | Y | Mark onboarding done, save goals |
| `/api/onboarding/status` | GET | Y | `{ "complete": bool }` |

Signup request: `{ "name": str, "email": str, "password": str(min 6), "college"?: str, "year"?: str, "branch"?: str }`
Signup response: `{ "user_id": str, "access_token": str|null, "email_confirmation_required": bool }`

Login request: `{ "email": str, "password": str }`
Login response: `{ "access_token": str, "refresh_token": str, "user": { "id", "email", "profile" } }`

Profile update request (all optional): `{ "full_name", "college_name", "year", "branch", "roll_number", "bio", "avatar_url" }`

```bash
curl -X POST http://localhost:8000/api/auth/login -H "$JSON" \
  -d '{"email":"you@college.edu.in","password":"secret123"}'
```

## Projects (`/api/projects`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/projects` | GET | Y | List my projects (`?type=PBL\|Major\|Mini`) |
| `/api/projects` | POST | Y | Create project (201) |
| `/api/projects/{id}` | GET | Y | Project + tasks, teams, files, viva sessions |
| `/api/projects/{id}` | PUT | Y | Update fields |
| `/api/projects/{id}` | DELETE | Y | Delete (204) |
| `/api/projects/{id}/progress` | PUT | Y | `{ "progress": 0-100 }` |

Create request: `{ "title": str, "type": "PBL"|"Major"|"Mini", "subject"?, "tech_stack"?: [str], "problem_statement"?, "description"?, "deadline"?, "semester"? }`
Response: the project row (`id`, `owner_id`, `title`, `type`, `status`, `progress`, …).

```bash
curl -X POST http://localhost:8000/api/projects -H "$AUTH" -H "$JSON" \
  -d '{"title":"Smart Attendance","type":"PBL","tech_stack":["Python","OpenCV"]}'
```

## Teams (`/api/teams`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/teams` | GET | Y | Teams I belong to (with members + profiles) |
| `/api/teams` | POST | Y | Create team `{ "name", "project_id"? }` (creator becomes Lead) |
| `/api/teams/{id}` | GET | Y | Team detail (members only) |
| `/api/teams/{id}/invite` | POST | Y | Lead only: `{ "email" }` → returns invite code |
| `/api/teams/{id}/join` | POST | Y | `{ "code" }` join with invite code |
| `/api/teams/{id}/members/{profileId}` | DELETE | Y | Lead removes member / self-leave (204) |
| `/api/teams/{id}/members/{profileId}/role` | PUT | Y | Lead only: `{ "role": "Lead"|"Member" }` |

## Tasks (`/api`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/projects/{id}/tasks` | GET | Y | List tasks (`?status=`) |
| `/api/projects/{id}/tasks` | POST | Y | Create `{ "title", "description"?, "assignee_id"?, "priority"?: "med", "due_date"? }` |
| `/api/tasks/{taskId}` | PUT | Y | Update fields |
| `/api/tasks/{taskId}/status` | PUT | Y | `{ "status": "To Do"|"In Progress"|"Done" }` |
| `/api/tasks/{taskId}` | DELETE | Y | Delete (204) |

## Files (`/api/files`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/files/upload` | POST (multipart) | Y | `file` + optional `project_id` form fields. Max 25 MB; pdf/docx/pptx/zip/png/jpeg/webp |
| `/api/files` | GET | Y | My files |
| `/api/files/{id}` | GET | Y | File record + signed `download_url` (1 h) |
| `/api/files/{id}` | DELETE | Y | Delete file + storage object (204) |
| `/api/projects/{id}/files` | GET | Y | Files linked to a project |

```bash
curl -X POST http://localhost:8000/api/files/upload -H "$AUTH" \
  -F "file=@report.pdf" -F "project_id=<uuid>"
```

## Viva (`/api/viva`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/viva/sessions` | POST | Y | Create session |
| `/api/viva/sessions` | GET | Y | List my sessions |
| `/api/viva/sessions/{id}` | GET | Y | Session + questions |
| `/api/viva/sessions/{id}/start` | POST | Y | Start; returns first question |
| `/api/viva/sessions/{id}/answer` | POST | Y | `{ "answer", "time_taken_seconds"? }` → `{ evaluation, next_question }` |
| `/api/viva/sessions/{id}/skip` | POST | Y | Skip current question |
| `/api/viva/sessions/{id}/hint` | POST | Y | `{ "hint": str }` |
| `/api/viva/sessions/{id}/end` | POST | Y | Finish; returns summary with overall score |
| `/api/viva/sessions/{id}/transcript` | GET | Y | Full Q&A transcript |
| `/api/viva/stats` | GET | Y | `{ total_sessions, completed_sessions, avg_score, weaknesses[], strengths[] }` |

Create request: `{ "session_type": "Subject"|"Project"|"General", "subject"?, "project_id"?, "duration_minutes": 15, "difficulty": "Easy"|"Medium"|"Hard"|"Adaptive", "language": "English"|"Hindi"|"Hinglish" }`

```bash
curl -X POST http://localhost:8000/api/viva/sessions -H "$AUTH" -H "$JSON" \
  -d '{"session_type":"General","duration_minutes":5,"difficulty":"Medium"}'
```

## Presentation (`/api/presentation`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/presentation/sessions` | POST | Y | Create `{ "project_id"?, "duration_minutes": 10, "session_type": "Project" }` |
| `/api/presentation/sessions` | GET | Y | List sessions |
| `/api/presentation/sessions/{id}` | GET | Y | Session detail |
| `/api/presentation/sessions/{id}/start` | POST | Y | Mark In Progress |
| `/api/presentation/sessions/{id}/upload-slide` | POST (multipart) | Y | Slide image → Gemini feedback per slide |
| `/api/presentation/sessions/{id}/ask` | POST | Y | `{ "question" }` → coach answer |
| `/api/presentation/sessions/{id}/end` | POST | Y | Final report (clarity/confidence/coverage/overall + gaps) |

## Analytics (`/api/analytics`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/api/analytics/dashboard` | GET | Y | `{ active_projects, total_projects, avg_progress, pending_tasks, viva_sessions, avg_viva_score, presentation_sessions }` |
| `/api/analytics/activity` | GET | Y | Activity feed (`?limit=20`, max 100) |
| `/api/analytics/trends` | GET | Y | Weekly viva score trend (8 weeks) |
| `/api/analytics/leaderboard` | GET | Y | Top 20 in my college by avg viva score |

## Templates (`/api/templates`)

See `backend/api/templates.py` — read-only template listing and detail endpoints used by the Templates pages.

## Advanced (`/api/advanced`)

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/code-aware/upload` | POST (multipart) | Y | ZIP upload → code snapshot (201) |
| `/code-aware/link-github` | POST | Y | `{ "github_url", "name"?, "project_id"? }` |
| `/code-aware/snapshots` | GET | Y | My snapshots |
| `/code-aware/analyze?snapshot_id=` | POST | Y | Static + AI analysis of the codebase |
| `/code-aware/session` | POST | Y | `{ "snapshot_id", "project_id"?, "duration_minutes": 20, "language" }` |
| `/code-aware/{sessionId}/start\|answer\|end` | POST | Y | Code-grounded Q&A loop |
| `/bridge/{presentationId}/gaps` | GET | Y | Weak topics (< 70 clarity) |
| `/bridge/{presentationId}/generate-questions` | POST | Y | Gemini questions per gap |
| `/bridge/{presentationId}/launch-viva` | POST | Y | Creates a focused viva session (201) |
| `/bridge/history` | GET | Y | Past bridge gaps |
| `/team-viva/sessions` | POST | Y | `{ "team_id", "project_id"?, "subject"? }` (201) |
| `/team-viva/sessions/{id}` | GET | Y | Session + online members + scoreboard |
| `/team-viva/{id}/end` | POST | Y | Persist scores, return scoreboard |
| `/team-viva/{id}/report` | GET | Y | Stored per-member scores |
| `/faculty-sim/profiles` | POST/GET | Y | Create (upsert) / list professor personas (`?search=`) |
| `/faculty-sim/profiles/{id}` | GET | Y | Persona detail |
| `/faculty-sim/{facultyId}/session` | POST | Y | Start persona-driven session (201) |
| `/faculty-sim/sessions/{id}/start\|answer\|end` | POST | Y | Q&A loop; end accepts `{ "accuracy_rating"?: 1-5, "feedback"? }` |
| `/faculty-sim/my-sessions` | GET | Y | My FacultySim sessions |
| `/heatmap/overall` | GET | Y | Per-topic `{ topic, avg_score, question_count, trend_direction }` |
| `/heatmap/{projectId}` | GET | Y | Heatmap scoped to project |
| `/heatmap/{projectId}/detailed/{topic}` | GET | Y | Question history for a topic |
| `/heatmap/refresh` | POST | Y | Recompute + persist |
| `/predictor/topics/{subject}` | GET | Y | Topic probabilities for my college |
| `/predictor/trends?days=30` | GET | Y | Trending topics |
| `/predictor/recent-questions/{subject}` | GET | Y | Anonymized recent questions |
| `/predictor/my-risk` | GET | Y | High-frequency topics where I score low |
| `/sentiment/session` | POST | Y | Create live sentiment session (201) |
| `/sentiment/{id}/end` | POST | Y | Final scores + nudge history |
| `/sentiment/{id}/report` | GET | Y | Metrics over time + nudges |

### WebSockets

| Endpoint | Description |
|---|---|
| `ws://…/api/advanced/ws/team-viva/{sessionId}/{profileId}` | Send `{"type":"start"|"next"}` for questions, `{"type":"answer","text":…}` to answer; receive `lobby`, `question`, `answer_scored` events |
| `ws://…/api/advanced/ws/sentiment/{sessionId}` | Send `{"type":"frame","data":"<dataURL>","mime_type":"image/jpeg"}`; receive `{"type":"metrics","metrics":{…},"nudges":[…]}` |

## Health

| Endpoint | Method | Auth | Description |
|---|---|---|---|
| `/health` | GET | N | `{ "status": "ok" }` |
