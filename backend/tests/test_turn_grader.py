"""The live evaluation panel, rebuilt without function calling.

The panel used to be fed by `record_question` / `score_response` tool calls made
by the examiner inside its own speaking turn, which is what silenced the voice.
These tests pin the replacement: the same panel events, produced from the
transcript by a separate call that the conversation never waits on.
"""
from __future__ import annotations

import asyncio

import pytest

from ai import turn_grader
from api import live as live_api


# --------------------------------------------------------------------------- #
# Deciding what is worth grading (no model involved)
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "text",
    [
        "What is third normal form?",
        "Explain how your authentication flow works",
        "Tell me about the trade-offs there",
        "So how did you handle concurrent writes",  # transcription dropped the "?"
        "Walk me through the deployment",
    ],
)
def test_a_question_is_recognised_without_a_question_mark(text):
    """Spoken transcription drops question marks constantly, so punctuation alone
    cannot be the test — a viva where half the questions never reach the panel is
    barely better than no panel."""
    assert turn_grader.looks_like_a_question(text)


@pytest.mark.parametrize(
    "text",
    [
        "Good, that's right.",
        "Okay, let's move on.",
        "Thank you, that's everything from my side.",
        "",
        "   ",
    ],
)
def test_a_reaction_is_not_a_question(text):
    """Pairing the next answer with "good, that's right" would put a nonsense
    entry in the student's panel and in their session events."""
    assert not turn_grader.looks_like_a_question(text)


def test_a_cue_word_inside_another_word_is_not_a_question():
    """"however" contains "how"; "whatsoever" contains "what". A substring match
    would call almost every reaction a question."""
    assert not turn_grader.looks_like_a_question("However that was fine whatsoever")


def test_the_question_is_pulled_out_of_a_mixed_turn():
    """An examiner turn is usually a reaction AND the next question. The panel
    should show the question, not the praise attached to the previous answer."""
    asked = turn_grader.extract_question(
        "Good, that covers indexing well. Now, what is the difference between "
        "clustered and non-clustered indexes?"
    )
    assert asked.startswith("Now, what is the difference")
    assert "covers indexing well" not in asked


def test_a_turn_with_no_question_still_returns_something_usable():
    assert turn_grader.extract_question("Right, let's move on.") == "Right, let's move on."


@pytest.mark.parametrize(
    "answer",
    ["Yes", "I don't know", "Sorry, repeat that", "Umm", "No idea sir"],
)
def test_a_non_answer_is_not_graded(answer):
    """Scoring "yes" on its own spends a call to add noise. The final report sees
    the whole transcript and can judge a non-answer in context."""
    assert not turn_grader.should_grade("What is 3NF?", answer)


def test_a_short_but_real_answer_is_still_graded():
    """The floor exists to skip non-utterances, not to demand length. A concise
    correct answer is exactly what a well-prepared student gives."""
    assert turn_grader.should_grade(
        "What is third normal form?",
        "It removes transitive dependencies from the relation.",
    )


def test_a_real_answer_to_a_real_question_is_graded():
    assert turn_grader.should_grade(
        "What is third normal form?",
        "Third normal form removes transitive dependencies, so every non-key "
        "attribute depends only on the primary key.",
    )


def test_an_answer_to_no_question_is_not_graded():
    assert not turn_grader.should_grade(
        "Good, thank you.",
        "Third normal form removes transitive dependencies from a relation entirely.",
    )


# --------------------------------------------------------------------------- #
# Grading one exchange
# --------------------------------------------------------------------------- #
def test_grading_uses_the_same_rubric_as_the_final_report(monkeypatch):
    """A panel that says 80 while the report says 55 is worse than an empty panel.
    Both must be calibrated by the same bands."""
    seen = {}

    def fake(prompt, *args, **kwargs):
        seen["prompt"] = prompt
        return {"topic": "Normalization", "score": 72, "feedback": "Right idea, no example."}

    monkeypatch.setattr(turn_grader.gemini_service, "generate_json", fake)
    graded = turn_grader.grade_exchange(
        mode="viva",
        question="What is third normal form?",
        answer="It removes transitive dependencies so non-key attributes depend on the key.",
        project_context="A DBMS project",
        subject="DBMS",
    )
    assert graded == {
        "question": "What is third normal form?",
        "topic": "Normalization",
        "score": 72,
        "feedback": "Right idea, no example.",
    }
    assert "SCORING BANDS" in seen["prompt"]
    assert "90-100" in seen["prompt"]


