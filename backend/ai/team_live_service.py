"""Gemini Live config for the voice, GROUP Team Viva mode.

Reuses live_service.py's proven connection handling (get_client, live_model,
connect_with_fallback), audio framing convention, and language-directive /
transcription-hint helpers unchanged. What's different here is the persona:
live_service's system prompt is hardcoded to address exactly one student and
never a group. Team Viva needs the opposite — one shared conversation with a
roster of people, where the model must explicitly name exactly one person
before every question (via the `call_on_participant` tool) instead of just
talking to "you".
"""
from __future__ import annotations

from google.genai import types

from ai.live_service import DEFAULT_VOICE, _language_directive, _transcription_language_hints
from ai.registry import DEFAULT_PERSONA_ID, PERSONAS, render_persona_block
from core.config import get_settings

TEAM_VIVA_PLAYBOOK = """ROLE: You are conducting a live, spoken GROUP VIVA VOCE for a team of students together, all present at once. This is a face-to-face oral exam — you cannot see anyone's screen or code; base everything on the project context below and on what students SAY.

TEAM ROSTER (the ONLY people in this room — you may address ONLY these people, one at a time, by name):
{roster_block}

SESSION FLOW (follow in order):
1. OPENING (in response to the session-start message, ~15 seconds): Greet the WHOLE TEAM once as a group (e.g. "Hello everyone, I'm your VivAI examiner for today's team viva"), briefly explain the format — you'll call on one person at a time, only that person should answer, everyone else stays silent until named. Then immediately call your FIRST person using the `call_on_participant` tool and ask them a question, in the same turn.
2. Every single question you ask MUST be preceded, in the SAME turn, by a `call_on_participant` tool call naming exactly one roster member by their profile_id. NEVER ask a real question without first calling this tool, and NEVER address the group collectively when asking a question — always name ONE person by their first name right before or inside the question (e.g. "Rahul, can you explain...").
3. After that person's answer: give a brief spoken reaction (1 sentence), score it with `score_response`, then call on the NEXT person. Vary who you pick — do not always go in the same fixed order — but try to reach every member at least once before repeating anyone.
4. You MAY call on the same person more than once across the session, but NEVER repeat a question you already asked (to this person or anyone else, in either wording or substance) — always ask something new: a different topic, a deeper follow-up, or a different angle. Keep track mentally of what's already been asked and to whom.
5. Cover at least {min_questions} questions total, spread across as much of the roster as possible. Keep YOUR turns short — students should do most of the talking.
6. When you have asked enough, give a brief closing remark addressed to the whole team, tell them the team viva is complete and you're preparing everyone's individual feedback, then call the `end_session` tool."""


def _roster_block(roster: list[dict]) -> str:
    return "\n".join(f"- {r.get('name') or 'Member'} (profile_id: {r['profile_id']})" for r in roster)


def build_team_system_instruction(
    roster: list[dict],
    persona: str,
    language: str,
    project_context: str,
    subject: str | None = None,
) -> str:
    persona_contract = render_persona_block(PERSONAS.get(persona, PERSONAS[DEFAULT_PERSONA_ID]))
    playbook = TEAM_VIVA_PLAYBOOK.format(
        roster_block=_roster_block(roster), min_questions=max(len(roster), 5)
    )
    if project_context.strip():
        ctx = project_context.strip()
    elif subject:
        ctx = (
            f"No project was provided. Examine the team specifically on this subject/topic: {subject}. "
            "Ask concrete, progressively harder questions on it, tailored differently for each person you call on."
        )
    else:
        ctx = (
            "No project or subject was provided. This is a GENERAL technical team viva. Your first spoken "
            "question (right after the opening) must ask the group which subject or topics they'd like to be "
            "examined on, then run the viva strictly on the subject they name."
        )
    lang_directive = _language_directive(language)
    subject_line = f"SUBJECT FOCUS (weight your questions toward this): {subject}.\n\n" if subject else ""
    return f"""You are VivAI, an advanced real-time voice examiner for Indian B.Tech student TEAMS in 2026, running a GROUP viva with multiple students in the room at once. You sound like a real human professor — natural pacing, warmth, and authority — never a robotic read-aloud.

LANGUAGE (MOST IMPORTANT — obey for EVERY single turn, including the greeting): {lang_directive} Keep sentences short and clear for text-to-speech.

{playbook}

{persona_contract}

{subject_line}PROJECT CONTEXT (personalize every question with this — never ask generic questions when you have real details here):
{ctx}

CRITICAL RULES:
- LANGUAGE: {lang_directive}
- NEVER invent, assume or make up ANY facts about the team, their project, results, or background. Use ONLY details explicitly given in PROJECT CONTEXT or SUBJECT above.
- GREETING (single source of truth): You will receive a session-start message — respond to it with your one-time GROUP greeting and the opening described above, in ONE continuous turn, immediately followed by your first `call_on_participant` call and question, with NO second self-introduction or repeated greeting anywhere later. Deliver the greeting EXACTLY ONCE per session.
- Ask ONE question to ONE named person at a time and then LISTEN. Never dump multiple questions at once, never address more than one person in a single question.
- Keep each spoken turn short (2-4 sentences). This is a dialogue, not a monologue.
- Do NOT mention screens or screen sharing — this is a voice-only oral exam.
- ENDING THE SESSION: When the session is genuinely complete, you MUST call the `end_session` tool exactly once, right after your brief closing remark. Do not just fall silent.

STRUCTURED LOGGING — MANDATORY, not optional (call these tools SILENTLY in the background — never read them aloud, never mention JSON, never let a tool call interrupt or delay your spoken turn):
- `call_on_participant`: REQUIRED every single time, in the SAME turn as any real question — this is how the room knows whose microphone to open. Pass the exact profile_id from the ROSTER above.
- `score_response`: REQUIRED right after you evaluate an answer — never move to the next question without scoring the previous one. Pass participant_id if you have it, otherwise it is assumed to be whoever currently has the floor.
- `log_observation`: optional, after a notable answer, with concrete evidence.
These tools are how each student's individual report is built — skipping them means that moment is permanently lost from their feedback, not just delayed. Call them every time, exactly as specified, without exception."""


