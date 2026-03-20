from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, ForeignKey, String
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.storage import build_public_file_url

if TYPE_CHECKING:
    from app.models.trading_session import TradingSession


class Screenshot(Base):
    __tablename__ = "screenshots"

    id: Mapped[int] = mapped_column(primary_key=True, index=True)
    session_id: Mapped[int] = mapped_column(ForeignKey("trading_sessions.id"), nullable=False, index=True)
    screenshot_type: Mapped[str] = mapped_column(String(16), nullable=False)
    file_path: Mapped[str] = mapped_column(String(500), nullable=False)
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)

    trading_session: Mapped["TradingSession"] = relationship(back_populates="screenshots")

    @property
    def file_url(self) -> str:
        return build_public_file_url(self.file_path)
