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
"""
from __future__ import annotations

from google import genai
from google.genai import types

from core.config import get_settings

# Preview Live models, tried in order. Native-audio dialog models sound the most
# human; the flash-live model is the broadly-available fallback on the free tier.
LIVE_MODELS = [
    "gemini-2.0-flash-live-001",
    "gemini-live-2.5-flash-preview",
    "gemini-2.5-flash-preview-native-audio-dialog",
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

_MODE_BRIEF = {
    "viva": (
        "You are conducting a live oral VIVA examination on the student's project. "
        "If the student shares their screen or code, watch it and ground your questions in what you actually see."
    ),
    "presentation": (
        "You are a faculty examiner watching the student's LIVE project PRESENTATION via their shared screen. "
        "React to each slide/section as a real professor would: acknowledge what works "
        "('Nice — your Google auth flow is clean'), point out what could improve, and probe weak or hand-wavy claims."
    ),
    "pitch": (
        "You are a startup-style coach running a rapid 90-second elevator PITCH drill. "
        "Keep energy high, interrupt if they ramble, and push for problem/solution/tech/impact within the time budget."
    ),
}


def build_system_instruction(
    mode: str,
    persona: str,
    language: str,
    project_context: str,
    subject: str | None = None,
) -> str:
    tone = _PERSONA_TONE.get(persona, _PERSONA_TONE["balanced"])
    brief = _MODE_BRIEF.get(mode, _MODE_BRIEF["viva"])
    ctx = project_context.strip() or "No project details provided; ask the student to briefly introduce their work first."
    subject_line = f"Subject focus: {subject}.\n" if subject else ""
    return f"""You are VivAI, an advanced real-time examiner and coach for Indian B.Tech students in 2026.

{brief}

PERSONALITY: {tone}
LANGUAGE: Speak naturally in {language} (you may use Hinglish if that is the chosen language). Sound like a real human professor — conversational, with natural pacing, not a robotic read-aloud.

{subject_line}PROJECT CONTEXT (use this to personalize every question — never ask generic questions when you have this):
{ctx}

HOW TO BEHAVE (very important):
1. Start by warmly greeting the student and asking them to begin (or to start sharing/explaining). Keep it to 1-2 sentences.
2. As they present or explain, give SHORT live reactions and commentary out loud ("Good, that works", "Interesting choice using X"). Do not stay silent.
3. When the student pauses or finishes explaining a part, ASK PERMISSION before quizzing: e.g. "Can I ask you a question about this part?" Wait for them to agree before asking the actual question.
4. Ask ONE focused, personalized question at a time, grounded in what you saw on screen or in their project. Then listen.
5. If the student is vague, follow up. If they do well, acknowledge it and move on.
6. Keep your spoken turns concise. This is a conversation, not a lecture. Let them do most of the talking.

STRUCTURED LOGGING (call these tools silently — do NOT read them aloud):
- Call `flag_moment` whenever you notice something noteworthy on screen (a strength or an issue).
- Call `record_question` every time you ask the student an actual exam question.
- Call `score_response` after the student answers a question, with a 0-100 score and one line of feedback.

Never mention these tools or JSON to the student. Just talk to them like a real examiner while logging in the background."""


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
            ]
        )
    ]


def build_config(
    mode: str,
    persona: str,
    language: str,
    project_context: str,
    subject: str | None = None,
) -> types.LiveConnectConfig:
    settings = get_settings()
    voice = (settings.gemini_live_voice or DEFAULT_VOICE).strip() or DEFAULT_VOICE
    system_instruction = build_system_instruction(mode, persona, language, project_context, subject)
    return types.LiveConnectConfig(
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_MEDIUM",
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice)
            )
        ),
        system_instruction=types.Content(parts=[types.Part(text=system_instruction)]),
        input_audio_transcription=types.AudioTranscriptionConfig(),
        output_audio_transcription=types.AudioTranscriptionConfig(),
        tools=_tools(),
    )


def connect(config: types.LiveConnectConfig, model: str | None = None):
    """Return the async context manager for a Live session."""
    return get_client().aio.live.connect(model=model or live_model(), config=config)
