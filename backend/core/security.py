from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

from core.config import IS_PRODUCTION


# Endpoints where the browser SHOULD cache the response body — never
# override their own Cache-Control headers with "no-store".
_CACHEABLE_PREFIXES = (
    "/api/images/",
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Prevent MIME sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Deny framing to defeat clickjacking (belt & braces — CSP is preferred)
        response.headers["X-Frame-Options"] = "DENY"

        # Control what referrer information browsers send
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Disable browser features the API never uses
        response.headers["Permissions-Policy"] = (
            "camera=(), microphone=(), geolocation=(), payment=(), "
            "usb=(), accelerometer=(), gyroscope=()"
        )

        # Cross-Origin isolation — safe default for a JSON API
        response.headers["Cross-Origin-Resource-Policy"] = "cross-origin"
        response.headers["Cross-Origin-Opener-Policy"] = "same-origin"

        # Only stamp Cache-Control on endpoints that didn't set their own
        # and are not explicitly cacheable (like /api/images/*).
        path = request.url.path
        if not any(path.startswith(prefix) for prefix in _CACHEABLE_PREFIXES):
            response.headers.setdefault("Cache-Control", "no-store")

        # Enable HSTS when running behind HTTPS in production
        if IS_PRODUCTION:
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )

        # Remove server identification if present
        try:
            del response.headers["Server"]
        except KeyError:
            pass

        return response
