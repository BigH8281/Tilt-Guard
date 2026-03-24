import os
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parent.parent
DEFAULT_SQLITE_PATH = BASE_DIR / "trading_journal.db"
DEFAULT_FILE_STORAGE_ROOT = BASE_DIR / "uploads"
DEFAULT_DEV_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://127.0.0.1:5173",
]
DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES = 60


def _normalise_database_url(raw_url: str | None) -> str:
    if not raw_url:
        return f"sqlite:///{DEFAULT_SQLITE_PATH.as_posix()}"

    if raw_url.startswith("postgres://"):
        return raw_url.replace("postgres://", "postgresql+psycopg://", 1)

    if raw_url.startswith("postgresql://"):
        return raw_url.replace("postgresql://", "postgresql+psycopg://", 1)

    return raw_url


def _parse_csv_env(raw_value: str | None) -> list[str]:
    if not raw_value:
        return []
    return [value.strip().rstrip("/") for value in raw_value.split(",") if value.strip()]


def _default_file_storage_root() -> Path:
    railway_volume_mount_path = os.getenv("RAILWAY_VOLUME_MOUNT_PATH")
    if railway_volume_mount_path:
        return Path(railway_volume_mount_path)
    return DEFAULT_FILE_STORAGE_ROOT


def _parse_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if not raw_value:
        return default

    try:
        parsed_value = int(raw_value)
    except ValueError as exc:
        raise RuntimeError(f"{name} must be an integer.") from exc

    if parsed_value <= 0:
        raise RuntimeError(f"{name} must be greater than zero.")

    return parsed_value


DATABASE_URL = _normalise_database_url(os.getenv("DATABASE_URL"))
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
if not JWT_SECRET_KEY:
    raise RuntimeError("JWT_SECRET_KEY must be set.")

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = _parse_int_env(
    "ACCESS_TOKEN_EXPIRE_MINUTES",
    DEFAULT_ACCESS_TOKEN_EXPIRE_MINUTES,
)

FILE_STORAGE_ROOT = Path(os.getenv("FILE_STORAGE_ROOT", str(_default_file_storage_root()))).expanduser()
FILE_STORAGE_URL_PATH = os.getenv("FILE_STORAGE_URL_PATH", "/uploads").strip() or "/uploads"
if not FILE_STORAGE_URL_PATH.startswith("/"):
    FILE_STORAGE_URL_PATH = f"/{FILE_STORAGE_URL_PATH}"
FILE_STORAGE_URL_PATH = FILE_STORAGE_URL_PATH.rstrip("/") or "/uploads"

CORS_ALLOWED_ORIGINS = _parse_csv_env(os.getenv("CORS_ALLOWED_ORIGINS"))
if not CORS_ALLOWED_ORIGINS:
    legacy_frontend_origin = os.getenv("FRONTEND_ORIGIN")
    if legacy_frontend_origin:
        CORS_ALLOWED_ORIGINS = [legacy_frontend_origin.rstrip("/")]
    else:
        CORS_ALLOWED_ORIGINS = DEFAULT_DEV_CORS_ORIGINS.copy()
