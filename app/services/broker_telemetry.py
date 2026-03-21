from sqlalchemy import desc, select
from sqlalchemy.orm import Session

from app.models.broker_telemetry_event import BrokerTelemetryEvent
from app.models.user import User
from app.schemas.broker_telemetry import (
    BrokerTelemetryBatchIngestRequest,
    BrokerTelemetryBatchIngestResponse,
    BrokerTelemetryEventListResponse,
    BrokerTelemetryIngestResult,
)


def ingest_broker_telemetry_events(
    db: Session,
    user: User,
    payload: BrokerTelemetryBatchIngestRequest,
) -> BrokerTelemetryBatchIngestResponse:
    requested_event_ids = [event.event_id for event in payload.events]
    existing_event_ids = set(
        db.scalars(
            select(BrokerTelemetryEvent.event_id).where(BrokerTelemetryEvent.event_id.in_(requested_event_ids))
        )
    )

    results: list[BrokerTelemetryIngestResult] = []
    accepted = 0

    for event in payload.events:
        if event.event_id in existing_event_ids:
            results.append(BrokerTelemetryIngestResult(event_id=event.event_id, status="duplicate"))
            continue

        stored_event = BrokerTelemetryEvent(
            user_id=user.id,
            event_id=event.event_id,
            event_type=event.event_type,
            source=event.source,
            platform=event.platform,
            broker_adapter=event.broker_adapter,
            observation_key=event.observation_key,
            page_url=event.page_url,
            page_title=event.page_title,
            occurred_at=event.occurred_at,
            snapshot=event.snapshot.model_dump(mode="json"),
            details={
                **(event.details or {}),
                "tab_id": event.tab_id,
            },
        )
        db.add(stored_event)
        existing_event_ids.add(event.event_id)
        accepted += 1
        results.append(BrokerTelemetryIngestResult(event_id=event.event_id, status="inserted"))

    db.commit()
    return BrokerTelemetryBatchIngestResponse(accepted=accepted, results=results)


def list_broker_telemetry_events(
    db: Session,
    user: User,
    *,
    limit: int,
    event_type: str | None = None,
    broker_adapter: str | None = None,
) -> BrokerTelemetryEventListResponse:
    statement = (
        select(BrokerTelemetryEvent)
        .where(BrokerTelemetryEvent.user_id == user.id)
        .order_by(desc(BrokerTelemetryEvent.occurred_at), desc(BrokerTelemetryEvent.id))
        .limit(limit)
    )

    if event_type:
        statement = statement.where(BrokerTelemetryEvent.event_type == event_type)

    if broker_adapter:
        statement = statement.where(BrokerTelemetryEvent.broker_adapter == broker_adapter)

    events = list(db.scalars(statement))
    return BrokerTelemetryEventListResponse(events=events)
