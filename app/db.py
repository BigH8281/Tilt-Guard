from typing import Generator

from sqlalchemy import create_engine, text
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from app.config import DATABASE_URL


class Base(DeclarativeBase):
    pass


engine_kwargs = {}
if DATABASE_URL.startswith("sqlite"):
    engine_kwargs["connect_args"] = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    **engine_kwargs,
)
SessionLocal = sessionmaker(
    bind=engine,
    autocommit=False,
    autoflush=False,
    expire_on_commit=False,
)


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_sqlite_schema() -> None:
    if engine.url.get_backend_name() != "sqlite":
        return

    with engine.begin() as connection:
        tables = connection.execute(
            text("SELECT name FROM sqlite_master WHERE type='table' AND name='trading_sessions'")
        ).fetchall()
        if not tables:
            return

        existing_columns = {
            row[1]
            for row in connection.execute(text("PRAGMA table_info(trading_sessions)")).fetchall()
        }

        if "session_name" not in existing_columns:
            connection.execute(
                text(
                    "ALTER TABLE trading_sessions "
                    "ADD COLUMN session_name VARCHAR(255) NOT NULL DEFAULT 'NY AM'"
                )
            )

        if "symbol" not in existing_columns:
            connection.execute(
                text(
                    "ALTER TABLE trading_sessions "
                    "ADD COLUMN symbol VARCHAR(50) NOT NULL DEFAULT 'MNQ'"
                )
            )
