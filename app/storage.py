from pathlib import Path

from app.config import FILE_STORAGE_ROOT, FILE_STORAGE_URL_PATH


LEGACY_UPLOADS_PREFIX = "uploads/"


def normalise_storage_key(file_path: str) -> str:
    storage_key = file_path.replace("\\", "/").lstrip("/")
    if storage_key.startswith(LEGACY_UPLOADS_PREFIX):
        return storage_key.removeprefix(LEGACY_UPLOADS_PREFIX)
    return storage_key


def get_storage_path(file_path: str) -> Path:
    return FILE_STORAGE_ROOT / normalise_storage_key(file_path)


def build_public_file_url(file_path: str) -> str:
    return f"{FILE_STORAGE_URL_PATH}/{normalise_storage_key(file_path)}"


def ensure_storage_root() -> None:
    FILE_STORAGE_ROOT.mkdir(parents=True, exist_ok=True)
