"""
Server-Side Broker Credential Resolver & AES-256-GCM Token Crypto.

Compatibility & Security:
- Uses identical AES-256-GCM derivation (`sha256(TOKEN_ENCRYPTION_SECRET)`) and
  `${ivHex}:${authTagHex}:${cipherHex}` format as `frontend/lib/security/crypto.ts`.
- Never reads tokens from request query params or logs plaintext tokens.
- Resolves encrypted broker connections strictly by verified `user_id` from DB.
"""

from dataclasses import dataclass
from datetime import datetime, timezone
import hashlib
import logging
import os
from typing import Optional

from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from sqlalchemy import text
from sqlalchemy.orm import Session

from config import get_settings

logger = logging.getLogger("services.broker")


@dataclass
class UserKiteCredentials:
    user_id: str
    api_key: str
    access_token: str
    expires_at: Optional[datetime]
    status: str


def _derive_aes_key(secret: Optional[str] = None) -> bytes:
    cfg = get_settings()
    sec = (secret or cfg.token_encryption_secret or "").strip()
    if not sec:
        raise ValueError("TOKEN_ENCRYPTION_SECRET is required to decrypt/encrypt broker tokens.")
    return hashlib.sha256(sec.encode("utf-8")).digest()


def encrypt_broker_token(plaintext: str, secret: Optional[str] = None) -> str:
    """Encrypt plaintext token in AES-256-GCM matching Node crypto format."""
    if not plaintext:
        return ""
    key = _derive_aes_key(secret)
    iv = os.urandom(12)
    aesgcm = AESGCM(key)
    ct_and_tag = aesgcm.encrypt(iv, plaintext.encode("utf-8"), None)
    ciphertext, tag = ct_and_tag[:-16], ct_and_tag[-16:]
    return f"{iv.hex()}:{tag.hex()}:{ciphertext.hex()}"


def decrypt_broker_token(encrypted_text: str, secret: Optional[str] = None) -> str:
    """Decrypt AES-256-GCM `${ivHex}:${authTagHex}:${cipherHex}` broker token."""
    if not encrypted_text:
        return ""
    parts = encrypted_text.strip().split(":")
    if len(parts) != 3:
        return ""
    try:
        key = _derive_aes_key(secret)
        iv = bytes.fromhex(parts[0])
        tag = bytes.fromhex(parts[1])
        ciphertext = bytes.fromhex(parts[2])
        aesgcm = AESGCM(key)
        plain_bytes = aesgcm.decrypt(iv, ciphertext + tag, None)
        return plain_bytes.decode("utf-8")
    except Exception:
        logger.warning("Broker token decryption failed (key mismatch or corrupt ciphertext).")
        return ""


def resolve_user_kite_credentials(
    user_id: str,
    db: Session,
) -> Optional[UserKiteCredentials]:
    """
    Resolve active server-side Kite credentials for `user_id` from `"BrokerConnection"`.
    Returns None cleanly if disconnected, expired, missing encryption secret, or table absent.
    """
    cfg = get_settings()
    api_key = (cfg.zerodha_api_key or "").strip()
    if not api_key or not cfg.token_encryption_secret:
        return None

    try:
        row = db.execute(
            text(
                'SELECT access_token, token_expires_at, status '
                'FROM "BrokerConnection" '
                "WHERE user_id = :uid AND broker = 'KITE' "
                'ORDER BY connected_at DESC LIMIT 1'
            ),
            {"uid": str(user_id)},
        ).fetchone()
    except Exception:
        # Table may not exist yet on fresh SQLite backend-only unit test DBs
        return None

    if not row:
        return None

    encrypted_token, expires_at, conn_status = row[0], row[1], row[2]
    if str(conn_status or "").upper() not in ("CONNECTED", "ACTIVE"):
        return None

    if expires_at is not None:
        exp_dt = expires_at
        if isinstance(exp_dt, str):
            try:
                exp_dt = datetime.fromisoformat(exp_dt.replace("Z", "+00:00"))
            except ValueError:
                exp_dt = None
        if isinstance(exp_dt, datetime):
            if exp_dt.tzinfo is None:
                exp_dt = exp_dt.replace(tzinfo=timezone.utc)
            if exp_dt < datetime.now(timezone.utc):
                return None

    access_token = decrypt_broker_token(str(encrypted_token), secret=cfg.token_encryption_secret)
    if not access_token:
        return None

    return UserKiteCredentials(
        user_id=str(user_id),
        api_key=api_key,
        access_token=access_token,
        expires_at=expires_at if isinstance(expires_at, datetime) else None,
        status=str(conn_status),
    )


def mark_user_kite_token_expired(user_id: str, db: Session) -> None:
    """Persist TOKEN_EXPIRED state when Kite rejects an authenticated session."""
    try:
        db.execute(
            text(
                'UPDATE "BrokerConnection" '
                "SET status = 'EXPIRED' "
                "WHERE user_id = :uid AND broker = 'KITE'"
            ),
            {"uid": str(user_id)},
        )
        db.commit()
    except Exception:
        db.rollback()

