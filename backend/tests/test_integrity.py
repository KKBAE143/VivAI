"""Session-integrity signals: what trips them, and what must never trip them.

A false positive here accuses an honest student of cheating during an exam, and
the students most at risk from a naive detector are the fluent ones and the ones
answering in code-mixed Telugu-English — which is the platform's whole audience.
So the negative tests below matter more than the positive ones.
"""
from __future__ import annotations

import pytest

from ai import integrity


# A real code-mixed answer, of the kind that must never be suspicious on its own.
CODE_MIXED = (
    "Yeah so transitive dependency ante, ah, non key attribute meeda non key attribute "
    "depend ayite, appudu adi transitive dependency. Ante student ID lo department name "
    "depend avuthundi, emo, so 3NF lo daanini remove chestham."
)

READ_ALOUD = (
    "Third normal form is a normalization stage that requires the relation to already be in "
    "second normal form. Firstly, every non-key attribute must depend directly on the primary "
    "key. Secondly, no transitive dependency may exist between non-key attributes. Furthermore, "
    "this eliminates update, insert and delete anomalies while preserving lossless join and "
    "dependency preservation. In conclusion, third normal form improves data consistency and "
    "reduces redundancy across the relational schema significantly."
)


# --------------------------------------------------------------------------- #
# What must NEVER be suspicious
# --------------------------------------------------------------------------- #
def test_a_code_mixed_answer_is_not_suspicious():
    """The clarifying case from testing: the assistant being used to cheat ALSO
    spoke Telugu and English mixed, so language carries no information either way.
    Flagging it would only ever hit genuine students."""
    assert integrity.assess_turn(CODE_MIXED, seconds=45)["suspicious"] is False


def test_code_mixed_hesitations_are_recognised_as_hesitations():
    """`delivery_metrics.FILLER_WORDS` is English-only, so a Telugu speaker's
    hesitations were invisible to it — and 'no hesitation' is a suspicion signal.
    Reusing that list would have flagged them for speaking Telugu."""
    assert integrity.count_hesitations(CODE_MIXED) > 0


def test_a_short_answer_is_never_assessed():
    verdict = integrity.assess_turn("Yes, it removes transitive dependency.", seconds=6)
    assert verdict["suspicious"] is False
    assert verdict["signals"] == []


def test_a_fluent_human_answer_is_not_suspicious_on_fluency_alone():
    fluent = (
        "So basically the primary key uniquely identifies each row, you know, and the foreign "
        "key points at another table's primary key. I mean, in our project the student table "
        "has a department ID which is a foreign key, and that's how we join them when we need "
        "the department name for a report."
    )
    assert integrity.assess_turn(fluent, seconds=40)["suspicious"] is False


def test_correctness_is_not_a_signal():
    """A wrong answer is a low score, never a suspicion."""
    wrong = (
        "Um, I think 3NF means, uh, you split the table into three parts, like three tables, "
        "and that's why it's called third normal form, you know, so basically three tables is "
        "the rule and that removes the duplicate data from the database completely."
    )
    assert integrity.assess_turn(wrong, seconds=35)["suspicious"] is False


def test_one_signal_alone_never_warns():
    """Deliberately hard to trip. A long answer, or a tidy one, is not evidence."""
    long_but_human = (
        "Okay so, um, let me think. The way we built it, the student table has the department "
        "ID, and, you know, when we needed the department name we were storing it directly in "
        "the student table at first, which turned out to be, uh, a transitive dependency, and "
        "so we split it out into its own table later on when our guide pointed it out to us "
        "during the review, and after that the updates became much simpler for us to handle."
    )
    verdict = integrity.assess_turn(long_but_human, seconds=60)
    assert verdict["score"] < integrity.SUSPICION_THRESHOLD
    assert verdict["suspicious"] is False


# --------------------------------------------------------------------------- #
# What should be suspicious
# --------------------------------------------------------------------------- #
def test_read_aloud_prose_trips_several_signals():
    verdict = integrity.assess_turn(READ_ALOUD, seconds=30)
    assert verdict["suspicious"] is True
    assert "no_hesitation_in_a_long_answer" in verdict["signals"]
    assert "written_register" in verdict["signals"]


def test_leaving_the_window_while_answering_weighs_heaviest():
    """Behavioural, not linguistic — it does not depend on how the student talks,
    which is exactly why it carries more weight than any stylistic signal."""
    with_focus = integrity.assess_turn(CODE_MIXED, seconds=45, focus_lost=False)
    without = integrity.assess_turn(CODE_MIXED, seconds=45, focus_lost=True)
    assert without["score"] > with_focus["score"]
    assert "left_the_session_while_answering" in without["signals"]


def test_the_reported_attack_is_caught():
    """The tester's actual method: an assistant on a phone reading the answer out
    while they sat in another app."""
    verdict = integrity.assess_turn(READ_ALOUD, seconds=28, focus_lost=True)
    assert verdict["suspicious"] is True
    assert verdict["confidence"] == "high"


def test_a_sustained_read_aloud_pace_is_a_signal():
    fast = " ".join(["normalization removes redundancy from the relational schema"] * 12)
    verdict = integrity.assess_turn(fast, seconds=20)
    assert "sustained_read_aloud_pace" in verdict["signals"]


def test_pace_is_ignored_without_reliable_timing():
    """A missing or tiny duration must not become an invented pace."""
    for seconds in (None, 0, 3):
        verdict = integrity.assess_turn(READ_ALOUD, seconds=seconds)
        assert "sustained_read_aloud_pace" not in verdict["signals"]


# --------------------------------------------------------------------------- #
# How it is communicated
# --------------------------------------------------------------------------- #
def test_the_warning_is_phrased_as_a_doubt_not_a_charge():
    message = integrity.WARNING_MESSAGE.lower()
    assert "didn't sound like natural speech" in message
    assert "in your own words" in message
    # The student may be entirely innocent and the platform cannot know.
    for accusation in ("cheat", "cheating", "violation", "you were caught"):
        assert accusation not in message


def test_the_warning_says_it_carries_on():
    assert "carry on" in integrity.WARNING_MESSAGE.lower()


def test_every_signal_has_a_human_readable_label():
    verdict = integrity.assess_turn(READ_ALOUD, seconds=28, focus_lost=True)
    described = integrity.describe(verdict["signals"])
    assert len(described) == len(verdict["signals"])
    for label in described:
        assert " " in label, "a faculty member should not be reading snake_case"


@pytest.mark.parametrize("signal", list(integrity.SIGNAL_LABELS))
def test_no_label_names_the_student_as_dishonest(signal: str):
    label = integrity.SIGNAL_LABELS[signal].lower()
    for word in ("cheat", "fraud", "dishonest", "fake"):
        assert word not in label
