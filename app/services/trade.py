import logging
from datetime import datetime, timedelta

from sqlalchemy import case, func, select
from sqlalchemy.orm import Session

from app.models.trade_event import TradeEvent
from app.models.trading_session import TradingSession
from app.services.session import ensure_session_is_open


logger = logging.getLogger(__name__)
RECONCILIATION_WINDOW_SECONDS = 120
OPEN_DUPLICATE_WHILE_POSITION_OPEN_SECONDS = 30
CLOSE_DUPLICATE_AFTER_FLAT_SECONDS = 45
OPEN_LIKE_EVENT_TYPES = frozenset({"OPEN", "ADD"})
CLOSE_LIKE_EVENT_TYPES = frozenset({"REDUCE", "CLOSE"})


def _normalize_symbol(symbol: str | None) -> str | None:
    normalized = (symbol or "").strip().upper()
    return normalized or None


def _normalize_direction(direction: str | None) -> str | None:
    normalized = (direction or "").strip().lower()
    return normalized or None


def _sizes_are_compatible(left: int | None, right: int | None) -> bool:
    if left is None or right is None:
        return True

    return abs(left - right) <= max(1, int(round(max(left, right) * 0.25)))


def _is_open_like_event_type(event_type: str) -> bool:
    return event_type in OPEN_LIKE_EVENT_TYPES


def _is_close_like_event_type(event_type: str) -> bool:
    return event_type in CLOSE_LIKE_EVENT_TYPES


def _find_trade_match_candidates(
    db: Session,
    *,
    session_id: int,
    event_type: str,
    event_time: datetime,
    symbol: str | None,
    direction: str | None,
    size: int | None,
    prefer_observed_only: bool = False,
    current_open_size: int | None = None,
) -> list[TradeEvent]:
    statement = (
        select(TradeEvent)
        .where(TradeEvent.session_id == session_id)
        .where(TradeEvent.event_type == event_type)
        .where(
            TradeEvent.event_time.between(
                event_time - timedelta(seconds=RECONCILIATION_WINDOW_SECONDS),
                event_time + timedelta(seconds=RECONCILIATION_WINDOW_SECONDS),
            )
        )
        .order_by(TradeEvent.event_time.desc(), TradeEvent.id.desc())
    )

    if prefer_observed_only:
        statement = statement.where(TradeEvent.source.in_(("observed", "merged")))

    normalized_symbol = _normalize_symbol(symbol)
    normalized_direction = _normalize_direction(direction)
    matches: list[TradeEvent] = []

    for candidate in db.scalars(statement):
        delta_seconds = abs((event_time - candidate.event_time).total_seconds())
        candidate_symbol = _normalize_symbol(candidate.symbol)
        candidate_direction = _normalize_direction(candidate.direction)

        if normalized_symbol and candidate_symbol and candidate_symbol != normalized_symbol:
            continue

        if normalized_direction and candidate_direction and candidate_direction != normalized_direction:
            continue

        if not _sizes_are_compatible(candidate.size, size):
            continue

        if _is_open_like_event_type(event_type) and (current_open_size or 0) > 0 and delta_seconds > OPEN_DUPLICATE_WHILE_POSITION_OPEN_SECONDS:
            continue

        if _is_close_like_event_type(event_type) and (current_open_size or 0) <= 0 and delta_seconds > CLOSE_DUPLICATE_AFTER_FLAT_SECONDS:
            continue

        intervening_statement = (
            select(TradeEvent.id)
            .where(TradeEvent.session_id == session_id)
            .where(TradeEvent.event_time > candidate.event_time)
            .where(TradeEvent.event_time < event_time)
            .limit(1)
        )

        if _is_open_like_event_type(event_type):
            intervening_statement = intervening_statement.where(TradeEvent.event_type.in_(CLOSE_LIKE_EVENT_TYPES))
        else:
            intervening_statement = intervening_statement.where(TradeEvent.event_type.in_(OPEN_LIKE_EVENT_TYPES))

        if normalized_symbol:
            intervening_statement = intervening_statement.where(TradeEvent.symbol == normalized_symbol)

        if db.scalar(intervening_statement) is not None:
            continue

        matches.append(candidate)

    return matches


def _apply_observed_facts(
    event: TradeEvent,
    *,
    event_type: str,
    symbol: str,
    direction: str | None,
    size: int,
    event_time: datetime,
    result_gbp: float | None,
    observed_episode_id: str,
    merged: bool,
    ambiguous: bool = False,
) -> TradeEvent:
    event.event_type = event_type
    event.symbol = _normalize_symbol(symbol)
    event.direction = _normalize_direction(direction)
    event.size = size
    event.event_time = event_time
    if result_gbp is not None and event.result_gbp is None:
        event.result_gbp = result_gbp
    event.observed_episode_id = observed_episode_id
    event.source = "merged" if merged else "observed"
    event.reconciliation_state = "ambiguous" if ambiguous else ("matched" if merged else "unmatched")
    return event


def get_position_size(db: Session, session_id: int) -> int:
    position_delta = case(
        (TradeEvent.event_type.in_(OPEN_LIKE_EVENT_TYPES), TradeEvent.size),
        (TradeEvent.event_type.in_(CLOSE_LIKE_EVENT_TYPES), -TradeEvent.size),
        else_=0,
    )
    statement = select(func.coalesce(func.sum(position_delta), 0)).where(TradeEvent.session_id == session_id)
    return int(db.scalar(statement) or 0)


