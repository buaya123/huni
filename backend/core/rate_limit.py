from slowapi import Limiter
from starlette.requests import Request
import jwt
import os

JWT_SECRET = os.environ["JWT_SECRET"]
JWT_ALGORITHM = os.environ["JWT_ALGORITHM"]


def get_rate_limit_key(request: Request) -> str:
    """
    Public endpoints:
        limit by IP.

    Authenticated endpoints:
        limit by user id.
    """

    auth = request.headers.get("Authorization")

    if auth and auth.startswith("Bearer "):
        token = auth[7:]

        try:
            payload = jwt.decode(
                token,
                JWT_SECRET,
                algorithms=[JWT_ALGORITHM],
            )

            user_id = payload.get("sub")

            if user_id:
                return f"user:{user_id}"

        except jwt.PyJWTError:
            pass

    client = request.client

    if client:
        return f"ip:{client.host}"

    return "unknown"


limiter = Limiter(
    key_func=get_rate_limit_key,
    default_limits=["200/minute"],
)