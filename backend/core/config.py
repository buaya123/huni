"""Centralised environment/config validation.

Reads .env and validates that required secrets are set to safe values in
production. Raises at import time so a mis-configured deploy fails fast
instead of running with insecure defaults.
"""
from __future__ import annotations

import os
from pathlib import Path

from dotenv import load_dotenv

ROOT_DIR = Path(__file__).resolve().parent.parent
load_dotenv(ROOT_DIR / ".env")

ENVIRONMENT = os.getenv("ENVIRONMENT", "development").lower()
IS_PRODUCTION = ENVIRONMENT == "production"

# ---- required ----
MONGO_URL = os.environ["MONGO_URL"]
DB_NAME = os.environ["DB_NAME"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_DAYS = int(os.getenv("JWT_EXPIRE_DAYS", "30"))

DEBUG = os.getenv("DEBUG", "true").lower() == "true"

# ---- optional ----
GOOGLE_SESSION_DAYS = int(os.getenv("GOOGLE_SESSION_DAYS", "7"))
ADMIN_EMAILS = {
    e.strip().lower()
    for e in os.getenv("ADMIN_EMAILS", "").split(",")
    if e.strip()
}
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "").strip() or None

# ---- CORS + hosts ----
def _parse_csv(name: str) -> list[str]:
    return [x.strip() for x in os.getenv(name, "").split(",") if x.strip()]

CORS_ORIGINS = _parse_csv("CORS_ORIGINS")
if not CORS_ORIGINS and not IS_PRODUCTION:
    # Sensible dev defaults — Expo web, LAN, tunnels
    CORS_ORIGINS = ["*"]

if IS_PRODUCTION:
    TRUSTED_HOSTS = _parse_csv("TRUSTED_HOSTS")
else:
    TRUSTED_HOSTS = _parse_csv("TRUSTED_HOSTS") or ["*"]

if IS_PRODUCTION and not TRUSTED_HOSTS:
    raise RuntimeError(
        "TRUSTED_HOSTS must be configured in production."
    )

if IS_PRODUCTION and MONGO_URL.startswith("mongodb://"):
    raise RuntimeError(
        "Use mongodb+srv:// in production."
    )

# ---- dev toggles ----
ENABLE_DEV_SEED = os.getenv("ENABLE_DEV_SEED", "false").lower() == "true"
ENABLE_DOCS = os.getenv("ENABLE_DOCS", "false" if IS_PRODUCTION else "true").lower() == "true"

# ---- upload limits ----
MAX_IMAGE_BYTES = int(os.getenv("MAX_IMAGE_BYTES", str(20 * 1024 * 1024)))

# ---- auth policy ----
MIN_PASSWORD_LENGTH = int(os.getenv("MIN_PASSWORD_LENGTH", "8"))
MIN_SIGNUP_AGE = int(os.getenv("MIN_SIGNUP_AGE", "13"))
LOGIN_MAX_FAILS = int(os.getenv("LOGIN_MAX_FAILS", "5"))
LOGIN_LOCKOUT_MINUTES = int(os.getenv("LOGIN_LOCKOUT_MINUTES", "15"))

# ---- validation ----
_INSECURE_JWT_DEFAULTS = {
    "change_me",
    "secret",
    "huni_jwt_secret_change_me_in_prod_2026",
}

if IS_PRODUCTION and DEBUG:
    raise RuntimeError(
        "DEBUG must be False in production."
    )

def validate_config() -> None:
    """Fail fast on insecure production configuration."""
    if not JWT_SECRET or JWT_SECRET.strip().lower() in _INSECURE_JWT_DEFAULTS:
        if IS_PRODUCTION:
            raise RuntimeError(
                "JWT_SECRET is missing or set to a well-known default. "
                "Rotate it before running in production."
            )
    if len(JWT_SECRET) < 32 and IS_PRODUCTION:
        raise RuntimeError(
            "JWT_SECRET must be at least 32 characters in production."
        )
    if IS_PRODUCTION and not CORS_ORIGINS:
        raise RuntimeError(
            "CORS_ORIGINS must be explicitly set in production."
        )
    if IS_PRODUCTION and ENABLE_DEV_SEED:
        raise RuntimeError(
            "ENABLE_DEV_SEED must not be true in production."
        )


validate_config()
