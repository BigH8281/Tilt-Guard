from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.broker_telemetry_event import BrokerTelemetryEvent
    from app.models.trading_session import TradingSession


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String(255), unique=True, index=True, nullable=False)
    hashed_password: Mapped[str] = mapped_column(String(255), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    trading_sessions: Mapped[list["TradingSession"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
    broker_telemetry_events: Mapped[list["BrokerTelemetryEvent"]] = relationship(
        back_populates="user",
        cascade="all, delete-orphan",
    )
