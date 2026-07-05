"""Gamification: XP, level, streak and badges."""
from fastapi import APIRouter, Depends

from core.deps import get_current_user
from services import gamification_service

router = APIRouter(prefix="/api/gamification", tags=["gamification"])


@router.get("")
def get_gamification(user=Depends(get_current_user)):
    return gamification_service.get_gamification(user["id"])