def create_open_trade(
    db: Session,
    session: TradingSession,
    direction: str,
    size: int,
    symbol: str | None,
    note: str | None,
) -> TradeEvent:
    ensure_session_is_open(session)

    current_open_size = get_position_size(db, session.id)
    normalized_symbol = _normalize_symbol(symbol) or _normalize_symbol(session.symbol)
    normalized_direction = _normalize_direction(direction)
    event_type = "ADD" if current_open_size > 0 else "OPEN"
    now = datetime.utcnow()
    matches = _find_trade_match_candidates(
        db,
        session_id=session.id,
        event_type=event_type,
        event_time=now,
        symbol=normalized_symbol,
        direction=normalized_direction,
        size=size,
        prefer_observed_only=True,
        current_open_size=current_open_size,
    )

    if len(matches) == 1:
        event = matches[0]
        if note:
            event.note = note
        event.source = "merged"
        event.reconciliation_state = "matched"
        db.add(event)
        db.commit()
        db.refresh(event)
        return event

    event = TradeEvent(
        session_id=session.id,
        event_type=event_type,
        symbol=normalized_symbol,
        direction=normalized_direction,
        size=size,
        note=note,
        source="manual",
        reconciliation_state="unmatched",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def create_close_trade(
    db: Session,
    session: TradingSession,
    size: int,
    result_gbp: float,
    symbol: str | None,
    note: str | None,
) -> TradeEvent:
    ensure_session_is_open(session)

    current_open_size = get_position_size(db, session.id)
    logger.info(
        "close_trade_attempt session_id=%s requested_size=%s current_open_size=%s",
        session.id,
        size,
        current_open_size,
    )
    if current_open_size <= 0:
        logger.warning(
            "close_trade_rejected_no_open_position session_id=%s requested_size=%s",
            session.id,
            size,
        )
        raise ValueError("Cannot close a trade because no open position exists.")
    if size > current_open_size:
        logger.warning(
            "close_trade_rejected_size_exceeds_position session_id=%s requested_size=%s current_open_size=%s",
            session.id,
            size,
            current_open_size,
        )
        raise ValueError("Cannot close more than the current open size.")

    normalized_symbol = _normalize_symbol(symbol) or _normalize_symbol(session.symbol)
    event_type = "REDUCE" if size < current_open_size else "CLOSE"
    now = datetime.utcnow()
    matches = _find_trade_match_candidates(
        db,
        session_id=session.id,
        event_type=event_type,
        event_time=now,
        symbol=normalized_symbol,
        direction=None,
        size=size,
        prefer_observed_only=True,
        current_open_size=current_open_size,
    )

    if len(matches) == 1:
        event = matches[0]
        if note:
            event.note = note
        if event.result_gbp is None:
            event.result_gbp = result_gbp
        event.source = "merged"
        event.reconciliation_state = "matched"
        db.add(event)
        db.commit()
        db.refresh(event)
        return event

    event = TradeEvent(
        session_id=session.id,
        event_type=event_type,
        symbol=normalized_symbol,
        size=size,
        result_gbp=result_gbp,
        note=note,
        source="manual",
        reconciliation_state="unmatched",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    logger.info(
        "close_trade_created session_id=%s trade_event_id=%s remaining_open_size=%s",
        session.id,
        event.id,
        current_open_size - size,
    )
    return event


def upsert_observed_trade(
    db: Session,
    *,
    session: TradingSession,
    observed_episode_id: str,
    event_type: str,
    symbol: str,
    direction: str | None,
    size: int,
    event_time: datetime,
    result_gbp: float | None,
    note: str | None,
) -> TradeEvent:
    ensure_session_is_open(session)

    existing = db.scalar(
        select(TradeEvent)
        .where(TradeEvent.session_id == session.id)
        .where(TradeEvent.observed_episode_id == observed_episode_id)
        .limit(1)
    )
    if existing is not None:
        _apply_observed_facts(
            existing,
            event_type=event_type,
            symbol=symbol,
            direction=direction,
            size=size,
            event_time=event_time,
            result_gbp=result_gbp,
            observed_episode_id=observed_episode_id,
            merged=existing.source in {"manual", "merged"},
            ambiguous=existing.reconciliation_state == "ambiguous",
        )
        if note and not existing.note:
            existing.note = note
        db.add(existing)
        db.commit()
        db.refresh(existing)
        return existing

    matches = _find_trade_match_candidates(
        db,
        session_id=session.id,
        event_type=event_type,
        event_time=event_time,
        symbol=symbol,
        direction=direction,
        size=size,
        current_open_size=get_position_size(db, session.id),
    )

    if len(matches) == 1:
        matched_event = matches[0]
        _apply_observed_facts(
            matched_event,
            event_type=event_type,
            symbol=symbol,
            direction=direction,
            size=size,
            event_time=event_time,
            result_gbp=result_gbp,
            observed_episode_id=observed_episode_id,
            merged=True,
        )
        if note and not matched_event.note:
            matched_event.note = note
        db.add(matched_event)
        db.commit()
        db.refresh(matched_event)
        return matched_event

    event = TradeEvent(
        session_id=session.id,
        event_type=event_type,
        symbol=_normalize_symbol(symbol),
        direction=_normalize_direction(direction),
        size=size,
        result_gbp=result_gbp,
        note=note,
        source="observed",
        reconciliation_state="ambiguous" if len(matches) > 1 else "unmatched",
        observed_episode_id=observed_episode_id,
        event_time=event_time,
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


def update_trade_note(
    db: Session,
    *,
    event: TradeEvent,
    note: str | None,
) -> TradeEvent:
    event.note = note
    db.add(event)
    db.commit()
    db.refresh(event)
    return event
