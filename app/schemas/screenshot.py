from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict


class ScreenshotBase(BaseModel):
    session_id: int
    screenshot_type: Literal["pre", "journal", "post"]
    file_path: str


class ScreenshotCreate(ScreenshotBase):
    pass


class ScreenshotRead(ScreenshotBase):
    id: int
    file_url: str
    uploaded_at: datetime

    model_config = ConfigDict(from_attributes=True)
