"""FastAPI application: logging, middleware, error handlers and router wiring."""

from __future__ import annotations

import logging
from typing import Any

from fastapi import FastAPI, Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi.errors import RateLimitExceeded
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.types import ASGIApp, Message, Receive, Scope, Send

from app.config import settings
from app.exceptions import AppError
from app.rate_limit import limiter
from app.routers import (
    appointments,
    auth,
    billing,
    business,
    customers,
    health,
    public,
    services,
    stats,
    working_hours,
)

API_PREFIX = "/api/v1"

logger = logging.getLogger("app")

_HTTP_ERROR_CODES: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "VALIDATION_ERROR",
    429: "RATE_LIMITED",
    503: "SERVICE_UNAVAILABLE",
}


def configure_logging() -> None:
    """Configure root logging once, honouring ``settings.LOG_LEVEL``."""
    level = getattr(logging, settings.LOG_LEVEL.upper(), logging.INFO)
    logging.basicConfig(
        level=level,
        format="%(asctime)s %(levelname)s [%(name)s] %(message)s",
    )
    logging.getLogger("app").setLevel(level)


class SecurityHeadersMiddleware:
    """Pure ASGI middleware adding conservative security headers to every HTTP response."""

    def __init__(self, app: ASGIApp, *, hsts: bool = False) -> None:
        self.app = app
        self.headers: list[tuple[bytes, bytes]] = [
            (b"x-content-type-options", b"nosniff"),
            (b"x-frame-options", b"DENY"),
            (b"referrer-policy", b"strict-origin-when-cross-origin"),
        ]
        if hsts:
            self.headers.append((b"strict-transport-security", b"max-age=31536000; includeSubDomains"))

    async def __call__(self, scope: Scope, receive: Receive, send: Send) -> None:
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message: Message) -> None:
            if message["type"] == "http.response.start":
                existing = {name.lower() for name, _ in message.get("headers", [])}
                extra = [(k, v) for k, v in self.headers if k not in existing]
                message["headers"] = list(message.get("headers", [])) + extra
            await send(message)

        await self.app(scope, receive, send_with_headers)


def _error_body(code: str, message: str, details: list[Any] | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"error": code, "message": message}
    if details:
        body["details"] = details
    return body


def _format_validation_errors(errors: Any) -> list[dict[str, str]]:
    """Turn Pydantic/FastAPI errors into ``[{"field": "body.email", "message": "..."}]``."""
    details: list[dict[str, str]] = []
    for err in errors:
        loc = err.get("loc", ())
        field = ".".join(str(part) for part in loc) or "request"
        message = str(err.get("msg", "Invalid value."))
        # ValueError raised inside validators is reported as "Value error, <msg>".
        if message.startswith("Value error, "):
            message = message[len("Value error, ") :]
        details.append({"field": field, "message": message})
    return details


async def app_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """Render :class:`AppError` subclasses as ``{"error","message","details"?}``."""
    assert isinstance(exc, AppError)
    headers = {"WWW-Authenticate": "Bearer"} if exc.status_code == 401 else None
    return JSONResponse(
        status_code=exc.status_code,
        content=jsonable_encoder(_error_body(exc.code, exc.message, exc.details)),
        headers=headers,
    )


async def validation_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """422 ``VALIDATION_ERROR`` with field-level details."""
    assert isinstance(exc, RequestValidationError)
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder(
            _error_body("VALIDATION_ERROR", "Invalid input.", _format_validation_errors(exc.errors()))
        ),
    )


async def http_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Normalise Starlette/FastAPI ``HTTPException`` (e.g. unknown route 404, 405) to the error shape."""
    assert isinstance(exc, StarletteHTTPException)
    code = _HTTP_ERROR_CODES.get(exc.status_code, "HTTP_ERROR")
    message = exc.detail if isinstance(exc.detail, str) else "Request failed."
    if exc.status_code == 404 and message == "Not Found":
        message = "Not found."
    return JSONResponse(
        status_code=exc.status_code,
        content=_error_body(code, message),
        headers=getattr(exc, "headers", None),
    )


async def rate_limit_handler(request: Request, exc: Exception) -> JSONResponse:
    """429 ``RATE_LIMITED``."""
    return JSONResponse(
        status_code=429,
        content=_error_body("RATE_LIMITED", "Too many requests. Please try again shortly."),
        headers={"Retry-After": "60"},
    )


async def unhandled_error_handler(request: Request, exc: Exception) -> JSONResponse:
    """500 ``INTERNAL_ERROR``; the stack trace is logged, never returned."""
    logger.exception("Unhandled error on %s %s", request.method, request.url.path, exc_info=exc)
    return JSONResponse(
        status_code=500,
        content=_error_body("INTERNAL_ERROR", "Something went wrong."),
    )


def create_app() -> FastAPI:
    """Build the SlotEase FastAPI application."""
    configure_logging()

    application = FastAPI(
        title="SlotEase API",
        version="1.0.0",
        description="Multi-tenant appointment booking API for clinics and salons.",
        docs_url="/docs",
        redoc_url=None,
        openapi_url="/openapi.json",
    )

    # Rate limiting (decorator-based; see app.rate_limit).
    application.state.limiter = limiter

    # Error handlers.
    application.add_exception_handler(AppError, app_error_handler)
    application.add_exception_handler(RequestValidationError, validation_error_handler)
    application.add_exception_handler(StarletteHTTPException, http_exception_handler)
    application.add_exception_handler(RateLimitExceeded, rate_limit_handler)
    application.add_exception_handler(Exception, unhandled_error_handler)

    # Middleware: the last one added is outermost, so CORS wraps everything (incl. error responses).
    application.add_middleware(SecurityHeadersMiddleware, hsts=settings.is_production)
    allow_all = "*" in settings.CORS_ORIGINS
    application.add_middleware(
        CORSMiddleware,
        allow_origins=["*"] if allow_all else settings.CORS_ORIGINS,
        allow_credentials=not allow_all,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
        allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
        max_age=600,
    )

    # Routers.
    for module in (
        health,
        auth,
        business,
        services,
        working_hours,
        public,
        appointments,
        customers,
        stats,
        billing,
    ):
        application.include_router(module.router, prefix=API_PREFIX)

    @application.get("/health", tags=["Health"], summary="Liveness probe")
    def root_health() -> dict[str, str]:
        """Lightweight liveness check used by Docker/Caddy (no DB access)."""
        return {"status": "ok"}

    logger.info("SlotEase API initialised (environment=%s)", settings.ENVIRONMENT)
    return application


app = create_app()
