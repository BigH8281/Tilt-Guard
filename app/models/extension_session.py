from datetime import datetime
from typing import TYPE_CHECKING, Any

from sqlalchemy import JSON, DateTime, ForeignKey, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base

if TYPE_CHECKING:
    from app.models.user import User


class ExtensionSession(Base):
    __tablename__ = "extension_sessions"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"), nullable=False, index=True)
    session_key: Mapped[str] = mapped_column(String(36), nullable=False, unique=True, index=True)
    extension_id: Mapped[str] = mapped_column(String(64), nullable=False, index=True)
    extension_version: Mapped[str | None] = mapped_column(String(32), nullable=True)
    platform: Mapped[str] = mapped_column(String(32), nullable=False, default="tradingview")
    extension_state: Mapped[str] = mapped_column(String(64), nullable=False, default="signed_out")
    monitoring_state: Mapped[str] = mapped_column(String(64), nullable=False, default="inactive")
    tradingview_detected: Mapped[bool] = mapped_column(nullable=False, default=False)
    broker_adapter: Mapped[str | None] = mapped_column(String(64), nullable=True)
    broker_profile: Mapped[str | None] = mapped_column(String(128), nullable=True)
    adapter_confidence: Mapped[float] = mapped_column(nullable=False, default=0.0)
    adapter_reliability: Mapped[str | None] = mapped_column(String(32), nullable=True)
    warning_message: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_tab_url: Mapped[str | None] = mapped_column(Text, nullable=True)
    current_tab_title: Mapped[str | None] = mapped_column(Text, nullable=True)
    status_payload: Mapped[dict[str, Any] | None] = mapped_column(JSON, nullable=True)
    connected_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    last_heartbeat_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
    disconnected_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)

    user: Mapped["User"] = relationship(back_populates="extension_sessions")
