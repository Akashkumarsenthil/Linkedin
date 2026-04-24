"""
LinkedIn Platform — Authentication utilities
JWT issuance/verification + password hashing + FastAPI dependency helpers.

Library choices:
  PyJWT  — already in requirements (pip show PyJWT); lightweight, no crypto extras needed
  passlib[bcrypt] — already installed (bcrypt pinned to 4.0.1; passlib 1.7.4 breaks on 4.1+)
"""

import jwt
from datetime import datetime, timedelta, timezone
from typing import Optional

from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from passlib.context import CryptContext
from sqlalchemy.orm import Session

from config import settings
from database import get_db

# ── Password hashing ────────────────────────────────────────────────────────

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    return pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


# ── JWT ─────────────────────────────────────────────────────────────────────

# auto_error=False on the optional scheme so endpoints can still be called
# without a token (the dependency returns None instead of raising 401).
oauth2_required = OAuth2PasswordBearer(tokenUrl="/auth/login")
oauth2_optional = OAuth2PasswordBearer(tokenUrl="/auth/login", auto_error=False)


def create_access_token(user_id: int, user_type: str, email: str) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=settings.JWT_EXPIRE_MINUTES)
    payload = {
        "sub": email,
        "user_id": user_id,
        "user_type": user_type,
        "exp": expire,
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm=settings.JWT_ALGORITHM)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.JWT_SECRET, algorithms=[settings.JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


# ── Token payload carrier ────────────────────────────────────────────────────

class TokenPayload:
    """Parsed JWT claims — injected into protected endpoints via Depends."""

    __slots__ = ("user_id", "user_type", "email")

    def __init__(self, user_id: int, user_type: str, email: str):
        self.user_id = user_id
        self.user_type = user_type
        self.email = email


# ── Dependency helpers ───────────────────────────────────────────────────────

def get_current_user(token: str = Depends(oauth2_required)) -> TokenPayload:
    """Require a valid bearer token. Raises 401 if absent or invalid."""
    data = _decode(token)
    return TokenPayload(
        user_id=data["user_id"],
        user_type=data["user_type"],
        email=data["sub"],
    )


def optional_current_user(
    token: Optional[str] = Depends(oauth2_optional),
) -> Optional[TokenPayload]:
    """Return parsed payload or None — for endpoints where auth is optional."""
    if not token:
        return None
    try:
        data = _decode(token)
        return TokenPayload(
            user_id=data["user_id"],
            user_type=data["user_type"],
            email=data["sub"],
        )
    except HTTPException:
        return None


def require_member(
    current_user: TokenPayload = Depends(get_current_user),
) -> TokenPayload:
    """Require the caller to be a member. Raises 403 for recruiters."""
    if current_user.user_type != "member":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Member account required for this action",
        )
    return current_user


def require_recruiter(
    current_user: TokenPayload = Depends(get_current_user),
) -> TokenPayload:
    """Require the caller to be a recruiter. Raises 403 for members."""
    if current_user.user_type != "recruiter":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Recruiter account required for this action",
        )
    return current_user
