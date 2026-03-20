from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.screenshot import Screenshot
from app.models.trading_session import TradingSession
from app.services.session import ensure_session_is_open
from app.storage import ensure_storage_root, get_storage_path


def save_screenshot(
    db: Session,
    session: TradingSession,
    screenshot_type: str,
    upload: UploadFile,
) -> Screenshot:
    ensure_session_is_open(session)
    ensure_storage_root()

    original_name = upload.filename or "upload.bin"
    suffix = Path(original_name).suffix or ".bin"
    stored_name = f"{screenshot_type}_{uuid4().hex}{suffix}"
    storage_key = f"screenshots/{session.id}/{stored_name}"
    file_path = get_storage_path(storage_key)
    file_path.parent.mkdir(parents=True, exist_ok=True)

    with file_path.open("wb") as output_file:
        output_file.write(upload.file.read())

    screenshot = Screenshot(
        session_id=session.id,
        screenshot_type=screenshot_type,
        file_path=storage_key,
    )
    db.add(screenshot)
    db.commit()
    db.refresh(screenshot)
    return screenshot
