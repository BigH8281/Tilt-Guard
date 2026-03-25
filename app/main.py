from contextlib import asynccontextmanager
import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import text

from app.config import CORS_ALLOWED_ORIGINS, FILE_STORAGE_URL_PATH
from app.db import engine
from app.routers.auth import router as auth_router
from app.routers.broker_telemetry import router as broker_telemetry_router
from app.routers.extension_connect import router as extension_connect_router
from app.routers.extension_sessions import router as extension_sessions_router
from app.routers.health import router as health_router
from app.routers.sessions import router as sessions_router
from app.storage import FILE_STORAGE_ROOT, ensure_storage_root


logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)


@asynccontextmanager
async def lifespan(_: FastAPI):
    with engine.connect() as connection:
        connection.execute(text("SELECT 1"))
    yield


app = FastAPI(
    title="Trading Journal API",
    version="0.1.0",
    lifespan=lifespan,
)

ensure_storage_root()

app.add_middleware(
    CORSMiddleware,
    allow_origins=CORS_ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router)
app.include_router(auth_router)
app.include_router(broker_telemetry_router)
app.include_router(extension_connect_router)
app.include_router(extension_sessions_router)
app.include_router(sessions_router)
app.mount(FILE_STORAGE_URL_PATH, StaticFiles(directory=FILE_STORAGE_ROOT), name="uploads")
