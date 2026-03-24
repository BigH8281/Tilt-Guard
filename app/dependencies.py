import logging
from typing import Annotated

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError
from sqlalchemy.orm import Session

from app.db import get_db
from app.models.user import User
from app.security import decode_access_token, inspect_access_token_claims


bearer_scheme = HTTPBearer(auto_error=False)
logger = logging.getLogger(__name__)


def get_current_user(
    request: Request,
    credentials: Annotated[HTTPAuthorizationCredentials | None, Depends(bearer_scheme)],
    db: Annotated[Session, Depends(get_db)],
) -> User:
    unauthorized = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Invalid or missing authentication credentials.",
    )

    if credentials is None:
        logger.warning("auth_credentials_missing path=%s", request.url.path)
        raise unauthorized

    try:
        payload = decode_access_token(credentials.credentials)
    except InvalidTokenError as exc:
        token_claims = inspect_access_token_claims(credentials.credentials)
        logger.warning(
            "auth_token_decode_failed path=%s reason=%s claims=%s",
            request.url.path,
            exc.__class__.__name__,
            token_claims,
        )
        raise unauthorized from exc

    user_id = payload.get("sub")
    if not user_id:
        logger.warning("auth_token_missing_subject path=%s claims=%s", request.url.path, payload)
        raise unauthorized

    try:
        parsed_user_id = int(user_id)
    except (TypeError, ValueError) as exc:
        logger.warning(
            "auth_token_subject_parse_failed path=%s subject=%r",
            request.url.path,
            user_id,
        )
        raise unauthorized from exc

    user = db.get(User, parsed_user_id)
    if user is None:
        logger.warning("auth_user_not_found path=%s user_id=%s", request.url.path, parsed_user_id)
        raise unauthorized

    return user
