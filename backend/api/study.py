"""Doc-grounded question banks + spaced-repetition flashcards."""
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException

from ai import study_core
from core.config import get_settings
from core.database import get_supabase
from core.deps import get_current_user
from models.schemas import BankToVivaRequest, FlashcardReview, QuestionBankCreate
from services import gamification_service
from services.activity_service import log_activity

router = APIRouter(prefix="/api/study", tags=["study"])


def _download_file_bytes(file_id: str, uid: str) -> tuple[bytes, str]:
    sb = get_supabase()
    res = sb.table("files").select("*").eq("id", file_id).eq("profile_id", uid).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="File not found")
    record = res.data[0]
    try:
        data = sb.storage.from_(get_settings().storage_bucket).download(record["storage_path"])
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Could not read file: {exc}")
    return data, record.get("mime_type") or "application/pdf"


# ---------- Question banks ----------
@router.get("/banks")
def list_banks(user=Depends(get_current_user)):
    try:
        return (
            get_supabase().table("question_banks").select("*")
            .eq("profile_id", user["id"]).order("created_at", desc=True).execute().data
        )
    except Exception as exc:
        print(f"Warning: question_banks table missing? {exc}")
        return []


@router.post("/banks", status_code=201)
def create_bank(body: QuestionBankCreate, user=Depends(get_current_user)):
    uid = user["id"]
    # Generate questions + flashcards, from either a file or pasted text.
    if body.file_id:
        data, mime = _download_file_bytes(body.file_id, uid)
        generated = study_core.generate_from_image(data, mime, body.count)
        questions, cards = generated["questions"], generated["cards"]
    elif body.source_text and body.source_text.strip():
        questions = study_core.generate_question_bank(body.source_text, body.count)
        cards = study_core.generate_flashcards(body.source_text, body.count)
    else:
        raise HTTPException(status_code=400, detail="Provide either source_text or file_id")

    if not questions and not cards:
        raise HTTPException(status_code=502, detail="AI could not generate content from this source; try again")

    sb = get_supabase()
    bank = sb.table("question_banks").insert(
        {
            "profile_id": uid,
            "project_id": body.project_id,
            "title": body.title,
            "source_file_id": body.file_id,
            "question_count": len(questions),
            "card_count": len(cards),
        }
    ).execute().data[0]

    if questions:
        sb.table("bank_questions").insert(
            [{"bank_id": bank["id"], **q} for q in questions]
        ).execute()
    if cards:
        sb.table("flashcards").insert(
            [
                {
                    "profile_id": uid,
                    "bank_id": bank["id"],
                    "project_id": body.project_id,
                    "front": c["front"],
                    "back": c["back"],
                    "topic": c.get("topic"),
                    "due_at": datetime.now(timezone.utc).isoformat(),
                }
                for c in cards
            ]
        ).execute()

    log_activity(uid, "question_bank_created", f"Created study set '{body.title}'", body.project_id, "question_bank", bank["id"])
    gamification_service.award_xp(uid, "question_bank_created")
    return {**bank, "questions": questions, "card_count": len(cards)}


@router.get("/banks/{bank_id}")
def get_bank(bank_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("question_banks").select("*").eq("id", bank_id).eq("profile_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Bank not found")
    questions = sb.table("bank_questions").select("*").eq("bank_id", bank_id).order("created_at").execute().data
    return {**res.data[0], "questions": questions}


@router.delete("/banks/{bank_id}", status_code=204)
def delete_bank(bank_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("question_banks").select("id").eq("id", bank_id).eq("profile_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Bank not found")
    sb.table("bank_questions").delete().eq("bank_id", bank_id).execute()
    sb.table("flashcards").delete().eq("bank_id", bank_id).execute()
    sb.table("question_banks").delete().eq("id", bank_id).execute()


@router.post("/banks/{bank_id}/to-viva", status_code=201)
def bank_to_viva(bank_id: str, body: BankToVivaRequest, user=Depends(get_current_user)):
    """Seed a mock viva session preloaded with this bank's questions."""
    sb = get_supabase()
    res = sb.table("question_banks").select("*").eq("id", bank_id).eq("profile_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Bank not found")
    bank = res.data[0]
    questions = sb.table("bank_questions").select("*").eq("bank_id", bank_id).order("created_at").execute().data
    if not questions:
        raise HTTPException(status_code=400, detail="This bank has no questions")

    session = sb.table("viva_sessions").insert(
        {
            "profile_id": user["id"],
            "project_id": bank.get("project_id"),
            "session_type": "Subject",
            "subject": bank["title"],
            "difficulty": body.difficulty,
            "language": body.language,
            "total_questions": len(questions),
            "source": "question_bank",
        }
    ).execute().data[0]

    sb.table("viva_questions").insert(
        [
            {
                "session_id": session["id"],
                "question_number": i + 1,
                "question_text": q["question_text"],
                "expected_answer": q.get("expected_answer"),
                "topic": q.get("topic"),
            }
            for i, q in enumerate(questions)
        ]
    ).execute()
    return session


# ---------- Flashcards (spaced repetition) ----------
@router.get("/flashcards/due")
def due_flashcards(limit: int = 30, user=Depends(get_current_user)):
    """Cards due for review now (plus never-reviewed), oldest due first."""
    now = datetime.now(timezone.utc).isoformat()
    try:
        rows = (
            get_supabase().table("flashcards").select("*")
            .eq("profile_id", user["id"]).lte("due_at", now)
            .order("due_at").limit(min(limit, 100)).execute().data
        )
        return rows
    except Exception as exc:
        print(f"Warning: flashcards table missing? {exc}")
        return []


@router.get("/flashcards/summary")
def flashcard_summary(user=Depends(get_current_user)):
    now = datetime.now(timezone.utc).isoformat()
    sb = get_supabase()
    try:
        all_cards = sb.table("flashcards").select("id, due_at, repetitions").eq("profile_id", user["id"]).execute().data or []
    except Exception:
        return {"total": 0, "due": 0, "learned": 0}
    due = sum(1 for c in all_cards if (c.get("due_at") or now) <= now)
    learned = sum(1 for c in all_cards if (c.get("repetitions") or 0) >= 3)
    return {"total": len(all_cards), "due": due, "learned": learned}


@router.post("/flashcards/{card_id}/review")
def review_flashcard(card_id: str, body: FlashcardReview, user=Depends(get_current_user)):
    sb = get_supabase()
    res = sb.table("flashcards").select("*").eq("id", card_id).eq("profile_id", user["id"]).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Card not found")
    updated = study_core.schedule_review(res.data[0], body.quality)
    sb.table("flashcards").update(updated).eq("id", card_id).execute()
    gamification_service.award_xp(user["id"], "flashcards_reviewed")
    return {"id": card_id, **updated}
