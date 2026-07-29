"""Team Viva Mode — voice, live, AI-hosted group viva (REST + WebSocket).

Replaces the old text race-to-answer Team Viva. The team LEAD creates a
lobby and gets a shareable invite link (join_code); teammates already on the
team roster join via that link; once 3-5 people are in, the lead starts the
session and the AI examiner takes over, calling on one person at a time by
voice (see ai/team_room.py for the floor-control room and ai/team_live_service.py
for the Gemini persona/tools).
"""
from __future__ import annotations

import json
import secrets

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect

from ai import team_room, viva_core
from core.database import get_supabase
from core.deps import get_current_user, user_from_token
from models.schemas import TeamVivaCreate

router = APIRouter(prefix="/api/advanced", tags=["team-viva"])


def _membership(team_id: str, profile_id: str) -> dict | None:
    rows = (
        get_supabase().table("team_members").select("*")
        .eq("team_id", team_id).eq("profile_id", profile_id).execute().data
    )
    return rows[0] if rows else None


# --------------------------------------------------------------------------- #
# REST: create lobby, join-link preview, report
# --------------------------------------------------------------------------- #
@router.post("/team-viva/sessions", status_code=201)
def team_viva_create(body: TeamVivaCreate, user=Depends(get_current_user)):
    member = _membership(body.team_id, user["id"])
    if not member:
        raise HTTPException(status_code=403, detail="Not a member of this team")
    if member.get("role") != "Lead":
        raise HTTPException(status_code=403, detail="Only the team lead can start a team viva lobby")
    session = get_supabase().table("viva_sessions").insert({
        "profile_id": user["id"],
        "project_id": body.project_id,
        "session_type": "TeamViva",
        "subject": body.subject,
        "duration_minutes": 20,
        "context": {"team_id": body.team_id},
        "join_code": secrets.token_hex(4),
    }).execute().data[0]
    return session


