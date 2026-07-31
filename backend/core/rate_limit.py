from slowapi import Limiter
from starlette.requests import Request
import jwt

from core.config import JWT_ALGORITHM, JWT_SECRET


def get_rate_limit_key(request: Request) -> str:
    """Per-user limits when authenticated, per-IP for public endpoints."""

    auth = request.headers.get("Authorization")

    if auth and auth.lower().startswith("bearer "):
        token = auth[7:].strip()
        try:
            payload = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=[JWT_ALGORITHM],
                options={"verify_exp": False},  # limit even for expired tokens
            )
            user_id = payload.get("sub")
            if user_id:
                return f"user:{user_id}"
        except jwt.PyJWTError:
            pass

    # Respect X-Forwarded-For (single-proxy) — safe because ingress terminates.
    xff = request.headers.get("X-Forwarded-For")
    if xff:
        return f"ip:{xff.split(',')[0].strip()}"

    client = request.client
    if client:
        return f"ip:{client.host}"

    return "unknown"


limiter = Limiter(
    key_func=get_rate_limit_key,
    default_limits=["600/minute"],
)
