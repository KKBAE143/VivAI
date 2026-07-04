"""Base viva AI logic: question generation, scoring, hints, summaries."""
from ai import gemini_service, prompts


def generate_question(
    subject: str | None,
    project_context: str,
    difficulty: str,
    language: str,
    history: list[str],
    system_prompt: str = prompts.VIVA_EXAMINER,
) -> dict:
    prompt = prompts.QUESTION_GEN.format(
        subject=subject or "General engineering",
        project_context=project_context or "None",
        difficulty=difficulty,
        language=language,
        history="; ".join(history[-10:]) or "None yet",
    )
    result = gemini_service.generate_json(prompt, system_prompt)
    if not result or "question" not in result:
        result = {
            "question": f"Explain the most important concept in {subject or 'your project'} and give a real example.",
            "topic": subject or "general",
            "expected_answer": "A structured explanation with a concrete example.",
        }
    return result


def evaluate_answer(
    question: str,
    expected: str | None,
    answer: str,
    language: str,
    system_prompt: str = prompts.VIVA_EXAMINER,
) -> dict:
    prompt = prompts.ANSWER_EVAL.format(
        question=question, expected=expected or "Use your expert judgement", answer=answer, language=language
    )
    result = gemini_service.generate_json(prompt, system_prompt)
    if not result or "score" not in result:
        result = {"score": 50, "feedback": "Could not evaluate automatically; partial credit given.", "correct": False}
    result["score"] = max(0, min(100, int(result.get("score", 50))))
    return result


def generate_hint(question: str, language: str) -> str:
    text = gemini_service.generate_text(
        prompts.HINT_GEN.format(question=question, language=language), prompts.VIVA_EXAMINER
    )
    return text.strip() or "Break the problem into smaller parts and start with the definition."


def next_difficulty(current: str, last_correct: bool) -> str:
    """Adaptive difficulty: correct -> harder; wrong -> stay or ease off."""
    order = ["Easy", "Medium", "Hard"]
    if current not in order:
        return current  # e.g. fixed 'Adaptive' handled by caller
    idx = order.index(current)
    if last_correct:
        idx = min(idx + 1, 2)
    else:
        idx = max(idx - 1, 0)
    return order[idx]


def session_summary(questions: list[dict]) -> dict:
    transcript = "\n".join(
        f"Q{q['question_number']}: {q['question_text']} | topic={q.get('topic')} | score={q.get('score')}"
        for q in questions
    )
    result = gemini_service.generate_json(
        prompts.SESSION_SUMMARY.format(transcript=transcript or "No questions"), prompts.VIVA_EXAMINER
    )
    scored = [q["score"] for q in questions if q.get("score") is not None]
    fallback_score = round(sum(scored) / len(scored)) if scored else 0
    if not result:
        result = {"overall_score": fallback_score, "strengths": [], "weaknesses": [], "summary": "Session completed.", "recommendation": "Practice more sessions."}
    result.setdefault("overall_score", fallback_score)
    return result


def build_project_context(project: dict | None) -> str:
    if not project:
        return ""
    return (
        f"Title: {project.get('title')}. Type: {project.get('type')}. "
        f"Subject: {project.get('subject')}. Tech stack: {', '.join(project.get('tech_stack') or [])}. "
        f"Problem: {project.get('problem_statement') or project.get('description') or ''}"
    )
