from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        #
        # Prevent MIME sniffing
        #
        response.headers["X-Content-Type-Options"] = "nosniff"

        #
        # Control what referrer information browsers send
        #
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        #
        # Disable browser features Huni doesn't use
        #
        response.headers["Permissions-Policy"] = (
            "camera=(), "
            "microphone=(), "
            "geolocation=(), "
            "payment=(), "
            "usb=(), "
            "accelerometer=(), "
            "gyroscope=()"
        )

        #
        # Tell browsers not to cache API responses
        #
        response.headers["Cache-Control"] = "no-store"

        #
        # Remove server identification if present
        #
        response.headers.pop("Server", None)

        #
        # Enable ONLY after HTTPS is working
        #
        # response.headers["Strict-Transport-Security"] = (
        #     "max-age=31536000; includeSubDomains; preload"
        # )

        return response