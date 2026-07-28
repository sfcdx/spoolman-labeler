"""Datenbankverbindung und Sitzungsverwaltung."""

from __future__ import annotations

from collections.abc import AsyncIterator
from typing import Any

from sqlalchemy import event, text
from sqlalchemy.engine.interfaces import DBAPIConnection
from sqlalchemy.ext.asyncio import (
    AsyncEngine,
    AsyncSession,
    async_sessionmaker,
    create_async_engine,
)
from sqlalchemy.pool import ConnectionPoolEntry

from app.core.config import Settings

_engine: AsyncEngine | None = None
_session_factory: async_sessionmaker[AsyncSession] | None = None


def _configure_sqlite(dbapi_connection: DBAPIConnection, _record: ConnectionPoolEntry) -> None:
    """Setzt SQLite-Pragmas fuer Haltbarkeit und Nebenlaeufigkeit.

    ``WAL`` erlaubt gleichzeitiges Lesen waehrend geschrieben wird — wichtig,
    weil die Statusabfrage von Druckauftraegen parallel zum Workflow laeuft.
    ``foreign_keys`` ist in SQLite standardmaessig aus.
    """
    cursor = dbapi_connection.cursor()
    try:
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=5000")
    finally:
        cursor.close()


def create_engine(settings: Settings) -> AsyncEngine:
    """Erzeugt die Engine passend zum konfigurierten Datenbanktreiber."""
    is_sqlite = settings.database_url.startswith("sqlite")

    kwargs: dict[str, Any] = {
        "echo": False,
        "future": True,
        "pool_pre_ping": True,
    }
    if not is_sqlite:
        # Fuer PostgreSQL spaeter sinnvoll; SQLite kennt diese Optionen nicht.
        kwargs["pool_size"] = 5
        kwargs["max_overflow"] = 10

    engine = create_async_engine(settings.database_url, **kwargs)

    if is_sqlite:
        event.listen(engine.sync_engine, "connect", _configure_sqlite)

    return engine


def init_engine(settings: Settings) -> AsyncEngine:
    """Initialisiert Engine und Sitzungsfabrik einmalig."""
    global _engine, _session_factory
    if _engine is None:
        _engine = create_engine(settings)
        _session_factory = async_sessionmaker(
            _engine,
            class_=AsyncSession,
            expire_on_commit=False,
            autoflush=False,
        )
    return _engine


async def dispose_engine() -> None:
    """Schliesst alle Verbindungen beim Herunterfahren."""
    global _engine, _session_factory
    if _engine is not None:
        await _engine.dispose()
    _engine = None
    _session_factory = None


def get_session_factory() -> async_sessionmaker[AsyncSession]:
    if _session_factory is None:
        msg = "Datenbank wurde nicht initialisiert. init_engine() zuerst aufrufen."
        raise RuntimeError(msg)
    return _session_factory


async def get_session() -> AsyncIterator[AsyncSession]:
    """FastAPI-Abhaengigkeit, die eine Sitzung je Anfrage bereitstellt."""
    factory = get_session_factory()
    async with factory() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise


async def check_database(session: AsyncSession) -> bool:
    """Einfache Erreichbarkeitspruefung fuer den Healthcheck."""
    try:
        await session.execute(text("SELECT 1"))
    except Exception:
        return False
    return True
