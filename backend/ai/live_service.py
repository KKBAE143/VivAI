"""Real-time Gemini Live API engine (audio + video + tools).

This powers the live, conversational AI across Mock Viva, AI Presentation and
Pitch Drill. The browser streams mic audio (PCM16 16kHz) and screen/camera
frames (JPEG ~1fps) through our FastAPI WebSocket proxy; Gemini streams back
natural speech (PCM 24kHz) plus transcripts and tool calls.

Design goals:
- Personalized: the system instruction is grounded in the student's actual
  project (title, stack, problem) and the chosen persona + language.
- Proactive, then asks permission: the examiner reacts live to what it sees,
  and asks before drilling into questions (configured in the prompt).
- Structured output alongside speech: tool/function calls (`flag_moment`,
  `record_question`, `score_response`) let us persist the same scores/questions
  the existing report pages already render.

Live models tried in order of preference: gemini-3.1-flash-live-preview (newer,
more powerful), gemini-2.5-flash-live-preview (flagship Live fallback). Override
via GEMINI_LIVE_MODEL env var.
"""
from __future__ import annotations

from contextlib import asynccontextmanager

from google import genai
from google.genai import types

from core.config import get_settings
from core.languages import audio_language_code

# Current Live API models (2026), tried in order. gemini-3.1-flash-live-preview
# is the recommended low-latency voice model; 2.5-flash-live-preview is the
# fallback. Older *-native-audio-dialog / 2.0-flash-live names are deprecated.
LIVE_MODELS = [
    "gemini-3.1-flash-live-preview",
    "gemini-2.5-flash-live-preview",
]

# Gemini prebuilt voices (natural, not robotic). Overridable via settings.
DEFAULT_VOICE = "Puck"

_client: genai.Client | None = None


def get_client() -> genai.Client:
    global _client
    if _client is None:
        _client = genai.Client(api_key=get_settings().gemini_api_key)
    return _client


def live_model() -> str:
    configured = (get_settings().gemini_live_model or "").strip()
    return configured or LIVE_MODELS[0]


# --------------------------------------------------------------------------- #
# System instruction
# --------------------------------------------------------------------------- #
_PERSONA_TONE = {
    "friendly": "Warm, encouraging and supportive. Offer gentle nudges when the student struggles.",
    "balanced": "Fair but rigorous, like a typical B.Tech faculty examiner.",
    "strict": "Precise and demanding. Expect exact answers and push follow-ups on vague reasoning. No hints.",
    "hostile": "Tough, skeptical external examiner. Challenge every claim with rapid-fire follow-ups, but stay professional.",
}

