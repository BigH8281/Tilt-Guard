import logging
from datetime import datetime, timedelta, UTC
from typing import Any

import bcrypt
import jwt
from jwt import InvalidTokenError

from app.config import ACCESS_TOKEN_EXPIRE_MINUTES, JWT_ALGORITHM, JWT_SECRET_KEY


logger = logging.getLogger(__name__)


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed_password: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), hashed_password.encode("utf-8"))


def create_access_token(subject: str, expires_minutes: int = ACCESS_TOKEN_EXPIRE_MINUTES) -> str:
    issued_at = datetime.now(UTC)
    expires_at = issued_at + timedelta(minutes=expires_minutes)
    payload: dict[str, Any] = {
        "sub": subject,
        "iat": issued_at,
        "exp": expires_at,
    }
    return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)


def decode_access_token(token: str) -> dict[str, Any]:
    return jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])


def inspect_access_token_claims(token: str) -> dict[str, Any]:
    try:
        payload = jwt.decode(
            token,
            options={
                "verify_signature": False,
                "verify_exp": False,
                "verify_iat": False,
                "verify_nbf": False,
                "verify_aud": False,
            },
            algorithms=[JWT_ALGORITHM],
        )
    except InvalidTokenError as exc:
        logger.warning("auth_token_claim_inspection_failed reason=%s", exc.__class__.__name__)
        return {}

    summary: dict[str, Any] = {}
    for key in ("sub", "iat", "exp", "nbf"):
        if key in payload:
            summary[key] = payload[key]
    return summary