@router.get("/team-viva/sessions/{session_id}")
def team_viva_get(session_id: str, user=Depends(get_current_user)):
    res = get_supabase().table("viva_sessions").select("*").eq("id", session_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Session not found")
    session = res.data[0]
    room = team_room.manager.rooms.get(session_id)
    return {
        **session,
        "online_members": [{"profile_id": pid, "name": name} for pid, name in (room.names.items() if room else [])],
        "lead_id": room.lead_id if room else session.get("profile_id"),
        "started": bool(room.started) if room else False,
    }


@router.get("/team-viva/join/{join_code}")
def team_viva_join_preview(join_code: str, user=Depends(get_current_user)):
    res = get_supabase().table("viva_sessions").select("*").eq("join_code", join_code).eq("session_type", "TeamViva").execute()
    team_id = ((res.data[0].get("context") or {}).get("team_id")) if res.data else None
    if not res.data or not team_id:
        raise HTTPException(status_code=404, detail="Invalid or expired invite link")
    session = res.data[0]
    if not _membership(team_id, user["id"]):
        raise HTTPException(status_code=403, detail="You're not a member of this team")
    sb = get_supabase()
    team = sb.table("teams").select("name").eq("id", team_id).execute().data
    lead = sb.table("profiles").select("full_name").eq("id", session["profile_id"]).execute().data
    return {
        "session_id": session["id"],
        "status": session.get("status"),
        "subject": session.get("subject"),
        "team_name": team[0]["name"] if team else "Team",
        "lead_name": lead[0]["full_name"] if lead else "Team Lead",
    }


@router.get("/team-viva/{session_id}/report")
def team_viva_report(session_id: str, user=Depends(get_current_user)):
    sb = get_supabase()
    scores = sb.table("team_viva_scores").select("*, profiles(full_name)").eq("session_id", session_id).execute().data
    questions = sb.table("viva_questions").select("*").eq("session_id", session_id).execute().data
    by_member: dict[str, list[dict]] = {}
    for q in questions:
        pid = q.get("profile_id")
        if pid:
            by_member.setdefault(pid, []).append(q)
    for member in scores:
        member["questions"] = by_member.get(member["profile_id"], [])
    return {"session_id": session_id, "members": scores}


# --------------------------------------------------------------------------- #
# WebSocket — lobby, floor control, audio relay
#
# browser -> server: binary = PCM16 mic (dropped server-side unless this
#   client currently holds the floor); {"type":"start"|"end"} (lead only)
# server -> browser: {"type":"lobby"|"floor"|"event"|"ended"|"error", ...};
#   binary = AI speech (PCM24), broadcast to every connected participant
# --------------------------------------------------------------------------- #
@router.websocket("/ws/team-viva/{session_id}")
async def ws_team_live(websocket: WebSocket, session_id: str):
    await websocket.accept()
    token = websocket.query_params.get("token", "")
    language = websocket.query_params.get("language", "English")
    persona = websocket.query_params.get("persona", "balanced")

    user = user_from_token(token)
    if not user:
        await websocket.send_json({"type": "error", "message": "Authentication failed"})
        await websocket.close(code=4401)
        return

    sb = get_supabase()
    res = sb.table("viva_sessions").select("*").eq("id", session_id).eq("session_type", "TeamViva").execute()
    if not res.data:
        await websocket.close(code=4404)
        return
    session = res.data[0]
    context = session.get("context") or {}
    team_id = context.get("team_id")

    # `user_from_token` returns only {id, email, name} — WebSocket routes never
    # load the profile the way get_current_user does. Faculty authority lives in
    # role + institution_id, so it has to be fetched here or faculty can never
    # be admitted. One query, only on the socket that needs it.
    prof = (
        sb.table("profiles").select("full_name, role, institution_id")
        .eq("id", user["id"]).execute().data
    )
    profile = prof[0] if prof else {}
    name = profile.get("full_name") or "Member"
    role = profile.get("role") or "student"

    # Two ways in. A team member is a PARTICIPANT and can be examined. A faculty
    # member of the institution that scheduled this assessment is an OBSERVER:
    # they may watch, pause and take over, but never hold a student slot and are
    # never examined. `teams` has no institution_id, which is why the authority
    # is read off the session that recorded it at creation time.
    is_member = bool(team_id and _membership(team_id, user["id"]))
    session_institution = context.get("institution_id")
    is_observer = (
        not is_member
        and role in ("faculty", "admin")
        and bool(session_institution)
        and profile.get("institution_id") == session_institution
    )
    if not is_member and not is_observer:
        await websocket.send_json({"type": "error", "message": "You cannot join this viva"})
        await websocket.close(code=4403)
        return

    room = team_room.manager.room(session_id, team_id, session["profile_id"])
    if is_member and user["id"] not in room.connections and len(room.connections) >= team_room.MAX_PARTICIPANTS:
        await websocket.send_json({"type": "error", "message": "This viva lobby is full"})
        await websocket.close(code=4403)
        return

    # Protocol v1+ clients can decode tagged audio frames, so they are the only
    # ones that receive relayed human voice (see ai/audio_frames.py).
    try:
        tagged = int(websocket.query_params.get("pv") or 0) >= 1
    except ValueError:
        tagged = False

    project_context = ""
    if session.get("project_id"):
        p = sb.table("projects").select("*").eq("id", session["project_id"]).execute().data
        project_context = viva_core.build_project_context(p[0] if p else None)

    if is_observer:
        await room.connect_observer(user["id"], name, websocket, tagged)
    else:
        await room.connect(user["id"], name, websocket, tagged=tagged)
    try:
        while True:
            msg = await websocket.receive()
            if msg.get("type") == "websocket.disconnect":
                break
            data = msg.get("bytes")
            if data is not None:
                await room.route_client_audio(user["id"], data)
                continue
            text = msg.get("text")
            if text is None:
                continue
            try:
                payload = json.loads(text)
            except (ValueError, TypeError):
                continue
            kind = payload.get("type")
            if kind == "start":
                try:
                    await room.start(user["id"], session.get("project_id"), project_context, session.get("subject"), language, persona)
                except (PermissionError, ValueError) as exc:
                    await websocket.send_json({"type": "error", "message": str(exc)})
            elif kind in ("pause_ai", "resume_ai"):
                # Faculty takeover. The room enforces the permission itself, so
                # a student sending this frame gets a refusal, not an effect.
                try:
                    await room.set_paused(user["id"], kind == "pause_ai")
                except PermissionError as exc:
                    await websocket.send_json({"type": "error", "message": str(exc)})
            elif kind == "grant_floor":
                try:
                    await room.grant_floor(user["id"], payload.get("participant_id"))
                except (PermissionError, ValueError) as exc:
                    await websocket.send_json({"type": "error", "message": str(exc)})
            elif kind == "end":
                try:
                    await room.end(user["id"])
                except PermissionError as exc:
                    await websocket.send_json({"type": "error", "message": str(exc)})
    except WebSocketDisconnect:
        pass
    finally:
        # Observers live in a separate dict, so removing them needs the matching
        # call — `disconnect` would silently leave the faculty entry behind and
        # keep broadcasting into a dead socket.
        if is_observer:
            await room.disconnect_observer(user["id"])
        else:
            await room.disconnect(user["id"])
        team_room.manager.drop_if_empty(session_id)