# Each mode gets a fully self-contained playbook. Crucially, the VIVA is an ORAL
# exam with NO screen — it must never ask the student to share their screen.
_MODE_PLAYBOOK = {
    "viva": """ROLE: You are conducting a live, spoken VIVA VOCE (oral examination). This is a face-to-face conversation.
YOU CANNOT SEE THE STUDENT'S SCREEN OR CODE — there is no screen sharing in a viva. NEVER ask the student to "share your screen", "show me your code" or "open your project". Base everything on the project context below and on what the student SAYS.

SESSION FLOW (follow in order):
1. GREETING (your very first turn, ~15 seconds): Introduce yourself ONE time as their VivAI examiner, say this is a mock viva, and briefly tell them how it works — "I'll ask you a series of questions about your project and your subject; answer out loud, and I'll give feedback at the end." Then ask your FIRST question immediately. Do NOT wait for them to speak first. Give this introduction EXACTLY ONCE — never repeat or restate your greeting.
2. Ask ONE clear question at a time, grounded in their project/subject. Start easier, then go deeper based on their answers.
3. After each answer: give a brief spoken reaction (1 sentence), then ask the next question or a follow-up if they were vague.
4. Cover 5-8 questions total across different topics. Keep YOUR turns short — the student should do most of the talking.
5. When you have asked enough, give a brief closing remark, tell them the viva is complete and that you're preparing their feedback, then call the `end_session` tool.""",
    "presentation": """ROLE: You are a faculty examiner watching the student's LIVE project PRESENTATION through their SHARED SCREEN. You CAN see their screen — react to what is actually visible.

SESSION FLOW (follow in order):
1. GREETING (your very first turn, ~15 seconds): Warmly introduce yourself as their VivAI review panel and confirm you can see their shared screen, then hand the floor to them with a clear, motivating prompt — e.g. "Hi, I'm your VivAI review panel and I've got your screen up. Whenever you're ready, start by telling me your project's name and the problem it solves, then walk me through it — I'll follow along and jump in with questions." Then STOP and watch; let them start presenting.
2. As they present, give SHORT live reactions to what you SEE on screen ("Good, that architecture diagram is clear", "I see you're using JWT here"). Don't stay silent for long, but don't talk over them.
3. When they finish a section or pause, ASK PERMISSION before probing: "Can I ask you about this part?" then ask ONE focused question grounded in what's on screen.
4. Cover the key parts of the demo (problem, solution, tech, results). Push on weak or hand-wavy claims.
5. When the presentation is done, give a brief closing remark, tell them it's complete and you're preparing feedback, then call the `end_session` tool.""",
    "pitch": """ROLE: You are a sharp startup investor-coach running a rapid ELEVATOR PITCH drill. This is voice-only — you cannot see anything.

SESSION FLOW (follow in order):
1. GREETING (your very first turn, ~10 seconds): Quickly introduce yourself ONE time and set the challenge — "Give me your 90-second pitch: what's the problem, your solution, and why it matters. Go whenever you're ready." Then listen. Never repeat your introduction.
2. Let them pitch. If they ramble or go over time, politely cut in and redirect.
3. After the pitch, fire 2-3 rapid investor questions (market, differentiation, feasibility, impact).
4. Keep the energy high and turns short.
5. When done, give a brief closing remark, tell them the drill is complete and you're preparing feedback, then call the `end_session` tool.""",
    "coach": """ROLE: You are an AI COMMUNICATION COACH running a LIVE practice session over the student's CAMERA. You CAN see the student on their webcam — use it. The specific scenario to run is given in the SCENARIO section below (e.g. Interview, Viva, Project Presentation, Group Discussion, Pitch, Seminar, or Public Speaking). Play the matching role convincingly: for an Interview you are the interviewer; for a Viva you are the examiner; for a Presentation you are faculty; for a Pitch you are an investor; for a Group Discussion/Seminar/Public Speaking you are a facilitator and audience.

YOU ARE BOTH A CONVERSATION PARTNER AND A LIVE COACH. Your job is to (a) keep a realistic scenario conversation going, and (b) continuously coach the student on HOW they communicate — not just what they say.

SESSION FLOW (follow in order):
1. GREETING (your very first turn, ~15 seconds): Introduce yourself ONE time as their AI communication coach, name the scenario you'll run, and tell them you'll be watching their delivery on camera and giving live tips. Then immediately start the scenario with your first prompt/question. Give this introduction EXACTLY ONCE.
2. Run the scenario naturally, one prompt/question at a time, and LISTEN.
3. While they speak and between turns, give SHORT, specific, encouraging coaching based on what you SEE and HEAR — e.g. "Try to look at the camera", "Slow down a little", "Sit up straight", "Great — that was confident", "Watch the filler words". Weave 1 quick coaching tip into most of your turns, but never lecture.
4. Observe and (silently, via the flag_moment tool) log delivery signals: eye contact, posture/body language, confidence, energy, pace, filler words, smile, engagement, nervousness.
5. Cover 5-8 exchanges. Keep YOUR turns short — the student should do most of the talking.
6. When done, give a brief encouraging closing remark, tell them you're preparing their communication report, then call the `end_session` tool.""",
}


# Blended (code-mixed) languages -> the two languages they mix.
_BLENDED_LANGUAGES = {
    "hinglish": "Hindi and English",
    "tenglish": "Telugu and English",
    "tanglish": "Tamil and English",
}
# Pure regional languages the model must actually speak (not silently fall back
# to English). Technical terms stay in English, as is normal in Indian classes.
_PURE_REGIONAL = {
    "hindi", "telugu", "tamil", "kannada", "malayalam",
    "marathi", "bengali", "gujarati", "punjabi",
}


