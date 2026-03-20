from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.journal_entry import JournalEntry
    from app.models.screenshot import Screenshot
    from app.models.trade_event import TradeEvent
    from app.models.user import User


class TradingSession(Base):
    __tablename__ = "trading_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(16), nullable=False)
    session_name: Mapped[str] = mapped_column(String(255), nullable=False, default="NY AM")
    symbol: Mapped[str] = mapped_column(String(50), nullable=False, default="MNQ")
    started_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    closed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    market_bias: Mapped[str] = mapped_column(String(255), nullable=False)
    htf_condition: Mapped[str] = mapped_column(String(255), nullable=False)
    expected_open_type: Mapped[str] = mapped_column(String(255), nullable=False)
    confidence: Mapped[int] = mapped_column(Integer, nullable=False)
    end_traded_my_time: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    end_traded_my_conditions: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    end_respected_my_exit: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    reason_time_no: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason_conditions_no: Mapped[str | None] = mapped_column(Text, nullable=True)
    reason_exit_no: Mapped[str | None] = mapped_column(Text, nullable=True)

    user: Mapped["User"] = relationship(back_populates="trading_sessions")
    journal_entries: Mapped[list["JournalEntry"]] = relationship(
        back_populates="trading_session",
        cascade="all, delete-orphan",
    )
    trade_events: Mapped[list["TradeEvent"]] = relationship(
        back_populates="trading_session",
        cascade="all, delete-orphan",
    )
    screenshots: Mapped[list["Screenshot"]] = relationship(
        back_populates="trading_session",
        cascade="all, delete-orphan",
    )