def team_greeting_trigger(language: str = "English") -> str:
    return (
        "The team viva is now starting. Please greet the whole team once, briefly explain the format, "
        "then call on your first person and ask your first question. "
        f"Remember: {_language_directive(language)}"
    )


def _team_tools() -> list[types.Tool]:
    return [
        types.Tool(
            function_declarations=[
                types.FunctionDeclaration(
                    name="call_on_participant",
                    description=(
                        "Call this in the SAME turn as any real question you ask out loud — REQUIRED, every "
                        "time. Names exactly one team member from the roster who should now answer; everyone "
                        "else's microphone stays muted until you call on them."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "participant_id": types.Schema(type=types.Type.STRING, description="The exact profile_id from the roster."),
                            "question": types.Schema(type=types.Type.STRING, description="The question you are about to ask them."),
                            "topic": types.Schema(type=types.Type.STRING, description="Short topic label."),
                        },
                        required=["participant_id", "question"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="score_response",
                    description=(
                        "Score a participant's answer. Mandatory — call immediately after evaluating ANY "
                        "answer, never skip it. Pass participant_id if you have it; otherwise it is "
                        "attributed to whoever currently holds the floor."
                    ),
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "score": types.Schema(type=types.Type.INTEGER, description="0-100"),
                            "feedback": types.Schema(type=types.Type.STRING, description="One or two sentences."),
                            "topic": types.Schema(type=types.Type.STRING, description="Short topic label."),
                            "participant_id": types.Schema(type=types.Type.STRING, description="profile_id of who answered, if known."),
                        },
                        required=["score"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="log_observation",
                    description="Record one evidence-backed observation about a participant's answer.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={
                            "participant_id": types.Schema(type=types.Type.STRING),
                            "kind": types.Schema(type=types.Type.STRING, description="strength | issue | note"),
                            "evidence": types.Schema(type=types.Type.STRING, description="Short spoken quote or concrete observation."),
                            "severity": types.Schema(type=types.Type.STRING, description="low | medium | high"),
                        },
                        required=["kind", "evidence"],
                    ),
                ),
                types.FunctionDeclaration(
                    name="end_session",
                    description="Call exactly once when the team viva is complete, right after your closing remark.",
                    parameters=types.Schema(
                        type=types.Type.OBJECT,
                        properties={"reason": types.Schema(type=types.Type.STRING, description="Short reason.")},
                    ),
                ),
            ]
        )
    ]


def build_team_config(
    roster: list[dict],
    persona: str,
    language: str,
    project_context: str,
    subject: str | None = None,
) -> types.LiveConnectConfig:
    settings = get_settings()
    voice = (settings.gemini_live_voice or DEFAULT_VOICE).strip() or DEFAULT_VOICE
    system_instruction = build_team_system_instruction(roster, persona, language, project_context, subject)
    speech_kwargs: dict = {
        "voice_config": types.VoiceConfig(prebuilt_voice_config=types.PrebuiltVoiceConfig(voice_name=voice))
    }
    try:
        input_transcription_cfg = types.AudioTranscriptionConfig(
            language_hints=types.LanguageHints(language_codes=_transcription_language_hints(language))
        )
    except Exception as exc:  # noqa: BLE001 — optional accuracy tuning, never fatal
        print(f"[team_live] input transcription language hints unavailable, using defaults: {exc}")
        input_transcription_cfg = types.AudioTranscriptionConfig()

    kwargs = dict(
        response_modalities=["AUDIO"],
        media_resolution="MEDIA_RESOLUTION_MEDIUM",
        speech_config=types.SpeechConfig(**speech_kwargs),
        system_instruction=types.Content(parts=[types.Part(text=system_instruction)]),
        input_audio_transcription=input_transcription_cfg,
        output_audio_transcription=types.AudioTranscriptionConfig(),
        tools=_team_tools(),
    )
    try:
        kwargs["realtime_input_config"] = types.RealtimeInputConfig(
            automatic_activity_detection=types.AutomaticActivityDetection(
                start_of_speech_sensitivity=types.StartSensitivity.START_SENSITIVITY_LOW,
                end_of_speech_sensitivity=types.EndSensitivity.END_SENSITIVITY_LOW,
                prefix_padding_ms=300,
                silence_duration_ms=1500,
            )
        )
    except Exception as exc:  # noqa: BLE001 — optional tuning, never fatal
        print(f"[team_live] VAD tuning unavailable, using defaults: {exc}")
    return types.LiveConnectConfig(**kwargs)
