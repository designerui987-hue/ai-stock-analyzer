from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from datetime import datetime, timedelta, timezone
from typing import Optional
from config import settings

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)
pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    """Hash password consistently using passlib pbkdf2_sha256."""
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify password with fallback for legacy 72-byte truncated hashes."""
    if pwd_context.verify(plain_password, hashed_password):
        return True
    # Backwards compatibility check for any legacy accounts with 72-byte truncation
    truncated = plain_password.encode('utf-8')[:72].decode('utf-8', errors='ignore')
    if truncated != plain_password:
        return pwd_context.verify(truncated, hashed_password)
    return False


def create_access_token(subject: str, expires_delta: timedelta | None = None) -> str:
    to_encode = {"sub": subject}
    now = datetime.now(timezone.utc)
    if expires_delta:
        expire = now + expires_delta
    else:
        expire = now + timedelta(hours=settings.jwt_expiration_hours)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, settings.secret_key, algorithm=ALGORITHM)
    return encoded_jwt


def decode_jwt_token(token: str) -> str:
    """Decode and verify a JWT token string, returning the user_id (sub)."""
    try:
        payload = jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if not user_id:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
        return user_id
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid authentication credentials")


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> str:
    return decode_jwt_token(credentials.credentials)


async def get_stream_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
) -> str:
    """
    Authenticate SSE / WebSocket streams without leaking session tokens into URLs.
    Checks the Authorization header and the same-site auth cookie.
    """
    raw_token = None
    if credentials and credentials.credentials:
        raw_token = credentials.credentials
    elif "authorization" in request.headers:
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            raw_token = auth_header.split(" ", 1)[1].strip()
    elif "auth_token" in request.cookies:
        raw_token = request.cookies.get("auth_token")
    if not raw_token:
        raise HTTPException(status_code=401, detail="Authentication token required for streaming")
    return decode_jwt_token(raw_token)


optional_security = HTTPBearer(auto_error=False)


async def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(optional_security),
) -> str | None:
    """Resolve authenticated user_id when Bearer JWT is supplied; return None if anonymous."""
    if not credentials or not credentials.credentials:
        return None
    try:
        return decode_jwt_token(credentials.credentials)
    except Exception:
        return None
