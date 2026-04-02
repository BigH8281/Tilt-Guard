from copy import deepcopy
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.pre_session_briefing import (
    PreSessionBriefingCapabilitiesResponse,
    PreSessionBriefingRequest,
    PreSessionBriefingResponse,
)
from app.services.pre_session_briefing import (
    generate_tg_pre_session_briefing,
    get_current_tg_pre_session_briefing,
    get_pre_session_briefing_capabilities,
    save_current_tg_pre_session_briefing,
)
from presession_briefing.errors import BriefingValidationError, LiveDataError


router = APIRouter(prefix="/pre-session-briefing", tags=["pre-session-briefing"])


@router.get("/capabilities", response_model=PreSessionBriefingCapabilitiesResponse)
def get_capabilities(
    _: Annotated[User, Depends(get_current_user)],
) -> PreSessionBriefingCapabilitiesResponse:
    return get_pre_session_briefing_capabilities()


@router.get("/current", response_model=PreSessionBriefingResponse)
def get_current_briefing(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PreSessionBriefingResponse:
    response = get_current_tg_pre_session_briefing(db, current_user.id)
    if response is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No saved briefing found.",
        )
    return response


@router.post("/live", response_model=PreSessionBriefingResponse)
def generate_live_briefing(
    payload: PreSessionBriefingRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> PreSessionBriefingResponse:
    try:
        response = generate_tg_pre_session_briefing(payload.model_dump(exclude_none=True))
        storage = save_current_tg_pre_session_briefing(db, current_user.id, response)
        live_response = deepcopy(response)
        live_response["storage"] = storage
        return live_response
    except BriefingValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
    except LiveDataError as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=str(exc),
        ) from exc
