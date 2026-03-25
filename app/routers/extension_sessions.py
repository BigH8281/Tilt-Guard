from typing import Annotated

from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.extension_session import (
    ExtensionSessionDisconnectRequest,
    ExtensionSessionStatusResponse,
    ExtensionSessionUpsertRequest,
    ExtensionSessionUpsertResponse,
)
from app.services.extension_session import disconnect_extension_session, get_extension_status, upsert_extension_session


router = APIRouter(prefix="/extension-sessions", tags=["extension-sessions"])


@router.post("/connect", response_model=ExtensionSessionUpsertResponse, status_code=status.HTTP_200_OK)
def connect_extension_session(
    payload: ExtensionSessionUpsertRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ExtensionSessionUpsertResponse:
    session = upsert_extension_session(db=db, user=current_user, payload=payload)
    return ExtensionSessionUpsertResponse(session=session)


@router.post("/heartbeat", response_model=ExtensionSessionUpsertResponse, status_code=status.HTTP_200_OK)
def heartbeat_extension_session(
    payload: ExtensionSessionUpsertRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ExtensionSessionUpsertResponse:
    session = upsert_extension_session(db=db, user=current_user, payload=payload)
    return ExtensionSessionUpsertResponse(session=session)


@router.post("/disconnect", response_model=ExtensionSessionStatusResponse, status_code=status.HTTP_200_OK)
def disconnect_extension(
    payload: ExtensionSessionDisconnectRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ExtensionSessionStatusResponse:
    disconnect_extension_session(db=db, user=current_user, extension_id=payload.extension_id)
    return get_extension_status(db=db, user=current_user)


@router.get("/status", response_model=ExtensionSessionStatusResponse)
def read_extension_status(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ExtensionSessionStatusResponse:
    return get_extension_status(db=db, user=current_user)
