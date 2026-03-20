import os

import uvicorn


def _env_flag(name: str, default: bool = False) -> bool:
    raw_value = os.getenv(name)
    if raw_value is None:
        return default
    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


def main() -> None:
    reload_enabled = _env_flag("UVICORN_RELOAD")
    host = os.getenv("APP_HOST") or ("127.0.0.1" if reload_enabled else "0.0.0.0")
    port = int(os.getenv("PORT", os.getenv("APP_PORT", "8000")))

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload_enabled,
    )


if __name__ == "__main__":
    main()
