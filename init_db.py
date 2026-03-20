import subprocess
import sys


def init_db() -> None:
    subprocess.run([sys.executable, "-m", "alembic", "upgrade", "head"], check=True)


if __name__ == "__main__":
    init_db()
    print("Database migrated to head.")
