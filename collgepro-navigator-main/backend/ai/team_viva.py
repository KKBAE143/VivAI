"""Team Viva real-time orchestration (in-memory room manager)."""
import time

from fastapi import WebSocket

from ai import gemini_service, prompts, viva_core

FIRST_ANSWER_BONUS = 10
CORRECTION_POINTS = 2


class Room:
    def __init__(self, session_id: str):
        self.session_id = session_id
        self.connections: dict[str, WebSocket] = {}
        self.names: dict[str, str] = {}
        self.current_question: dict | None = None
        self.question_started_at: float = 0
        self.answered_current: set[str] = set()
        self.stats: dict[str, dict] = {}  # profile_id -> counters

    def member_stats(self, profile_id: str) -> dict:
        return self.stats.setdefault(
            profile_id,
            {"score_total": 0, "questions_answered": 0, "first_answers": 0, "corrections_given": 0},
        )


class TeamVivaManager:
    def __init__(self):
        self.rooms: dict[str, Room] = {}

    def room(self, session_id: str) -> Room:
        return self.rooms.setdefault(session_id, Room(session_id))

    async def connect(self, session_id: str, profile_id: str, name: str, ws: WebSocket):
        await ws.accept()
        room = self.room(session_id)
        room.connections[profile_id] = ws
        room.names[profile_id] = name
        room.member_stats(profile_id)
        await self.broadcast(room, {"type": "lobby", "members": [
            {"profile_id": pid, "name": room.names.get(pid, "?")} for pid in room.connections
        ]})

    def disconnect(self, session_id: str, profile_id: str):
        room = self.rooms.get(session_id)
        if room:
            room.connections.pop(profile_id, None)
            if not room.connections:
                self.rooms.pop(session_id, None)

    async def broadcast(self, room: Room, message: dict):
        for ws in list(room.connections.values()):
            try:
                await ws.send_json(message)
            except Exception:
                pass

    async def next_question(self, room: Room, subject: str | None, project_context: str, language: str):
        history = []
        generated = viva_core.generate_question(
            subject, project_context, "Medium", language, history, prompts.TEAM_VIVA_EXAMINER
        )
        room.current_question = generated
        room.question_started_at = time.time()
        room.answered_current = set()
        await self.broadcast(room, {"type": "question", "question": generated["question"], "topic": generated.get("topic")})

    async def handle_answer(self, room: Room, profile_id: str, text: str, language: str):
        if not room.current_question:
            return
        is_first = len(room.answered_current) == 0
        is_correction = profile_id in room.answered_current
        evaluation = viva_core.evaluate_answer(
            room.current_question["question"], room.current_question.get("expected_answer"),
            text, language, prompts.TEAM_VIVA_EXAMINER,
        )
        stats = room.member_stats(profile_id)
        points = evaluation["score"]
        if is_first:
            points += FIRST_ANSWER_BONUS
            stats["first_answers"] += 1
        if is_correction:
            points = CORRECTION_POINTS if evaluation["score"] >= 60 else 0
            stats["corrections_given"] += 1
        else:
            stats["questions_answered"] += 1
        stats["score_total"] += points
        room.answered_current.add(profile_id)
        await self.broadcast(room, {
            "type": "answer_scored",
            "profile_id": profile_id,
            "name": room.names.get(profile_id, "?"),
            "first": is_first,
            "correction": is_correction,
            "score": evaluation["score"],
            "points_awarded": points,
            "feedback": evaluation.get("feedback"),
            "scoreboard": self.scoreboard(room),
        })

    def scoreboard(self, room: Room) -> list[dict]:
        return sorted(
            (
                {"profile_id": pid, "name": room.names.get(pid, "?"), **stats}
                for pid, stats in room.stats.items()
            ),
            key=lambda s: s["score_total"],
            reverse=True,
        )


manager = TeamVivaManager()
