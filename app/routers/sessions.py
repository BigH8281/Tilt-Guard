from typing import Annotated

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.journal_entry import JournalEntryCreateRequest, JournalEntryRead
from app.schemas.screenshot import ScreenshotRead
from app.schemas.trade_event import (
    ObservedTradeSyncRequest,
    SessionPositionRead,
    TradeCloseRequest,
    TradeEventRead,
    TradeNoteUpdateRequest,
    TradeOpenRequest,
)
from app.schemas.trading_session import (
    TradingSessionCreateRequest,
    TradingSessionEndRequest,
    TradingSessionRead,
    TradingSessionSetupRequest,
)
from app.services.journal import create_journal_entry
from app.services.read_models import (
    list_journal_entries_for_session,
    list_screenshots_for_session,
    list_trade_events_for_session,
)
from app.services.session import (
    close_session,
    create_session,
    get_open_session_for_user,
    get_session_for_user,
    list_sessions_for_user,
    update_session_setup,
)
from app.services.screenshot import save_screenshot
from app.services.trade import create_close_trade, create_open_trade, get_position_size, update_trade_note, upsert_observed_trade


router = APIRouter(prefix="/sessions", tags=["sessions"])


def require_user_session(db: Session, user_id: int, session_id: int):
    session = get_session_for_user(db, user_id, session_id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    return session


@router.post("", response_model=TradingSessionRead, status_code=status.HTTP_201_CREATED)
def create_new_session(
    payload: TradingSessionCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TradingSessionRead:
    open_session = get_open_session_for_user(db, current_user.id)
    if open_session is not None:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="An open session already exists for this user.",
        )

    return create_session(db, current_user, payload)


@router.get("/open", response_model=TradingSessionRead)
def get_open_session(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TradingSessionRead:
    session = get_open_session_for_user(db, current_user.id)
    if session is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="No open session found.",
        )

    return session


@router.get("", response_model=list[TradingSessionRead])
def list_sessions(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[TradingSessionRead]:
    return list_sessions_for_user(db, current_user.id)


@router.get("/{session_id}", response_model=TradingSessionRead)
def get_session_detail(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TradingSessionRead:
    return require_user_session(db, current_user.id, session_id)


@router.patch("/{session_id}/setup", response_model=TradingSessionRead)
def update_opening_setup(
    session_id: int,
    payload: TradingSessionSetupRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TradingSessionRead:
    session = require_user_session(db, current_user.id, session_id)

    try:
        return update_session_setup(db, session, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post("/{session_id}/journal", response_model=JournalEntryRead, status_code=status.HTTP_201_CREATED)
def add_journal_entry(
    session_id: int,
    payload: JournalEntryCreateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> JournalEntryRead:
    session = require_user_session(db, current_user.id, session_id)

    try:
        return create_journal_entry(db, session, payload.content)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get("/{session_id}/journal", response_model=list[JournalEntryRead])
def list_journal_entries(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[JournalEntryRead]:
    require_user_session(db, current_user.id, session_id)
    return list_journal_entries_for_session(db, session_id)


@router.post("/{session_id}/trade/open", response_model=TradeEventRead, status_code=status.HTTP_201_CREATED)
def open_trade(
    session_id: int,
    payload: TradeOpenRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TradeEventRead:
    session = require_user_session(db, current_user.id, session_id)

    try:
        return create_open_trade(
            db=db,
            session=session,
            direction=payload.direction,
            size=payload.size,
            symbol=payload.symbol,
            note=payload.note,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.get("/{session_id}/trade", response_model=list[TradeEventRead])
def list_trade_events(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[TradeEventRead]:
    require_user_session(db, current_user.id, session_id)
    return list_trade_events_for_session(db, session_id)


@router.post("/{session_id}/trade/close", response_model=TradeEventRead, status_code=status.HTTP_201_CREATED)
def close_trade(
    session_id: int,
    payload: TradeCloseRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TradeEventRead:
    session = require_user_session(db, current_user.id, session_id)

    try:
        return create_close_trade(
            db=db,
            session=session,
            size=payload.size,
            result_gbp=payload.result_gbp,
            symbol=payload.symbol,
            note=payload.note,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post("/{session_id}/trade/observed", response_model=TradeEventRead, status_code=status.HTTP_201_CREATED)
def sync_observed_trade(
    session_id: int,
    payload: ObservedTradeSyncRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TradeEventRead:
    session = require_user_session(db, current_user.id, session_id)

    try:
        return upsert_observed_trade(
            db=db,
            session=session,
            observed_episode_id=payload.observed_episode_id,
            event_type=payload.event_type,
            symbol=payload.symbol,
            direction=payload.direction,
            size=payload.size,
            event_time=payload.event_time,
            result_gbp=payload.result_gbp,
            note=payload.note,
        )
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.patch("/{session_id}/trade/{trade_event_id}/note", response_model=TradeEventRead)
def patch_trade_note(
    session_id: int,
    trade_event_id: int,
    payload: TradeNoteUpdateRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TradeEventRead:
    session = require_user_session(db, current_user.id, session_id)
    trade_event = next((event for event in session.trade_events if event.id == trade_event_id), None)
    if trade_event is None:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Trade event not found.",
        )

    return update_trade_note(db=db, event=trade_event, note=payload.note)


@router.get("/{session_id}/screenshots", response_model=list[ScreenshotRead])
def list_screenshots(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> list[ScreenshotRead]:
    require_user_session(db, current_user.id, session_id)
    return list_screenshots_for_session(db, session_id)


@router.get("/{session_id}/position", response_model=SessionPositionRead)
def get_position(
    session_id: int,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> SessionPositionRead:
    require_user_session(db, current_user.id, session_id)
    return SessionPositionRead(current_open_size=get_position_size(db, session_id))


@router.post("/{session_id}/upload", response_model=ScreenshotRead, status_code=status.HTTP_201_CREATED)
def upload_screenshot(
    session_id: int,
    screenshot_type: Annotated[str, Form()],
    file: Annotated[UploadFile, File()],
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> ScreenshotRead:
    if screenshot_type not in {"pre", "journal", "post"}:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="screenshot_type must be 'pre', 'journal', or 'post'.",
        )

    session = require_user_session(db, current_user.id, session_id)

    try:
        return save_screenshot(db, session, screenshot_type, file)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc


@router.post("/{session_id}/end", response_model=TradingSessionRead)
def end_session(
    session_id: int,
    payload: TradingSessionEndRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> TradingSessionRead:
    session = require_user_session(db, current_user.id, session_id)

    try:
        return close_session(db, session, payload)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=str(exc),
        ) from exc
