from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator


class TradingSessionBase(BaseModel):
    user_id: int
    status: Literal["open", "closed"]
    session_name: str
    symbol: str
    market_bias: str
    htf_condition: str
    expected_open_type: str
    confidence: int
    end_traded_my_time: bool | None = None
    end_traded_my_conditions: bool | None = None
    end_respected_my_exit: bool | None = None
    reason_time_no: str | None = None
    reason_conditions_no: str | None = None
    reason_exit_no: str | None = None


class TradingSessionCreate(TradingSessionBase):
    pass


class TradingSessionCreateRequest(BaseModel):
    session_name: str = Field(min_length=1, max_length=255)
    symbol: str = Field(min_length=1, max_length=50)


class TradingSessionSetupRequest(BaseModel):
    market_bias: str = Field(min_length=1, max_length=255)
    htf_condition: str = Field(min_length=1, max_length=255)
    expected_open_type: str = Field(min_length=1, max_length=255)
    confidence: int = Field(ge=1, le=10)


class TradingSessionEndRequest(BaseModel):
    end_traded_my_time: bool
    end_traded_my_conditions: bool
    end_respected_my_exit: bool
    reason_time_no: str | None = None
    reason_conditions_no: str | None = None
    reason_exit_no: str | None = None

    @model_validator(mode="after")
    def validate_reasons(self) -> "TradingSessionEndRequest":
        if not self.end_traded_my_time and not (self.reason_time_no and self.reason_time_no.strip()):
            raise ValueError("reason_time_no is required when end_traded_my_time is false.")

        if not self.end_traded_my_conditions and not (
            self.reason_conditions_no and self.reason_conditions_no.strip()
        ):
            raise ValueError(
                "reason_conditions_no is required when end_traded_my_conditions is false."
            )

        if not self.end_respected_my_exit and not (self.reason_exit_no and self.reason_exit_no.strip()):
            raise ValueError("reason_exit_no is required when end_respected_my_exit is false.")

        return self


class TradingSessionRead(TradingSessionBase):
    id: int
    started_at: datetime
    closed_at: datetime | None = None

    model_config = ConfigDict(from_attributes=True)