def _language_directive(language: str) -> str:
    """A forceful, unambiguous instruction for the requested language.

    Live models default to English unless strongly and repeatedly told which
    language to speak — especially for code-mixed blends like Tenglish, where
    they otherwise drift into pure English. This is injected near the top of the
    system prompt AND into the opening trigger.
    """
    key = (language or "English").strip().lower()
    if key == "english":
        return "Speak ONLY in clear, natural English for the ENTIRE session, starting from your very first greeting."
    if key in _BLENDED_LANGUAGES:
        pair = _BLENDED_LANGUAGES[key]
        return (
            f"Speak in {language.strip()} for the ENTIRE session, starting from your very first greeting. "
            f"{language.strip()} means naturally CODE-MIXING {pair} within the same sentences, exactly the way "
            f"Indian students and faculty actually talk. MOST of your sentences must contain words from BOTH "
            f"{pair}. Do NOT speak only English, and do NOT speak only the regional language — you MUST blend "
            f"them together. Keep technical/engineering terms in English."
        )
    if key in _PURE_REGIONAL:
        return (
            f"Speak PRIMARILY in {language.strip()} for the ENTIRE session, starting from your very first "
            f"greeting. Use {language.strip()} for almost everything; keep ONLY standard technical/engineering "
            f"terms in English (as is normal in Indian classrooms). Do NOT default to or drift into English."
        )
    return f"Speak naturally in {language.strip()} for the entire session, starting from your very first greeting."


def build_system_instruction(
    mode: str,
    persona: str,
    language: str,
    project_context: str,
    subject: str | None = None,
    student_name: str | None = None,
) -> str:
    tone = _PERSONA_TONE.get(persona, _PERSONA_TONE["balanced"])
    playbook = _MODE_PLAYBOOK.get(mode, _MODE_PLAYBOOK["viva"])
    name = (student_name or "").strip()
    name_line = (
        f"STUDENT'S NAME: {name}. Greet them by their first name once at the start "
        f'(e.g. "Hello {name}") and use it occasionally. Always address this ONE person '
        "individually — never greet a group or use a plural/collective address.\n\n"
        if name
        else 'You do not know the student\'s name — address them directly as "you". '
        "Always address this ONE person individually — never greet a group or use a plural/collective address.\n\n"
    )
    if mode == "coach":
        scenario = (subject or "").strip() or "Interview"
        ctx = (
            f"SCENARIO TO RUN: {scenario}. Fully play the role this scenario implies and coach the "
            "student's live communication and delivery throughout."
        )
        if project_context.strip():
            ctx += f"\n\nRelevant project the student may reference:\n{project_context.strip()}"
        else:
            ctx += (
                "\n\nThe student has NOT provided any project, product or topic. Do NOT invent, assume or "
                "name any project, product, company, feature or statistic. If the scenario needs a subject, "
                "ASK the student what role, company or topic they want to practise and adapt to their answer — "
                "never make one up."
            )
    elif project_context.strip():
        ctx = project_context.strip()
    elif subject:
        ctx = f"No project was provided. Examine the student specifically on this subject/topic: {subject}. Ask concrete, progressively harder questions on it."
    else:
        # General viva with nothing configured: gather the input conversationally
        # instead of assuming there's a project to defend.
        ctx = (
            "No project or subject was provided. This is a GENERAL technical interview. "
            "Do NOT ask about 'your project'. Instead, your FIRST spoken question must ask the "
            "student which branch and year they are in and which subject or topics they want to be "
            "examined on. Then run the viva strictly on the subject they name, starting with "
            "fundamentals and going deeper based on their answers."
        )
    subject_line = f"SUBJECT FOCUS (weight your questions toward this): {subject}.\n\n" if subject else ""
    lang_directive = _language_directive(language)
    return f"""You are VivAI, an advanced real-time voice examiner and coach for Indian B.Tech students in 2026. You sound like a real human professor — natural pacing, warmth, and authority — never a robotic read-aloud.

LANGUAGE (MOST IMPORTANT — obey for EVERY single turn, including the greeting): {lang_directive} Keep sentences short and clear for text-to-speech.

{playbook}

PERSONALITY: {tone}

{name_line}{subject_line}PROJECT CONTEXT (personalize every question with this — never ask generic questions when you have real details here):
{ctx}

CRITICAL RULES:
- LANGUAGE: {lang_directive}
- NEVER invent, assume or make up ANY facts about the student, their project, product, company, team, results, numbers or background. Use ONLY details explicitly given in PROJECT CONTEXT or SUBJECT above. If a detail was not provided, do NOT fabricate it (never invent a project name) — ask the student or keep it general.
- GREETING (single source of truth): You will receive ONE short "the session is starting" message — respond to THAT message with the one-time greeting and opening described above. Deliver your greeting EXACTLY ONCE; after it, NEVER greet, re-introduce, restate or re-word your opening again — just continue the conversation. Do not produce any greeting before that starting message arrives.
- Ask ONE question at a time and then LISTEN. Never dump multiple questions at once.
- Keep each spoken turn short (2-4 sentences). This is a dialogue, not a monologue.
- Stay strictly in your role for this mode. {"Ground feedback in what is visible on the shared screen." if mode == "presentation" else "Coach on what you see of the student on their camera (eye contact, posture, expression) as well as what you hear." if mode == "coach" else "Do NOT mention screens or screen sharing."}
- ENDING THE SESSION: When the session is genuinely complete (you have covered enough and delivered your brief closing remark), you MUST call the `end_session` tool exactly once. This is what generates the student's report — do NOT just fall silent and wait. Speak your one-line closing, then call `end_session`.

STRUCTURED LOGGING (call these tools SILENTLY in the background — never read them aloud or mention JSON):
- `record_question`: every time you ask the student a real exam question.
- `score_response`: right after the student answers, with a 0-100 score and one line of feedback.
- `flag_moment`: when you notice a clear strength or issue.
Still, do not rely on tools for the conversation — just talk naturally; the logging is secondary."""