def test_grading_asks_the_model_exactly_once(monkeypatch):
    """`generate_json` defaults to two retries because it was written for batch
    report generation. Retrying here just makes a student wait for a number that
    finalize is going to recompute anyway."""
    calls = []

    def fake(prompt, system_instruction=None, default=None, retries=2):
        calls.append(retries)
        return {"topic": "t", "score": 50, "feedback": "f"}

    monkeypatch.setattr(turn_grader.gemini_service, "generate_json", fake)
    turn_grader.grade_exchange(
        mode="viva",
        question="What is 3NF?",
        answer="It removes transitive dependencies from the relation completely.",
    )
    assert calls == [0]


def test_a_grade_with_no_number_is_discarded(monkeypatch):
    """Falling back to 50 would show the student a mark nobody assigned."""
    monkeypatch.setattr(
        turn_grader.gemini_service, "generate_json",
        lambda *a, **k: {"topic": "t", "feedback": "no score here"},
    )
    assert turn_grader.grade_exchange(
        mode="viva",
        question="What is 3NF?",
        answer="It removes transitive dependencies from the relation completely.",
    ) is None


def test_a_model_failure_is_not_an_error(monkeypatch):
    """The panel going quiet must never be able to disturb the session."""
    def boom(*a, **k):
        raise RuntimeError("429 RESOURCE_EXHAUSTED")

    monkeypatch.setattr(turn_grader.gemini_service, "generate_json", boom)
    assert turn_grader.grade_exchange(
        mode="viva",
        question="What is 3NF?",
        answer="It removes transitive dependencies from the relation completely.",
    ) is None


def test_grading_is_bounded_by_a_deadline():
    """An ungated call against a rate-limited key is how a detached background
    task becomes a leak."""
    assert 0 < turn_grader.GRADE_TIMEOUT_SECONDS <= 10


# --------------------------------------------------------------------------- #
# Finding the question in the transcript
# --------------------------------------------------------------------------- #
def test_the_question_comes_from_the_transcript_not_from_the_model():
    """The whole reason this works: the pairing is derived from what was actually
    said, so it does not depend on the examiner reporting anything."""
    transcript = [
        {"role": "examiner", "text": "Hello, welcome.", "ts_ms": 0},
        {"role": "examiner", "text": " What is 3NF?", "ts_ms": 100},
        {"role": "student", "text": "It removes transitive", "ts_ms": 4000},
        {"role": "student", "text": " dependencies.", "ts_ms": 4500},
    ]
    question = live_api.last_examiner_question(transcript)
    assert "What is 3NF?" in question
    assert "It removes" not in question


def test_the_question_is_the_one_before_the_latest_answer():
    transcript = [
        {"role": "examiner", "text": "What is 3NF?", "ts_ms": 0},
        {"role": "student", "text": "Transitive dependencies are removed.", "ts_ms": 1000},
        {"role": "examiner", "text": "Good. Now what is BCNF?", "ts_ms": 2000},
        {"role": "student", "text": "Every determinant is a candidate key.", "ts_ms": 3000},
    ]
    assert "BCNF" in live_api.last_examiner_question(transcript)


def test_no_student_turn_yet_means_no_question_to_grade():
    transcript = [{"role": "examiner", "text": "Hello, what is 3NF?", "ts_ms": 0}]
    assert live_api.last_examiner_question(transcript) == ""


def test_an_answer_with_no_preceding_question_is_empty():
    """The student spoke first — nothing to pair it with."""
    transcript = [{"role": "student", "text": "Can you hear me?", "ts_ms": 0}]
    assert live_api.last_examiner_question(transcript) == ""


# --------------------------------------------------------------------------- #
# Feeding the panel
# --------------------------------------------------------------------------- #
def _persistence():
    return live_api.LivePersistence("viva", "s1", "u1", None)


