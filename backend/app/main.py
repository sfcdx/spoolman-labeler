"""Einstiegspunkt der FastAPI-Anwendung."""

from __future__ import annotations

from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException
from starlette.responses import Response
from starlette.types import Scope

from app import __version__
from app.api.router import api_router
from app.core.config import Settings, get_settings
from app.core.errors import USER_MESSAGES, AppError, ErrorCode
from app.core.logging import configure_logging, get_logger
from app.db.session import dispose_engine, init_engine

logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncIterator[None]:
    """Startet und beendet die Anwendung geordnet."""
    settings: Settings = get_settings()
    configure_logging(settings.log_level, human_readable=settings.is_development)

    settings.ensure_directories()
    init_engine(settings)

    logger.info(
        "application_started",
        extra={
            "version": __version__,
            "port": settings.app_port,
            "env": settings.app_env,
            "spoolman_api_url": settings.spoolman_api_url,
            "cups_server": settings.cups_server,
        },
    )

    try:
        yield
    finally:
        await dispose_engine()
        logger.info("application_stopped")


def _register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppError)
    async def handle_app_error(_request: Request, exc: AppError) -> JSONResponse:
        logger.warning(
            "app_error",
            extra={"code": exc.code.value, "detail": exc.detail, **exc.context},
        )
        return JSONResponse(status_code=exc.status_code, content=exc.to_response())

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        _request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        """Uebersetzt FastAPI-Validierungsfehler in unser Fehlerformat."""
        return JSONResponse(
            status_code=422,
            content={
                "error": {
                    "code": ErrorCode.VALIDATION_FAILED.value,
                    "message": USER_MESSAGES[ErrorCode.VALIDATION_FAILED],
                    "fields": [
                        {"field": ".".join(str(p) for p in err["loc"][1:]), "message": err["msg"]}
                        for err in exc.errors()
                    ],
                }
            },
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(_request: Request, exc: Exception) -> JSONResponse:
        # Die Ausnahme wird vollstaendig geloggt, aber niemals an den Client
        # gegeben — sie koennte interne Pfade oder Adressen enthalten.
        logger.exception("unhandled_exception", extra={"error": type(exc).__name__})
        return JSONResponse(
            status_code=500,
            content={
                "error": {
                    "code": ErrorCode.INTERNAL_ERROR.value,
                    "message": USER_MESSAGES[ErrorCode.INTERNAL_ERROR],
                }
            },
        )


class SpaStaticFiles(StaticFiles):
    """Statische Auslieferung mit Rueckfall auf ``index.html``.

    Damit funktioniert das clientseitige Routing auch dann, wenn der Browser
    eine Unterseite direkt anfordert oder neu laedt.

    Die Ableitung von ``StaticFiles`` ist der Umweg ueber eine eigene
    Catch-all-Route deshalb vorzuziehen, weil Starlette den Dateizugriff in
    einem Worker-Thread ausfuehrt und den Pfad selbst gegen Ausbrueche aus dem
    Verzeichnis absichert.
    """

    async def get_response(self, path: str, scope: Scope) -> Response:
        try:
            return await super().get_response(path, scope)
        except StarletteHTTPException as exc:
            if exc.status_code == 404:
                return await super().get_response("index.html", scope)
            raise


def _mount_frontend(app: FastAPI, static_dir: Path) -> None:
    """Serviert das gebaute Frontend, falls vorhanden.

    Wird zuletzt eingehaengt, damit die API-Routen unter ``/api`` Vorrang
    haben.
    """
    if not static_dir.is_dir():
        # Im Entwicklungsbetrieb liefert Vite das Frontend selbst aus.
        logger.warning("frontend_not_found", extra={"path": str(static_dir)})
        return

    app.mount("/", SpaStaticFiles(directory=static_dir, html=True), name="frontend")


def create_app() -> FastAPI:
    """Baut die Anwendung zusammen."""
    settings = get_settings()

    app = FastAPI(
        title="Spoolman Labeler",
        description=(
            "Filamentrollen in Spoolman erfassen und in einem Schritt über CUPS etikettieren."
        ),
        version=__version__,
        lifespan=lifespan,
        docs_url="/api/docs" if settings.is_development else None,
        redoc_url=None,
        openapi_url="/api/openapi.json" if settings.is_development else None,
    )

    _register_exception_handlers(app)
    app.include_router(api_router)
    _mount_frontend(app, settings.static_dir)

    return app


app = create_app()
