import app.models  # noqa: F401
from app.db import Base, engine, ensure_sqlite_schema


def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    ensure_sqlite_schema()


if __name__ == "__main__":
    init_db()
    print("Database initialized.")