# Short user-role trigger that forces the model to produce its opening greeting
# immediately (Live models stay silent until they receive a turn).
_GREETING_TRIGGER = {
    "viva": "The viva is now starting. Please greet me and ask your first question.",
    "presentation": "I'm about to start presenting. Please greet me and tell me when to begin.",
    "pitch": "I'm ready for the pitch drill. Please greet me and give me the challenge.",
    "coach": "I'm ready to practice. Please greet me, tell me the scenario, and start.",
}


def greeting_trigger(mode: str, language: str = "English") -> str:
    base = _GREETING_TRIGGER.get(mode, _GREETING_TRIGGER["viva"])
    # Reinforce the language on the very first turn — this is where the model is
    # most likely to default to English if not reminded.
    return f"{base} Remember: {_language_directive(language)}"


# --------------------------------------------------------------------------- #
# Tools (function declarations) — how live speech becomes structured data
# --------------------------------------------------------------------------- #
def _tools() -> list[types.Tool]:
    return [
        types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="flag_moment",
                    description="Log a noteworthy observation about what is on the shared screen or how the student is doing.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "kind": types.Schema(
                                type=types.Type.STRING,
                                description="strength | issue | note",
                            ),
                            "text": types.Schema(type=types.Type.STRING, description="One short sentence."),
                            "severity": types.Schema(
                                type=types.Type.STRING, description="low | medium | high"
                            ),
                        },
                        required=["kind", "text"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="record_question",
                    description="Record an exam question you just asked the student out loud.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "question": types.Schema(type=types.Type.STRING),
                            "topic": types.Schema(type=types.Type.STRING, description="Short topic label."),
                        },
                        required=["question"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="score_response",
                    description="Score the student's most recent answer to your question.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "score": types.Schema(type=types.Type.INTEGER, description="0-100"),
                            "feedback": types.Schema(type=types.Type.STRING, description="One or two sentences."),
                            "topic": types.Schema(type=types.Type.STRING, description="Short topic label."),
                        },
                        required=["score"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="end_session",
                    description=(
                        "Call this exactly once when the session is complete, right after you "
                        "have spoken your brief closing remark. This finalizes the session and "
                        "generates the student's report. Do not keep talking after calling it."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "reason": types.Schema(
                                type=types.Type.STRING,
                                description="Short reason, e.g. 'covered enough questions'.",
                            ),
                        },
                    ),
                ),
            ]
        )
    ]


