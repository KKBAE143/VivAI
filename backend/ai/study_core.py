"""Doc-grounded question bank + flashcard generation and SM-2 scheduling."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from ai import gemini_service, prompts


def generate_question_bank(source_text: str, count: int = 12) -> list[dict]:
    result = gemini_service.generate_json(
        prompts.STUDY_QUESTION_BANK.format(source=source_text[:12000], count=count)
    ) or {}
    questions = result.get("questions") or []
    cleaned = []
    for q in questions:
        if not q.get("question"):
            continue
        diff = (q.get("difficulty") or "Medium").capitalize()
        cleaned.append(
            {
                "question_text": q["question"],
                "expected_answer": q.get("answer"),
                "topic": q.get("topic"),
                "difficulty": diff if diff in ("Easy", "Medium", "Hard") else "Medium",
            }
        )
    return cleaned


def generate_flashcards(source_text: str, count: int = 15) -> list[dict]:
    result = gemini_service.generate_json(
        prompts.STUDY_FLASHCARDS.format(source=source_text[:12000], count=count)
    ) or {}
    cards = result.get("cards") or []
    return [
        {"front": c["front"], "back": c.get("back", ""), "topic": c.get("topic")}
        for c in cards
        if c.get("front")
    ]


def generate_from_image(image_data: bytes, mime_type: str, count: int = 12) -> dict:
    """Doc-grounded generation directly from a PDF/image the student uploaded."""
    bank_json = gemini_service.generate_json_with_image(
        prompts.STUDY_QUESTION_BANK.format(source="(see attached document)", count=count),
        image_data, mime_type,
    ) or {}
    cards_json = gemini_service.generate_json_with_image(
        prompts.STUDY_FLASHCARDS.format(source="(see attached document)", count=count),
        image_data, mime_type,
    ) or {}
    questions = [
        {
            "question_text": q["question"],
            "expected_answer": q.get("answer"),
            "topic": q.get("topic"),
            "difficulty": (q.get("difficulty") or "Medium").capitalize(),
        }
        for q in (bank_json.get("questions") or [])
        if q.get("question")
    ]
    cards = [
        {"front": c["front"], "back": c.get("back", ""), "topic": c.get("topic")}
        for c in (cards_json.get("cards") or [])
        if c.get("front")
    ]
    return {"questions": questions, "cards": cards}


# ---------- SM-2 spaced repetition ----------
def schedule_review(card: dict, quality: int) -> dict:
    """Return updated SM-2 fields given a recall quality (0-5).

    quality: 0=blackout ... 5=perfect. <3 resets the interval.
    Card fields used: ease_factor (float), interval_days (int), repetitions (int).
    """
    ease = float(card.get("ease_factor") or 2.5)
    interval = int(card.get("interval_days") or 0)
    reps = int(card.get("repetitions") or 0)
    quality = max(0, min(5, quality))

    if quality < 3:
        reps = 0
        interval = 1
    else:
        if reps == 0:
            interval = 1
        elif reps == 1:
            interval = 6
        else:
            interval = round(interval * ease)
        reps += 1

    ease = ease + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
    ease = max(1.3, ease)
    due = datetime.now(timezone.utc) + timedelta(days=interval)
    return {
        "ease_factor": round(ease, 2),
        "interval_days": interval,
        "repetitions": reps,
        "due_at": due.isoformat(),
        "last_reviewed_at": datetime.now(timezone.utc).isoformat(),
    }
