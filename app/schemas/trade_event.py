from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class TradeEventBase(BaseModel):
    session_id: int
    event_type: Literal["OPEN", "ADD", "REDUCE", "CLOSE"]
    symbol: str | None = None
    direction: str | None = None
    size: int
    result_gbp: float | None = None
    note: str | None = None


class TradeEventCreate(TradeEventBase):
    event_time: datetime | None = None


class TradeOpenRequest(BaseModel):
    direction: str = Field(min_length=1, max_length=50)
    size: int = Field(ge=1)
    symbol: str | None = Field(default=None, min_length=1, max_length=64)
    note: str | None = None


class TradeCloseRequest(BaseModel):
    size: int = Field(ge=1)
    result_gbp: float
    symbol: str | None = Field(default=None, min_length=1, max_length=64)
    note: str | None = None


class ObservedTradeSyncRequest(BaseModel):
    observed_episode_id: str = Field(min_length=1, max_length=128)
    event_type: Literal["OPEN", "ADD", "REDUCE", "CLOSE"]
    symbol: str = Field(min_length=1, max_length=64)
    direction: str | None = Field(default=None, min_length=1, max_length=50)
    size: int = Field(ge=1)
    event_time: datetime
    result_gbp: float | None = None
    note: str | None = None


class TradeNoteUpdateRequest(BaseModel):
    note: str | None = None


class TradeEventRead(TradeEventBase):
    id: int
    event_time: datetime
    source: Literal["manual", "observed", "merged"]
    reconciliation_state: Literal["matched", "ambiguous", "unmatched"]
    observed_episode_id: str | None = None

    model_config = ConfigDict(from_attributes=True)


class SessionPositionRead(BaseModel):
    current_open_size: int
