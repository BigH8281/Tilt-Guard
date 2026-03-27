from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.trading_session import TradingSession


class TradeEvent(Base):
    __tablename__ = "trade_events"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("trading_sessions.id"), nullable=False, index=True)
    event_type: Mapped[str] = mapped_column(String(16), nullable=False)
    symbol: Mapped[str | None] = mapped_column(String(64), nullable=True, index=True)
    direction: Mapped[str | None] = mapped_column(String(50), nullable=True)
    size: Mapped[int] = mapped_column(Integer, nullable=False)
    result_gbp: Mapped[float | None] = mapped_column(Float, nullable=True)
    note: Mapped[str | None] = mapped_column(Text, nullable=True)
    source: Mapped[str] = mapped_column(String(16), nullable=False, default="manual", server_default="manual")
    reconciliation_state: Mapped[str] = mapped_column(
        String(16),
        nullable=False,
        default="unmatched",
        server_default="unmatched",
    )
    observed_episode_id: Mapped[str | None] = mapped_column(String(128), nullable=True, index=True)
    event_time: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    trading_session: Mapped["TradingSession"] = relationship(back_populates="trade_events")
