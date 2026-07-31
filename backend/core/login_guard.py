"""In-memory + Mongo-backed brute-force protection for /auth/login.

Uses a dedicated collection `login_attempts` with TTL so entries auto-expire.
Not a replacement for a real WAF, but stops trivial credential stuffing.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from core.config import LOGIN_LOCKOUT_MINUTES, LOGIN_MAX_FAILS


def _now() -> datetime:
    return datetime.now(timezone.utc)


async def register_failed_login(db, key: str) -> int:
    """Increment counter, return current fail count within the window."""
    expires_at = _now() + timedelta(minutes=LOGIN_LOCKOUT_MINUTES)
    res = await db.login_attempts.find_one_and_update(
        {"key": key},
        {
            "$inc": {"count": 1},
            "$setOnInsert": {"created_at": _now()},
            "$set": {"expires_at": expires_at},
        },
        upsert=True,
        return_document=True,
    )
    return int((res or {}).get("count", 1))


async def clear_login_attempts(db, key: str) -> None:
    await db.login_attempts.delete_one({"key": key})


async def is_locked_out(db, key: str) -> bool:
    doc = await db.login_attempts.find_one({"key": key})
    if not doc:
        return False
    expires_at = doc.get("expires_at")
    if isinstance(expires_at, datetime) and expires_at.tzinfo is None:
        expires_at = expires_at.replace(tzinfo=timezone.utc)
    if isinstance(expires_at, datetime) and expires_at < _now():
        await db.login_attempts.delete_one({"key": key})
        return False
    return int(doc.get("count", 0)) >= LOGIN_MAX_FAILS
