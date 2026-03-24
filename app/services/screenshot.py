import logging
from pathlib import Path
from uuid import uuid4

from fastapi import UploadFile
from sqlalchemy.orm import Session

from app.models.screenshot import Screenshot
from app.models.trading_session import TradingSession
from app.services.session import ensure_session_is_open
from app.storage import ensure_storage_root, get_storage_path


logger = logging.getLogger(__name__)


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
    logger.info(
        "screenshot_upload_started session_id=%s type=%s storage_key=%s",
        session.id,
        screenshot_type,
        storage_key,
    )

    try:
        with file_path.open("wb") as output_file:
            output_file.write(upload.file.read())
    except Exception:
        logger.exception(
            "screenshot_upload_file_write_failed session_id=%s type=%s storage_key=%s",
            session.id,
            screenshot_type,
            storage_key,
        )
        raise

    screenshot = Screenshot(
        session_id=session.id,
        screenshot_type=screenshot_type,
        file_path=storage_key,
    )
    db.add(screenshot)
    db.commit()
    db.refresh(screenshot)
    logger.info(
        "screenshot_upload_succeeded session_id=%s screenshot_id=%s type=%s storage_key=%s",
        session.id,
        screenshot.id,
        screenshot_type,
        storage_key,
    )
    return screenshot