def build_config(
    mode: str,
    persona: str,
    language: str,
    project_context: str,
    subject: str | None = None,
    student_name: str | None = None,
) -> types.LiveConnectConfig:
    settings = get_settings()
    voice = (settings.gemini_live_voice or DEFAULT_VOICE).strip() or DEFAULT_VOICE
    system_instruction = build_system_instruction(
        mode, persona, language, project_context, subject, student_name
    )
    # The half-cascade Live models synthesize speech via TTS, which needs a target
    # language. Without a language_code a non-English session yields a transcript
    # but NO audio. We set it ONLY for non-English languages (English -> None ->
    # unset), so the working English/Coach config is unchanged.
    speech_kwargs: dict = {
        "voice_config": types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
        )
    }
    lang_code = audio_language_code(language)
    if lang_code:
        speech_kwargs["language_code"] = lang_code
    kwargs = dict(
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_MEDIUM",
        speech_config=types.SpeechConfig(**speech_kwargs),
        system_instruction=types.Content(parts=[types.Part(text=system_instruction)]),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        tools=_tools(),
    )
    # Make voice-activity detection less trigger-happy so background noise (or
    # the student clearing their throat during the AI's opening greeting) does
    # not get treated as a full turn — a common cause of the AI greeting twice.
    # Wrapped defensively: config shape varies across google-genai versions.
    try:
        realtime_cfg = types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_LOW,
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                prefix_padding_ms=300,
                silence_duration_ms=900,
            )
        )
        kwargs["realtime_input_config"] = realtime_cfg
    except Exception as exc:  # noqa: BLE001 — optional tuning, never fatal
        print(f"[live] VAD tuning unavailable, using defaults: {exc}")
    return types.LiveConnectConfig(**kwargs)


def analyze_transcript(mode: str, transcript: list[dict], project_context: str, subject: str | None) -> dict:
    """Turn a raw spoken transcript into structured Q&A + scores + summary.

    The Live model's mid-session tool calls are unreliable, so we ALWAYS post-
    process the transcript with the text model at finalize time. This guarantees
    the report pages have real questions, scores and feedback.
    Returns {"questions": [...], "overall_score": int, "summary": str,
             "strengths": [...], "weaknesses": [...]}.
    """
    from ai import gemini_service  # local import avoids a cycle

    lines = [f"{t.get('role', 'student').upper()}: {t.get('text', '')}" for t in transcript if t.get("text")]
    convo = "\n".join(lines).strip()
    if not convo:
        return {"questions": [], "overall_score": 0, "summary": "No conversation was recorded.", "strengths": [], "weaknesses": []}

    if mode == "coach":
        return _analyze_coach_transcript(convo, subject)

    role = {
        "viva": "an oral viva examination",
        "presentation": "a live project presentation review",
        "pitch": "a startup pitch drill",
    }.get(mode, "an oral examination")

    prompt = f"""You are grading the transcript of {role} between an AI EXAMINER and a STUDENT.

PROJECT CONTEXT: {project_context or 'Not provided'}
{f'SUBJECT FOCUS: {subject}' if subject else ''}

TRANSCRIPT:
{convo}

From this transcript, extract every real question the examiner asked and the student's answer to it, and grade each answer.
Return STRICT JSON only, no prose, in exactly this shape:
{{
  "questions": [
    {{"question": "...", "topic": "short topic", "answer": "what the student actually said (summarize if long)", "score": 0-100, "feedback": "one specific sentence"}}
  ],
  "overall_score": 0-100,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "summary": "2-3 sentence overall assessment addressed to the student"
}}
Rules: score answers on correctness, depth and clarity. If the student never really answered a question, give it a low score and say so. If no genuine Q&A happened, return an empty questions array and an honest summary. Do not invent content that isn't in the transcript."""

    result = gemini_service.generate_json(prompt, default=None)
    if not isinstance(result, dict):
        return {"questions": [], "overall_score": 0, "summary": "Could not analyze the session automatically.", "strengths": [], "weaknesses": []}

    questions = result.get("questions") or []
    clean_q = []
    for q in questions:
        if not isinstance(q, dict):
            continue
        try:
            score = max(0, min(100, int(q.get("score", 0) or 0)))
        except (ValueError, TypeError):
            score = 0
        clean_q.append({
            "question": str(q.get("question", "")).strip(),
            "topic": q.get("topic"),
            "answer": q.get("answer"),
            "score": score,
            "feedback": q.get("feedback"),
        })
    scored = [q["score"] for q in clean_q if q.get("score") is not None]
    try:
        overall = int(result.get("overall_score"))
    except (ValueError, TypeError):
        overall = round(sum(scored) / len(scored)) if scored else 0
    overall = max(0, min(100, overall))
    return {
        "questions": clean_q,
        "overall_score": overall,
        "summary": str(result.get("summary", "")).strip() or "Session completed.",
        "strengths": result.get("strengths") or [],
        "weaknesses": result.get("weaknesses") or [],
    }


