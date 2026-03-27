from typing import Annotated

from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.db import get_db
from app.dependencies import get_current_user
from app.models.user import User
from app.schemas.broker_telemetry import (
    BrokerTelemetryBatchIngestRequest,
    BrokerTelemetryBatchIngestResponse,
    BrokerTelemetryEventListResponse,
    BrokerTelemetryLatestResponse,
    BrokerTelemetrySystemEventListResponse,
    TradeEvidenceListResponse,
)
from app.services.broker_telemetry import (
    get_latest_broker_telemetry,
    ingest_broker_telemetry_events,
    list_trade_evidence_events,
    list_broker_system_events,
    list_broker_telemetry_events,
)


router = APIRouter(prefix="/broker-telemetry", tags=["broker-telemetry"])


@router.get("/events", response_model=BrokerTelemetryEventListResponse)
def get_broker_telemetry_events(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=100),
    event_type: str | None = Query(default=None),
    broker_adapter: str | None = Query(default=None),
) -> BrokerTelemetryEventListResponse:
    return list_broker_telemetry_events(
        db=db,
        user=current_user,
        limit=limit,
        event_type=event_type,
        broker_adapter=broker_adapter,
    )


@router.get("/latest", response_model=BrokerTelemetryLatestResponse)
def get_latest_broker_telemetry_event(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    broker_adapter: str | None = Query(default=None),
) -> BrokerTelemetryLatestResponse:
    return get_latest_broker_telemetry(
        db=db,
        user=current_user,
        broker_adapter=broker_adapter,
    )


@router.get("/system-feed", response_model=BrokerTelemetrySystemEventListResponse)
def get_broker_system_events(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=100),
) -> BrokerTelemetrySystemEventListResponse:
    return list_broker_system_events(db=db, user=current_user, limit=limit)


@router.get("/trade-evidence", response_model=TradeEvidenceListResponse)
def get_trade_evidence_events(
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
    limit: int = Query(default=20, ge=1, le=100),
    trading_session_id: int | None = Query(default=None),
    broker_adapter: str | None = Query(default=None),
) -> TradeEvidenceListResponse:
    return list_trade_evidence_events(
        db=db,
        user=current_user,
        limit=limit,
        trading_session_id=trading_session_id,
        broker_adapter=broker_adapter,
    )


@router.post("/ingest", response_model=BrokerTelemetryBatchIngestResponse, status_code=status.HTTP_202_ACCEPTED)
def ingest_broker_telemetry(
    payload: BrokerTelemetryBatchIngestRequest,
    current_user: Annotated[User, Depends(get_current_user)],
    db: Annotated[Session, Depends(get_db)],
) -> BrokerTelemetryBatchIngestResponse:
    return ingest_broker_telemetry_events(db=db, user=current_user, payload=payload)