def test_a_graded_turn_produces_the_events_the_panel_already_renders():
    """The client protocol is unchanged on purpose — the panel and its tests were
    never the problem, only who produced the events."""
    persist = _persistence()
    events = persist.on_graded_turn({
        "question": "What is 3NF?", "topic": "Normalization",
        "answer": "It removes transitive dependencies.", "score": 72,
        "feedback": "Right idea, no example.",
    })

    assert [e["event"] for e in events] == ["question", "score"]
    question_event, score_event = events
    assert question_event["question"] == "What is 3NF?"
    # Correlated by id, which is what groups the two into one card client-side.
    assert question_event["id"] == score_event["id"]
    assert score_event["score"] == 72
    assert score_event["feedback"] == "Right idea, no example."


def test_a_graded_turn_is_persisted_for_the_report_fallback():
    persist = _persistence()
    persist.on_graded_turn({
        "question": "What is 3NF?", "topic": "Normalization",
        "answer": "It removes transitive dependencies.", "score": 72,
        "feedback": "Right idea, no example.",
    })
    assert len(persist.questions) == 1
    recorded = persist.questions[0]
    assert recorded["score"] == 72
    assert recorded["answer"] == "It removes transitive dependencies."
    assert persist._avg_score() == 72


def test_several_graded_turns_get_distinct_ids():
    """Two questions sharing an id would collapse into one card and lose a score."""
    persist = _persistence()
    ids = []
    for i in range(3):
        events = persist.on_graded_turn(
            {"question": f"Q{i}", "topic": None, "answer": "a", "score": 50, "feedback": None}
        )
        ids.append(events[0]["id"])
    assert len(set(ids)) == 3


def test_grading_never_raises_into_the_session(monkeypatch):
    """The conversation is the product. A grading fault must be invisible to it."""
    persist = _persistence()
    persist.on_ai_text("What is third normal form?")
    persist.on_user_text("It removes transitive dependencies from the relation.")

    class Socket:
        def __init__(self):
            self.sent = []

        async def send_json(self, payload):
            self.sent.append(payload)

    def boom(**kwargs):
        raise RuntimeError("grader exploded")

    monkeypatch.setattr(turn_grader, "grade_exchange", boom)
    socket = Socket()
    asyncio.run(
        live_api._grade_turn_live(
            answer="It removes transitive dependencies from the relation.",
            persist=persist, websocket=socket, session_id="s1", mode="viva",
        )
    )
    assert socket.sent == []


def test_a_closing_socket_does_not_break_grading(monkeypatch):
    persist = _persistence()
    persist.on_ai_text("What is third normal form?")
    persist.on_user_text("It removes transitive dependencies from the relation.")

    class DeadSocket:
        async def send_json(self, payload):
            raise RuntimeError("socket closed")

    monkeypatch.setattr(
        turn_grader, "grade_exchange",
        lambda **k: {"question": "What is 3NF?", "topic": "t", "score": 70, "feedback": "f"},
    )
    asyncio.run(
        live_api._grade_turn_live(
            answer="It removes transitive dependencies from the relation.",
            persist=persist, websocket=DeadSocket(), session_id="s1", mode="viva",
        )
    )


def test_the_panel_is_fed_end_to_end(monkeypatch):
    """The whole replacement, in one pass: transcript in, panel events out, with
    no tool call anywhere."""
    persist = _persistence()
    persist.on_ai_text("Good. Now, what is third normal form?")
    persist.on_user_text("It removes transitive dependencies from the relation.")

    class Socket:
        def __init__(self):
            self.sent = []

        async def send_json(self, payload):
            self.sent.append(payload)

    def fake_grade(*, mode, question, answer, project_context="", subject=None):
        assert "third normal form" in question
        assert "transitive" in answer
        return {"question": question, "topic": "Normalization", "score": 81, "feedback": "Solid."}

    monkeypatch.setattr(turn_grader, "grade_exchange", fake_grade)
    socket = Socket()
    asyncio.run(
        live_api._grade_turn_live(
            answer="It removes transitive dependencies from the relation.",
            persist=persist, websocket=socket, session_id="s1", mode="viva",
        )
    )

    assert [e["event"] for e in socket.sent] == ["question", "score"]
    assert socket.sent[1]["score"] == 81
    assert persist.questions[0]["answer"] == "It removes transitive dependencies from the relation."


def test_grading_is_bounded_per_session():
    """A student answering faster than a rate-limited key can grade must not
    accumulate work."""
    assert live_api._MAX_INFLIGHT_GRADINGS <= 3