def _analyze_coach_transcript(convo: str, subject: str | None) -> dict:
    """Grade a communication-coaching session and produce a delivery report.

    Coach mode is about HOW the student communicated, so the report centers on
    delivery scores (confidence, communication, clarity) rather than a Q&A grade.
    The returned dict still fits the common summary shape used by finalize().
    """
    from ai import gemini_service

    scenario = (subject or "a communication practice session").strip()
    prompt = f"""You are an expert communication coach reviewing the transcript of a live practice session (scenario: {scenario}) between an AI COACH and a STUDENT.

TRANSCRIPT:
{convo}

Based ONLY on the transcript, assess how the student COMMUNICATED (clarity, structure, confidence in wording, engagement, filler/hesitation, how well they answered). You cannot see video, so infer delivery from the words and the coach's spoken observations.
Return STRICT JSON only, no prose, in exactly this shape:
{{
  "overall_score": 0-100,
  "confidence_score": 0-100,
  "communication_score": 0-100,
  "clarity_score": 0-100,
  "engagement_score": 0-100,
  "strengths": ["..."],
  "weaknesses": ["..."],
  "recommendations": ["specific actionable tip", "..."],
  "summary": "3-4 sentence coaching summary addressed to the student"
}}
Be honest and specific. If the student barely spoke, score low and say so."""

    result = gemini_service.generate_json(prompt, default=None)
    if not isinstance(result, dict):
        return {
            "questions": [], "overall_score": 0,
            "summary": "Could not analyze the session automatically.",
            "strengths": [], "weaknesses": [],
        }

    def _score(key: str) -> int:
        try:
            return max(0, min(100, int(result.get(key) or 0)))
        except (ValueError, TypeError):
            return 0

    overall = _score("overall_score")
    coach_metrics = {
        "confidence": _score("confidence_score"),
        "communication": _score("communication_score"),
        "clarity": _score("clarity_score"),
        "engagement": _score("engagement_score"),
    }
    if not overall:
        vals = [v for v in coach_metrics.values() if v]
        overall = round(sum(vals) / len(vals)) if vals else 0
    return {
        "questions": [],
        "overall_score": overall,
        "summary": str(result.get("summary", "")).strip() or "Communication session completed.",
        "strengths": result.get("strengths") or [],
        "weaknesses": result.get("weaknesses") or [],
        "recommendations": result.get("recommendations") or [],
        "coach_metrics": coach_metrics,
    }


def connect(config: types.LiveConnectConfig, model: str | None = None):
    """Return the async context manager for a Live session."""
    return get_client().aio.live.connect(model=model or live_model(), config=config)


def _model_candidates() -> list[str]:
    """Configured model first, then known-good fallbacks (deduped)."""
    candidates = [live_model(), *LIVE_MODELS]
    seen: set[str] = set()
    ordered = []
    for m in candidates:
        if m and m not in seen:
            seen.add(m)
            ordered.append(m)
    return ordered


def _config_without_language_code(config: types.LiveConnectConfig) -> types.LiveConnectConfig | None:
    """Return a copy of config with speech language_code removed, or None if it had none."""
    sc = getattr(config, "speech_config", None)
    if not sc or not getattr(sc, "language_code", None):
        return None
    stripped = config.model_copy(deep=True)
    # Rebuild the speech config without language_code (robust whether or not the
    # SDK model permits in-place mutation).
    stripped.speech_config = types.SpeechConfig(voice_config=sc.voice_config)
    return stripped


@asynccontextmanager
async def connect_with_fallback(config: types.LiveConnectConfig):
    """Try each candidate Live model until one connects.

    Model availability changes while the Live API is in preview; a retired or
    region-restricted model must not kill the whole feature.

    If the config set a speech language_code and EVERY model rejects it (e.g. an
    unsupported BCP-47 code), we retry once with the code stripped so the session
    still connects (transcript + default audio) instead of failing outright. This
    makes adding a language_code strictly non-regressive.
    """
    configs = [config]
    fallback = _config_without_language_code(config)
    if fallback is not None:
        configs.append(fallback)

    last_exc: Exception | None = None
    for cfg in configs:
        for model in _model_candidates():
            connected = False
            try:
                async with get_client().aio.live.connect(model=model, config=cfg) as session:
                    connected = True
                    print(f"[live] connected with model {model}")
                    yield session
                    return
            except Exception as exc:
                if connected:
                    # Failure AFTER a successful connect (mid-session) — surface it,
                    # don't silently restart on another model.
                    raise
                print(f"[live] model {model} failed to connect: {exc}")
                last_exc = exc
    raise RuntimeError(
        f"No Gemini Live model is available for this API key. Last error: {last_exc}"
    )
