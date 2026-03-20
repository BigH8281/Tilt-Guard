from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TradeEventBase(BaseModel):
    session_id: int
    event_type: Literal["OPEN", "CLOSE"]
    direction: str | None = None
    size: int
    result_gbp: float | None = None
    note: str | None = None


class TradeEventCreate(TradeEventBase):
    event_time: datetime | None = None


class TradeOpenRequest(BaseModel):
    direction: str = Field(min_length=1, max_length=50)
    size: int = Field(ge=1)
    note: str | None = None


class TradeCloseRequest(BaseModel):
    size: int = Field(ge=1)
    result_gbp: float
    note: str | None = None


class TradeEventRead(TradeEventBase):
    id: int
    event_time: datetime

    model_config = ConfigDict(from_attributes=True)


class SessionPositionRead(BaseModel):
    current_open_size: int
