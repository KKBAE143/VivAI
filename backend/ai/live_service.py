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
from ai.registry import DEFAULT_PERSONA_ID, PERSONAS, Scenario, render_persona_block, render_scenario_block

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
# Each mode gets a fully self-contained playbook. Crucially, the VIVA is an ORAL
# exam with NO screen — it must never ask the student to share their screen.
_MODE_PLAYBOOK = {
    "viva": """ROLE: You are conducting a live, spoken VIVA VOCE (oral examination). This is a face-to-face conversation.
YOU CANNOT SEE THE STUDENT'S SCREEN OR CODE — there is no screen sharing in a viva. NEVER ask the student to "share your screen", "show me your code" or "open your project". Base everything on the project context below and on what the student SAYS.

SESSION FLOW (follow in order):
1. OPENING — ONLY in your FIRST reply to the session-start message (one continuous turn, ~10 seconds max): Say a SHORT hello (1 sentence, use their name if given), that you are the VivAI examiner for a mock viva, then IMMEDIATELY ask your FIRST real question. Do NOT explain the full rules at length. Do NOT produce a second hello or re-introduce yourself later in the session.
2. Ask ONE clear question at a time, grounded in their project/subject. Start easier, then go deeper based on their answers.
3. After each answer: give a brief spoken reaction (1 sentence, no re-greeting), then ask the next question or a follow-up if they were vague.
4. Cover 5-8 questions total across different topics. Keep YOUR turns short — the student should do most of the talking.
5. When you have asked enough, give a brief closing remark, tell them the viva is complete and that you're preparing their feedback, then call the `end_session` tool.""",
    "presentation": """ROLE: You are a faculty examiner watching the student's LIVE project PRESENTATION through their SHARED SCREEN. You CAN see their screen — react to what is actually visible.

SESSION FLOW (follow in order):
1. OPENING (in response to the session-start message, ~15 seconds): Warmly introduce yourself as their VivAI review panel and confirm you can see their shared screen, then hand the floor to them with a clear, motivating prompt — e.g. "Hi, I'm your VivAI review panel and I've got your screen up. Whenever you're ready, start by telling me your project's name and the problem it solves, then walk me through it — I'll follow along and jump in with questions." Then STOP and watch; let them start presenting.
2. As they present, give SHORT live reactions to what you SEE on screen ("Good, that architecture diagram is clear", "I see you're using JWT here"). Don't stay silent for long, but don't talk over them.
3. When they finish a section or pause, ASK PERMISSION before probing: "Can I ask you about this part?" then ask ONE focused question grounded in what's on screen.
4. Cover the key parts of the demo (problem, solution, tech, results). Push on weak or hand-wavy claims.
5. When the presentation is done, give a brief closing remark, tell them it's complete and you're preparing feedback, then call the `end_session` tool.""",
    "pitch": """ROLE: You are a sharp startup investor-coach running a rapid ELEVATOR PITCH drill. This is voice-only — you cannot see anything.

SESSION FLOW (follow in order):
1. OPENING (in response to the session-start message, ~10 seconds): Quickly introduce yourself and set the challenge — "Give me your 90-second pitch: what's the problem, your solution, and why it matters. Go whenever you're ready." Then listen.
2. Let them pitch. If they ramble or go over time, politely cut in and redirect.
3. After the pitch, fire 2-3 rapid investor questions (market, differentiation, feasibility, impact).
4. Keep the energy high and turns short.
5. When done, give a brief closing remark, tell them the drill is complete and you're preparing feedback, then call the `end_session` tool.""",
    "coach": """ROLE: You are an AI COMMUNICATION COACH running a LIVE practice session over the student's CAMERA. You CAN see the student on their webcam — use it. The specific scenario to run is given in the SCENARIO section below (e.g. Interview, Viva, Project Presentation, Group Discussion, Pitch, Seminar, or Public Speaking). Play the matching role convincingly: for an Interview you are the interviewer; for a Viva you are the examiner; for a Presentation you are faculty; for a Pitch you are an investor; for a Group Discussion/Seminar/Public Speaking you are a facilitator and audience.

YOU ARE BOTH A CONVERSATION PARTNER AND A LIVE COACH. Your job is to (a) keep a realistic scenario conversation going, and (b) continuously coach the student on HOW they communicate — not just what they say.

SESSION FLOW (follow in order):
1. OPENING (in response to the session-start message, ~15 seconds): Introduce yourself as their AI communication coach, name the scenario you'll run, and tell them you'll be watching their delivery on camera and giving live tips. Then immediately start the scenario with your first prompt/question.
2. Run the scenario naturally, one prompt/question at a time, and LISTEN.
3. While they speak and between turns, give SHORT, specific, encouraging coaching based on what you SEE and HEAR — e.g. "Try to look at the camera", "Slow down a little", "Sit up straight", "Great — that was confident", "Watch the filler words". Weave 1 quick coaching tip into most of your turns, but never lecture.
4. After every student turn, silently log 1-2 evidence-backed observations with the `log_observation` tool. Only log what you actually saw or heard; never invent body-language evidence when the camera is not useful.
5. Cover 5-8 exchanges. Keep YOUR turns short — the student should do most of the talking.
6. When done, give a brief encouraging closing remark, tell them you're preparing their communication report, then call the `end_session` tool.""",
}


