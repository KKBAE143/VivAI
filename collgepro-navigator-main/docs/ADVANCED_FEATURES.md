# Advanced Features

Seven AI features that connect project content, presentations and vivas.

---

## 1. Code-Aware Viva

- **What it does**: You upload a ZIP of your project source (or link a GitHub repo). The AI reads the actual files and asks implementation-specific questions ("Why did you use a dict here?"), grading each answer against the code.
- **AI logic**: `extract_source_files` parses the ZIP; `analyze_codebase` summarizes languages/structure with Gemini; `generate_code_question` picks an uncovered file and produces a question + expected answer; answers are scored by `viva_core.evaluate_answer`.
- **Files**: backend `ai/code_aware_viva.py`, `api/advanced.py` (section A); frontend `src/routes/advanced/viva-code-aware.tsx`, hooks `useCodeSnapshots`, `useCodeUpload` in `src/lib/hooks-advanced.ts`.
- **Endpoints**: `/api/advanced/code-aware/upload`, `/link-github`, `/snapshots`, `/analyze`, `/session`, `/{sessionId}/start|answer|end`.
- **Tables**: `code_snapshots`, `viva_sessions` (type `CodeAware`), `viva_questions`.

## 2. Presentation → Viva Bridge

- **What it does**: After an AI presentation session, topics with clarity < 70 become "gaps". One click generates targeted viva questions per gap and launches a focused practice session.
- **AI logic**: Slide analyses store per-topic clarity scores; the `BRIDGE_QUESTIONS` prompt asks Gemini for questions per weak topic; the launch endpoint pre-seeds a viva session with those questions.
- **Files**: backend `api/advanced.py` (section B), `ai/prompts.py`; frontend `src/routes/advanced/presentation-bridge.tsx`, hooks `useBridgeGaps`, `useBridgeHistory`.
- **Endpoints**: `/api/advanced/bridge/{presentationId}/gaps`, `/generate-questions`, `/launch-viva`, `/bridge/history`.
- **Tables**: `presentation_sessions`, `bridge_gaps`, `viva_sessions`, `viva_questions`.

## 3. Team Viva Mode

- **What it does**: A whole team joins the same live room; the AI asks one question at a time and members race to answer. First correct answer scores highest, corrections earn points, and a live scoreboard updates.
- **AI logic**: `ai/team_viva.py` keeps in-memory rooms over WebSockets; each answer is evaluated by Gemini, points weighted by speed and correction bonuses; final scores persist on end.
- **Files**: backend `ai/team_viva.py`, `api/advanced.py` (section C + `ws_team_viva`); frontend `src/routes/advanced/viva-team.tsx`, hook `useTeamVivaSocket`.
- **Endpoints**: `/api/advanced/team-viva/sessions`, `/{id}`, `/{id}/end`, `/{id}/report`, WS `/api/advanced/ws/team-viva/{sessionId}/{profileId}`.
- **Tables**: `viva_sessions` (type `TeamViva`), `team_viva_scores`, `teams`, `team_members`.

## 4. Faculty Simulation

- **What it does**: Students crowd-source profiles of real professors (subjects, style, known patterns). The AI role-plays that professor for a hyper-realistic mock viva, and students rate the accuracy afterwards.
- **AI logic**: `faculty_sim.build_persona_prompt` converts a profile into a system persona; `viva_core.generate_question`/`evaluate_answer` run with that persona; ratings update `avg_rating` on the profile.
- **Files**: backend `ai/faculty_sim.py`, `api/advanced.py` (section D); frontend `src/routes/advanced/faculty-sim.tsx`, hook `useFacultyProfiles`.
- **Endpoints**: `/api/advanced/faculty-sim/profiles` (POST/GET), `/profiles/{id}`, `/{facultyId}/session`, `/sessions/{id}/start|answer|end`, `/my-sessions`.
- **Tables**: `faculty_profiles`, `faculty_sim_ratings`, `viva_sessions` (type `FacultySim`), `viva_questions`.

## 5. Viva Weakness Heatmap

- **What it does**: Aggregates every scored question across all your viva sessions into a per-topic heatmap (weakest first), with trend direction and drill-down into full question history.
- **AI logic**: Pure aggregation — `weakness_heatmap.compute_heatmap` averages scores per topic and computes question counts and improving/declining trends; no live Gemini call needed.
- **Files**: backend `ai/weakness_heatmap.py`, `api/advanced.py` (section E); frontend `src/routes/advanced/weakness-heatmap.tsx`, hook `useHeatmap`.
- **Endpoints**: `/api/advanced/heatmap/overall`, `/{projectId}`, `/{projectId}/detailed/{topic}`, `/refresh`.
- **Tables**: `viva_questions`, `viva_sessions`, plus the persisted heatmap cache.

## 6. College Viva Predictor

- **What it does**: Uses anonymized viva history from everyone at your college to predict likely exam topics per subject, show trending topics, and flag your personal "risk zones" (frequently asked topics where you score low).
- **AI logic**: `college_predictor` computes topic frequencies and unique-student counts scoped to your `college_name`; `my-risk` intersects trending topics with your weak heatmap topics.
- **Files**: backend `ai/college_predictor.py`, `api/advanced.py` (section F); frontend `src/routes/advanced/college-predictor.tsx`, hooks `usePredictorTopics`, `usePredictorTrends`, `usePredictorRisk`.
- **Endpoints**: `/api/advanced/predictor/topics/{subject}`, `/trends`, `/recent-questions/{subject}`, `/my-risk`.
- **Tables**: `viva_questions`, `viva_sessions`, `profiles` (college scoping).

## 7. Real-Time Presentation Sentiment

- **What it does**: Turns on your webcam while you rehearse. Every few seconds a frame is analyzed for confidence, eye contact, energy and stress; live "nudges" coach you mid-presentation, and a final report summarizes the session.
- **AI logic**: The browser sends JPEG frames over WebSocket; `sentiment_analyzer.analyze_frame` calls the Gemini vision model (throttled to every 3rd frame for free-tier limits); `generate_nudges` compares against recent history to emit coaching tips.
- **Files**: backend `ai/sentiment_analyzer.py`, `api/advanced.py` (section G + `ws_sentiment`); frontend `src/routes/advanced/sentiment-analysis.tsx`, hook `useSentimentSocket`.
- **Endpoints**: `/api/advanced/sentiment/session`, `/{id}/end`, `/{id}/report`, WS `/api/advanced/ws/sentiment/{sessionId}`.
- **Tables**: `presentation_sessions` (type `Sentiment`, samples + nudges stored in `topic_scores`).