# --------------------------------------------------------------------------- #
# Every language, not just English
# --------------------------------------------------------------------------- #
@pytest.mark.parametrize(
    "text",
    [
        "Normalization gurinchi cheppandi",          # Telugu
        "Idi ela pani chestundi",                    # Telugu
        "Iska matlab kya hai",                       # Hindi
        "Yeh kaise kaam karta hai",                  # Hindi
        "Indexing ke baare mein bataiye",            # Hindi
        "Idhu eppadi velai seiyum",                  # Tamil
        "Transaction pattri sollunga",               # Tamil
        "Ee concept hege kelasa madutte",            # Kannada
    ],
)
def test_a_question_in_an_indian_language_is_recognised(text):
    """The examiner speaks the language the student chose, romanised on screen.
    An English-only cue list left the evaluation panel EMPTY for a whole Telugu or
    Hindi viva — for the students this platform exists for. Same reasoning as
    integrity.HESITATION_MARKERS."""
    assert turn_grader.looks_like_a_question(text)


def test_a_long_prompt_with_no_recognised_cue_is_still_graded():
    """No cue list covers every language a student may pick, and transcription
    drops question marks. Length is accepted as evidence so an unrecognised
    language degrades to "graded" rather than to "panel permanently empty"."""
    long_turn = " ".join(["prashna"] * 12)
    assert not turn_grader.looks_like_a_question(long_turn)
    assert turn_grader.is_gradable_prompt(long_turn)


def test_a_short_cueless_reaction_is_still_not_gradable():
    """The other side of the same trade: a brief cue-less turn is a reaction, and
    must not be paired with the next answer."""
    assert not turn_grader.is_gradable_prompt("Chaala baagundi.")
    assert not turn_grader.is_gradable_prompt("Bahut accha.")
    assert not turn_grader.is_gradable_prompt("Good, that's right.")


def test_the_question_falls_back_to_the_last_sentence_not_the_whole_turn():
    """In every language the question comes after the reaction to the previous
    answer, so the last sentence is a far better guess than the entire turn."""
    asked = turn_grader.extract_question("Chaala baagundi. Ippudu indexing gurinchi cheppandi.")
    assert asked == "Ippudu indexing gurinchi cheppandi."


def test_an_indian_language_exchange_is_graded_end_to_end(monkeypatch):
    seen = {}

    def fake(prompt, *args, **kwargs):
        seen["prompt"] = prompt
        return {"topic": "Normalization", "score": 64, "feedback": "Idea correct, no example."}

    monkeypatch.setattr(turn_grader.gemini_service, "generate_json", fake)
    graded = turn_grader.grade_exchange(
        mode="viva",
        question="Chaala baagundi. Normalization gurinchi cheppandi.",
        answer="Normalization ante data redundancy thagginchadam, tables ni split chesi.",
        subject="DBMS",
    )
    assert graded is not None
    assert graded["score"] == 64
    assert graded["question"] == "Normalization gurinchi cheppandi."
    # Content is graded, never the student's English.
    assert "not on its English" in seen["prompt"]


# --------------------------------------------------------------------------- #
# Ending the session without an `end_session` tool
# --------------------------------------------------------------------------- #
def test_the_examiner_turn_is_read_from_the_transcript():
    transcript = [
        {"role": "examiner", "text": "What is 3NF?", "ts_ms": 0},
        {"role": "student", "text": "It removes transitive dependencies.", "ts_ms": 1000},
        {"role": "examiner", "text": "Good. That's", "ts_ms": 2000},
        {"role": "examiner", "text": " everything from my side.", "ts_ms": 2100},
    ]
    assert live_api.last_examiner_turn(transcript) == "Good. That's everything from my side."


def test_no_examiner_turn_yet_is_empty():
    assert live_api.last_examiner_turn([{"role": "student", "text": "Hello?", "ts_ms": 0}]) == ""


def test_a_closing_remark_is_not_counted_as_a_question():
    """The count gates the ending, so a closing remark inflating it would let the
    session end one question early."""
    assert not turn_grader.looks_like_a_question("That's everything from my side, thank you.")
    assert not turn_grader.looks_like_a_question("Mee viva complete ayindi. Dhanyavadalu.")


def test_the_closing_silence_is_generous_enough_not_to_cut_anyone_off():
    """Ending a live exam early is a far worse failure than making a student press
    the End button they can already see."""
    assert live_api._CLOSING_SILENCE_SECONDS >= 20