# Blended (code-mixed) languages -> the two languages they mix (display string).
_BLENDED_LANGUAGES = {
    "hinglish": "Hindi and English",
    "tenglish": "Telugu and English",
    "tanglish": "Tamil and English",
}
# The regional half of each blend, for the formal-register instruction below.
_BLENDED_REGIONAL_NAME = {"hinglish": "Hindi", "tenglish": "Telugu", "tanglish": "Tamil"}
# Pure regional languages the model must actually speak (not silently fall back
# to English). Technical terms stay in English, as is normal in Indian classes.
_PURE_REGIONAL = {
    "hindi", "telugu", "tamil", "kannada", "malayalam",
    "marathi", "bengali", "gujarati", "punjabi",
}

# BCP-47 codes for input_audio_transcription's language_hints — this is a
# DIFFERENT config surface from speech_config (which stays model-driven; see
# build_config below for why a forced speech_config.language_code was removed
# for native-audio models). Hints here only bias speech-to-text of what the
# STUDENT says; they do not force the model's own spoken output language, so
# they are safe to set for every session. Without any hint, transcription has
# no anchor and can drift to an unrelated script turn-to-turn — the exact
# "transcription shows a different language/characters" symptom reported.
_REGIONAL_CODE = {
    "hindi": "hi-IN", "telugu": "te-IN", "tamil": "ta-IN", "kannada": "kn-IN",
    "malayalam": "ml-IN", "marathi": "mr-IN", "bengali": "bn-IN",
    "gujarati": "gu-IN", "punjabi": "pa-IN",
}


def _transcription_language_hints(language: str) -> list[str]:
    """Languages the student is actually likely to speak, for STT bias.

    English-only sessions still hint en-US (an explicit anchor beats none).
    Regional/blended sessions hint BOTH the regional code and en-US, since
    Indian B.Tech students routinely keep technical terms in English even in
    an otherwise regional/blended session (and, per real-world testing, may
    speak more English than configured, or vice versa) — the hint list is a
    bias, not a hard restriction, so listing both is strictly safer than
    picking one and guessing wrong.
    """
    key = (language or "English").strip().lower()
    if key in _BLENDED_LANGUAGES:
        regional = _BLENDED_REGIONAL_NAME.get(key, "").lower()
        code = _REGIONAL_CODE.get(regional)
        return [code, "en-US"] if code else ["en-US"]
    if key in _PURE_REGIONAL:
        code = _REGIONAL_CODE.get(key)
        return [code, "en-US"] if code else ["en-US"]
    return ["en-US"]


