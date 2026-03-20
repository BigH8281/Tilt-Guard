from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class JournalEntryBase(BaseModel):
    session_id: int
    content: str


class JournalEntryCreate(JournalEntryBase):
    pass


class JournalEntryCreateRequest(BaseModel):
    content: str = Field(min_length=1)


class JournalEntryRead(JournalEntryBase):
    id: int
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