# Languages that must never use native-script captions on screen. Students
# (and our UI) need Latin/Roman spelling so bubbles stay readable.
_ROMAN_SCRIPT_KEYS = {
    "telugu", "tenglish", "hindi", "hinglish", "tamil", "tanglish",
    "kannada", "malayalam", "marathi", "bengali", "gujarati", "punjabi",
}


def _roman_script_directive(language: str) -> str:
    """Force Latin script so live captions never dump Telugu/Hindi glyphs."""
    key = (language or "English").strip().lower()
    if key not in _ROMAN_SCRIPT_KEYS:
        return ""
    if key in ("telugu", "tenglish"):
        return (
            " SCRIPT (CRITICAL for on-screen captions): Write and speak using ONLY Latin/Roman letters "
            "(Roman Telugu / Tenglish). Example: \"Namaskaram Karthik. Nenu mee VivAI examiner ni. "
            "Idi oka mock viva.\" NEVER use Telugu script characters (no తెలుగు అక్షరాలు at all). "
            "File paths, code identifiers and tech terms stay in English Latin script."
        )
    if key in ("hindi", "hinglish"):
        return (
            " SCRIPT (CRITICAL): Use ONLY Latin/Roman letters (Roman Hindi / Hinglish), e.g. "
            "\"Namaste, main aapka VivAI examiner hoon.\" NEVER use Devanagari (no हिन्दी लिपि)."
        )
    if key in ("tamil", "tanglish"):
        return (
            " SCRIPT (CRITICAL): Use ONLY Latin/Roman letters (Roman Tamil / Tanglish). "
            "NEVER use Tamil script characters."
        )
    return (
        f" SCRIPT (CRITICAL): Use ONLY Latin/Roman letters for {language.strip()} words "
        f"(romanized spelling). NEVER use native-script characters for captions or speech wording."
    )


def _language_directive(language: str) -> str:
    """A forceful, unambiguous instruction for the requested language.

    Live models default to English unless strongly and repeatedly told which
    language to speak — especially for code-mixed blends like Tenglish, where
    they otherwise drift into pure English. This is injected near the top of the
    system prompt AND into the opening trigger.
    """
    key = (language or "English").strip().lower()
    roman = _roman_script_directive(language)
    if key == "english":
        return "Speak ONLY in clear, natural English for the ENTIRE session, starting from your very first greeting."
    if key in _BLENDED_LANGUAGES:
        pair = _BLENDED_LANGUAGES[key]
        return (
            f"Speak in {language.strip()} for the ENTIRE session, starting from your very first greeting. "
            f"{language.strip()} means naturally CODE-MIXING {pair} within the same sentences — that is about "
            f"WHICH WORDS you blend, not how formal or casual you sound. MOST of your sentences must contain "
            f"words from BOTH {pair}. Do NOT speak only English, and do NOT speak only the regional language — "
            f"you MUST blend them together. Keep technical/engineering terms in English. Use the FORMAL/polite "
            f"address forms of {_BLENDED_REGIONAL_NAME.get(key, language.strip())}, never casual slang or "
            f"friend-to-friend forms — your PERSONA's formality (given elsewhere in these instructions) applies "
            f"exactly as much in this blended language as it would in English.{roman}"
        )
    if key in _PURE_REGIONAL:
        # Pure regional still romanized on screen (especially Telugu → Roman Telugu).
        return (
            f"Speak PRIMARILY in {language.strip()} for the ENTIRE session, starting from your very first "
            f"greeting. Prefer natural classroom code-mix: {language.strip()} phrasing with English for "
            f"technical terms and file paths (as is normal in Indian B.Tech classes). "
            f"Use the FORMAL/polite address forms of {language.strip()}, never casual slang — your PERSONA's "
            f"formality (given elsewhere in these instructions) applies exactly as much here as it would in English."
            f"{roman}"
        )
    return f"Speak naturally in {language.strip()} for the entire session, starting from your very first greeting.{roman}"


def build_system_instruction(
    mode: str,
    persona: str,
    language: str,
    project_context: str,
    subject: str | None = None,
    student_name: str | None = None,
    scenario: Scenario | None = None,
    focus_topics: list[str] | None = None,
    practice_questions: list[str] | None = None,
) -> str:
    persona_contract = render_persona_block(PERSONAS.get(persona, PERSONAS[DEFAULT_PERSONA_ID]))
    playbook = _MODE_PLAYBOOK.get(mode, _MODE_PLAYBOOK["viva"])
    name = (student_name or "").strip()
    name_line = (
        f"STUDENT'S NAME: {name}. In your FIRST reply only, greet them once by first name "
        f'(e.g. "Hello {name}" / "Namaskaram {name}") — never again in a later turn. '
        "Always address this ONE person individually — never greet a group.\n\n"
        if name
        else 'You do not know the student\'s name — address them as "you". '
        "Greet only once in the first reply. Always address this ONE person individually.\n\n"
    )
    if mode == "coach":
        scenario_label = scenario.label if scenario else (subject or "").strip() or "Interview"
        ctx = (
            f"SCENARIO TO RUN: {scenario_label}. Fully play the role this scenario implies and coach the "
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
    scenario_block = render_scenario_block(scenario) if scenario else ""
    subject_line = f"SUBJECT FOCUS (weight your questions toward this): {subject}.\n\n" if subject else ""
    focus = [t.strip() for t in (focus_topics or []) if isinstance(t, str) and t.strip()]
    bank = [q.strip() for q in (practice_questions or []) if isinstance(q, str) and q.strip()]
    # Code-aware live_brief already embeds PREFERRED VIVA PLAN — re-listing the same
    # bank here made the model re-open with a second greeting + first question.
    ctx_has_plan = "PREFERRED VIVA PLAN" in (project_context or "") or "CODEBASE KNOWLEDGE PACK" in (
        project_context or ""
    )
    if ctx_has_plan:
        bank = []
    focus_block = ""
    if focus or bank:
        lines = [
            "FOCUSED PRACTICE (mandatory):",
            "This viva has a fixed topic focus and/or question bank.",
            "You MUST prioritise the topics below over unrelated material.",
            "Do NOT re-greet, re-introduce yourself, or restart the session when moving to the next bank item — "
            "just react briefly to the last answer and ask the next question.",
        ]
        if focus:
            lines.append("Weak topics to cover (hit every topic before ending): " + "; ".join(focus[:8]))
        if bank:
            lines.append("Preferred question bank (ask these or close spoken variations; cover as many as time allows):")
            for i, q in enumerate(bank[:12], 1):
                lines.append(f"  {i}. {q}")
        lines.append(
            "Do NOT wander into unrelated subjects. When the bank is exhausted, end the session "
            "with a short wrap-up and call end_session."
        )
        focus_block = "\n".join(lines) + "\n\n"
    elif ctx_has_plan:
        focus_block = (
            "CODE-AWARE VIVA (mandatory when a CODEBASE KNOWLEDGE PACK is present):\n"
            "- Greet only once, then ask what the PROJECT is (problem, users, main goal) — NOT a file path.\n"
            "- Next ask main FEATURES and how one important user flow works end-to-end.\n"
            "- Then go deeper: how a feature is implemented, data/auth/API/UI connections, trade-offs, failures.\n"
            "- NEVER ask the student to recall long monorepo paths (e.g. apps/api/src/app.module.ts). "
            "They cannot memorize thousands of files. Paths in the pack are YOUR private notes only.\n"
            "- After each answer, verify against the pack. If their story conflicts with the codebase notes, "
            "cross-question: challenge the mismatch without reading a long path aloud.\n"
            "- Follow PREFERRED VIVA PLAN roughly, but adapt to their answers.\n"
            "- Keep questions conversational, like a real B.Tech project viva.\n\n"
        )
    lang_directive = _language_directive(language)
    # Soften the generic viva "ask first question immediately" when code-aware:
    # first question must be project overview, not a random technical probe.
    if ctx_has_plan:
        playbook = playbook + (
            "\n\nCODE-AWARE OVERRIDE FOR OPENING: After the short hello, your FIRST question must be "
            "about the project itself (what it is / who it is for / what problem it solves). "
            "Do not jump to a specific source file on the first turn."
        )
    return f"""You are VivAI, an advanced real-time voice examiner and coach for Indian B.Tech students in 2026. You sound like a real human professor — natural pacing, warmth, and authority — never a robotic read-aloud.

LANGUAGE (MOST IMPORTANT — obey for EVERY single turn, including the greeting): {lang_directive} Keep sentences short and clear for text-to-speech.

{playbook}

{persona_contract}

{scenario_block}

{name_line}{subject_line}{focus_block}PROJECT CONTEXT (personalize every question with this — never ask generic questions when you have real details here):
{ctx}

CRITICAL RULES:
- LANGUAGE: {lang_directive}
- NEVER invent, assume or make up ANY facts about the student, their project, product, company, team, results, numbers or background. Use ONLY details explicitly given in PROJECT CONTEXT or SUBJECT above. If a detail was not provided, do NOT fabricate it (never invent a project name) — ask the student or keep it general.
- GREETING (single source of truth): You will receive ONE session-start message. Reply with EXACTLY ONE opening turn: (a) one short hello + who you are (max 2 short sentences), then (b) your first exam question in the SAME turn. Deliver the greeting EXACTLY ONCE per session. Never output two separate openings. Never say hello/namaskaram/welcome twice. Never re-introduce as VivAI after the first turn. If you already greeted, the next turns are ONLY reactions + questions.
- Ask ONE question at a time and then LISTEN. Never dump multiple questions at once.
- Keep each spoken turn short (2-4 sentences). This is a dialogue, not a monologue.
- Stay strictly in your role for this mode. {"Ground feedback in what is visible on the shared screen." if mode == "presentation" else "Coach on what you see of the student on their camera (eye contact, posture, expression) as well as what you hear." if mode == "coach" else "Do NOT mention screens or screen sharing."}
- ENDING THE SESSION: When the session is genuinely complete (you have covered enough and delivered your brief closing remark), you MUST call the `end_session` tool exactly once. This is what generates the student's report — do NOT just fall silent and wait. Speak your one-line closing, then call `end_session`.

STRUCTURED LOGGING — MANDATORY, not optional (call these tools SILENTLY in the background — never read them aloud, never mention JSON, never let a tool call interrupt or delay your spoken turn):
- `record_question`: REQUIRED every single time you ask the student a real question. Call it in the same turn as the question. Remember the question_id it returns. After the tool returns, stay SILENT until the student answers — do NOT greet again, do NOT re-ask the same question, do NOT re-introduce yourself.
- `score_response`: REQUIRED right after you evaluate the student's answer to any recorded question — never move to the next question without scoring the previous one first. Pass question_id when you have it so the score attaches to the correct question.
- `log_observation`: after each student turn, with a concise quote or concrete observed evidence.
These tools are how the student's report and live feedback are built — skipping them means that moment is permanently lost from their feedback, not just delayed. Call them every time, exactly as specified, without exception."""


# Short user-role trigger that forces the model to produce its opening greeting
# immediately (Live models stay silent until they receive a turn).
_GREETING_TRIGGER = {
    # Keep short — long triggers restate the system prompt and push the model
    # into TWO spoken openings (hello+question, then hello+question again).
    "viva": (
        "Begin now in one short spoken reply only: hello + who you are, then your first question. "
        "Then stop and wait. Do not speak a second opening."
    ),
    "presentation": (
        "Begin now in one short spoken reply only: hello, then invite them to present. Then stop and wait."
    ),
    "pitch": (
        "Begin now in one short spoken reply only: hello, then give the pitch challenge. Then stop and wait."
    ),
    "coach": (
        "Begin now in one short spoken reply only: hello, name the scenario, first prompt. Then stop and wait."
    ),
}


def greeting_trigger(mode: str, language: str = "English", scenario: Scenario | None = None) -> str:
    base = _GREETING_TRIGGER.get(mode, _GREETING_TRIGGER["viva"])
    # Reinforce the language on the very first turn — this is where the model is
    # most likely to default to English if not reminded.
    #
    # Viva's own ctx block (in build_system_instruction) already fully owns
    # "what to ask first" for every session_type (Project/Subject/General) —
    # it knows whether a subject was actually provided, the scenario's
    # opening_move does not. Injecting both created two competing "ask this
    # first" instructions from different prompt locations (system_instruction
    # vs. this trigger message), which is exactly the kind of redundancy that
    # produces a rambling, doubled-sounding opening — the regression this
    # guards against. Every other mode has no equivalent ctx-based opening
    # logic, so the scenario's opening_move is the only source there.
    opening = (
        f" Your scenario-specific opening move: {scenario.opening_move}"
        if scenario and mode != "viva"
        else ""
    )
    return f"{base}{opening} Remember: {_language_directive(language)}"


# --------------------------------------------------------------------------- #
# Tools (function declarations) — how live speech becomes structured data
# --------------------------------------------------------------------------- #
def _tools() -> list[types.Tool]:
    return [
        types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="log_observation",
                    description="Record one evidence-backed communication observation after a student turn.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "category": types.Schema(type=types.Type.STRING, description="communication | body_language | voice | engagement | content"),
                            "dimension": types.Schema(type=types.Type.STRING, description="eye_contact | posture | gestures | facial_expression | pace | volume | tone_variation | filler_words | clarity | structure | conciseness | confidence | energy | responsiveness | listening | technical_depth"),
                            "kind": types.Schema(type=types.Type.STRING, description="strength | issue | note"),
                            "severity": types.Schema(type=types.Type.STRING, description="low | medium | high"),
                            "confidence": types.Schema(type=types.Type.STRING, description="high | medium | low"),
                            "evidence": types.Schema(type=types.Type.STRING, description="Short spoken quote or concrete visible observation."),
                            "tip": types.Schema(type=types.Type.STRING, description="Optional one-line coaching cue."),
                        },
                        required=["category", "dimension", "kind", "severity", "confidence", "evidence"],
                    ),
                ),
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
                    description=(
                        "Record an exam question you just asked the student out loud. Call this in "
                        "the SAME turn you ask ANY real question — this is mandatory, not optional. "
                        "The response returns a question_id; remember it so you can pass it to "
                        "score_response for this exact question."
                    ),
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
                    description=(
                        "Score the student's answer. Mandatory — call this immediately after "
                        "evaluating ANY answer to a question you recorded, never skip it. Pass "
                        "question_id from the matching record_question call whenever you have it, "
                        "so the score attaches to the right question even if you've since asked "
                        "another one."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "score": types.Schema(type=types.Type.INTEGER, description="0-100"),
                            "feedback": types.Schema(type=types.Type.STRING, description="One or two sentences."),
                            "topic": types.Schema(type=types.Type.STRING, description="Short topic label."),
                            "question_id": types.Schema(
                                type=types.Type.STRING,
                                description="The question_id returned by record_question for the question being scored, if known.",
                            ),
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


# Voice-activity detection tuning. `silence_duration_ms` is how long the student
# must be quiet before Gemini treats their turn as finished. A student
# formulating a technical answer routinely pauses 1-1.5s mid-sentence, so
# anything under ~1.2s reads a thinking-pause as "turn complete" and the
# examiner talks over them. Raising it much past 1.5s makes the examiner feel
# sluggish once they HAVE genuinely finished. 1500ms is the tested compromise.
VAD_SILENCE_DURATION_MS = 1500
VAD_PREFIX_PADDING_MS = 300


def build_config(
    mode: str,
    persona: str,
    language: str,
    project_context: str,
    subject: str | None = None,
    student_name: str | None = None,
    scenario: Scenario | None = None,
    focus_topics: list[str] | None = None,
    practice_questions: list[str] | None = None,
    resume_handle: str | None = None,
) -> types.LiveConnectConfig:
    settings = get_settings()
    voice = (settings.gemini_live_voice or DEFAULT_VOICE).strip() or DEFAULT_VOICE
    system_instruction = build_system_instruction(
        mode,
        persona,
        language,
        project_context,
        subject,
        student_name,
        scenario,
        focus_topics=focus_topics,
        practice_questions=practice_questions,
    )
    # Gemini 3.1/2.5 Live are native-audio models. They choose the output
    # language from the conversation and explicitly reject/ignore a forced
    # SpeechConfig.language_code in some model variants. The system instruction
    # above is the single language control for every live mode.
    speech_kwargs: dict = {
        "voice_config": types.VoiceConfig(
            prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
        )
    }
    # Bias input transcription (what the STUDENT is transcribed as saying)
    # toward the languages actually expected in this session. This is
    # independent of speech_config above — it only affects STT, never what
    # language the model itself speaks — so it carries none of the
    # native-audio-model restriction that ruled out speech_config.language_code.
    # Wrapped defensively: if an SDK/model variant rejects it, fall back to the
    # unhinted config rather than failing the whole session.
    try:
        input_transcription_cfg = types.AudioTranscriptionConfig(
            language_hints=types.LanguageHints(
                language_codes=_transcription_language_hints(language)
            )
        )
    except Exception as exc:  # noqa: BLE001 — optional accuracy tuning, never fatal
        print(f"[live] input transcription language hints unavailable, using defaults: {exc}")
        input_transcription_cfg = types.AudioTranscriptionConfig()

    kwargs = dict(
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_MEDIUM",
        speech_config=types.SpeechConfig(**speech_kwargs),
        system_instruction=types.Content(parts=[types.Part(text=system_instruction)]),
        input_audio_transcription=input_transcription_cfg,
        output_audio_transcription=types.AudioTranscriptionConfig(),
        tools=_tools(),
    )
    # ---------------------------------------------------------------- #
    # SESSION LIFETIME — the single most important setting here.
    #
    # The Live API hard-terminates a session on duration alone: 15 minutes for
    # audio-only, and **2 MINUTES for any session that sends video**. Our
    # presentation mode (shared screen) and coach mode (camera) both stream
    # ~1fps JPEG, so without this they were being killed by Google roughly two
    # minutes in — surfacing to students as "the session just ended", a report
    # built from a near-empty transcript (hence ~0% scores), or the "nothing
    # was recorded" error when they had not finished speaking yet.
    #
    # Context-window compression (sliding window) removes the duration cap
    # entirely; it drops the oldest turns instead of dropping the connection.
    # This is Google's documented mechanism for unlimited-duration sessions,
    # not a workaround.
    try:
        kwargs["context_window_compression"] = types.ContextWindowCompressionConfig(
            sliding_window=types.SlidingWindow(),
        )
    except Exception as exc:  # noqa: BLE001 — never fatal, but log loudly
        print(f"[live] context window compression unavailable: {exc}")

    # Independently of session duration, a single WebSocket connection to Gemini
    # lives ~10 minutes. Session resumption lets us transparently reconnect and
    # carry the conversation across that boundary (the server hands us a fresh
    # handle periodically and sends `go_away` shortly before cutting us off).
    # Without it, a routine connection recycle ended the student's exam.
    try:
        kwargs["session_resumption"] = types.SessionResumptionConfig(handle=resume_handle)
    except Exception as exc:  # noqa: BLE001
        print(f"[live] session resumption unavailable: {exc}")

    # Make voice-activity detection less trigger-happy so background noise (or
    # the student clearing their throat during the AI's opening greeting) does
    # not get treated as a full turn — a common cause of the AI greeting twice.
    # Wrapped defensively: config shape varies across google-genai versions.
    try:
        realtime_cfg = types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_LOW,
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                prefix_padding_ms=VAD_PREFIX_PADDING_MS,
                silence_duration_ms=VAD_SILENCE_DURATION_MS,
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


def is_near_duplicate(a: str, b: str) -> bool:
    """Cheap similarity check so a dedup window only catches literal
    self-repetition, not two distinct real moments that happen to be close
    together in time."""
    a_norm, b_norm = a.strip().lower(), b.strip().lower()
    if not a_norm or not b_norm:
        return False
    if a_norm == b_norm:
        return True
    shorter, longer = sorted((a_norm, b_norm), key=len)
    return len(shorter) > 8 and shorter in longer


def _coerce_audio_bytes(raw) -> bytes | None:
    """Normalize SDK audio payloads to raw PCM bytes. Never raises."""
    if raw is None:
        return None
    if isinstance(raw, (bytes, bytearray, memoryview)):
        b = bytes(raw)
        return b or None
    if isinstance(raw, str):
        # Some wire/SDK paths leave base64 text instead of decoded bytes.
        if not raw:
            return None
        try:
            import base64

            b = base64.b64decode(raw, validate=False)
            return b or None
        except Exception:
            return None
    try:
        b = bytes(raw)
        return b or None
    except Exception:
        return None


def response_audio_chunks(response) -> list[bytes]:
    """Read Live audio from both SDK response layouts.

    Older ``google-genai`` releases exposed a convenience ``response.data``
    attribute. On current SDKs that is a *property* that already concatenates
    ``server_content.model_turn.parts[].inline_data.data``. Prefer it when
    present so we never double-forward the same PCM to the browser (double
    playback / garbled speech). Fall back to scanning model_turn parts when
    ``data`` is empty — that is the layout that still yields transcription
    while ``data`` is missing on some builds (UI text with silent speakers).

    Always safe: bad/base64/odd payloads never raise into the receive loop.
    """
    # Prefer the convenience field / property when it has usable audio.
    legacy = _coerce_audio_bytes(getattr(response, "data", None))
    if legacy:
        return [legacy]

    chunks: list[bytes] = []
    seen: set[int] = set()
    server_content = getattr(response, "server_content", None)
    model_turn = getattr(server_content, "model_turn", None)
    for part in getattr(model_turn, "parts", None) or []:
        inline_data = getattr(part, "inline_data", None)
        data = _coerce_audio_bytes(getattr(inline_data, "data", None))
        if not data:
            continue
        mime_type = (getattr(inline_data, "mime_type", "") or "").lower()
        # Live model turns can contain text/thought/image parts as well as audio.
        # Only proxy audio (or untyped) bytes to the browser's PCM player.
        if mime_type and not (
            "audio" in mime_type
            or mime_type.startswith("audio/")
            or mime_type in ("application/octet-stream", "application/pcm")
        ):
            continue
        key = hash(data)
        if key in seen:
            continue
        seen.add(key)
        chunks.append(data)
    return chunks


# --------------------------------------------------------------------------- #
# Gemini send helpers (tolerant of google-genai signature differences)
# --------------------------------------------------------------------------- #
async def send_audio(session, data: bytes) -> None:
    blob = types.Blob(data=data, mime_type="audio/pcm;rate=16000")
    try:
        await session.send_realtime_input(audio=blob)
    except TypeError:
        await session.send_realtime_input(media=blob)


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


@asynccontextmanager
async def connect_with_fallback(config: types.LiveConnectConfig):
    """Try each candidate Live model until one connects.

    Model availability changes while the Live API is in preview; a retired or
    region-restricted model must not kill the whole feature.
    """
    last_exc: Exception | None = None
    for model in _model_candidates():
        connected = False
        try:
            async with get_client().aio.live.connect(model=model, config=config) as session:
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
