"""Gemeinsame Test-Fixtures."""

from __future__ import annotations

import os
from collections.abc import AsyncIterator, Iterator
from pathlib import Path

import pytest
from httpx import ASGITransport, AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

from app.core.config import Settings, get_settings
from app.db.base import Base
from app.db.session import get_session
from app.services.templates import ensure_default_template


@pytest.fixture(autouse=True)
def _clean_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    """Isoliert jeden Test von der Umgebung der Entwicklungsmaschine.

    Ohne das wuerde eine lokal gesetzte Variable wie CUPS_SERVER Tests
    unbemerkt beeinflussen.
    """
    for key in list(os.environ):
        if key.startswith(
            ("APP_", "SPOOLMAN_", "CUPS_", "DEFAULT_", "MAX_", "DATABASE_", "RENDER_", "LOG_")
        ):
            monkeypatch.delenv(key, raising=False)
    monkeypatch.setenv("DATA_DIR", str(tmp_path))
    get_settings.cache_clear()


@pytest.fixture
def settings(tmp_path: Path) -> Settings:
    return Settings(
        data_dir=tmp_path,
        static_dir=tmp_path / "static",
        database_url="sqlite+aiosqlite:///:memory:",
        app_env="development",
    )


@pytest.fixture
async def session() -> AsyncIterator[AsyncSession]:
    """Eine Sitzung gegen eine frische In-Memory-Datenbank."""
    engine = create_async_engine("sqlite+aiosqlite:///:memory:")
    async with engine.begin() as connection:
        await connection.run_sync(Base.metadata.create_all)

    factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with factory() as active_session:
        # Spiegelt das Anwendungsverhalten beim Start (siehe app/main.py):
        # die mitgelieferte Standardvorlage existiert immer.
        await ensure_default_template(active_session)
        await active_session.commit()
        yield active_session

    await engine.dispose()


@pytest.fixture
def app_instance(settings: Settings, session: AsyncSession) -> Iterator[object]:
    """Die FastAPI-Anwendung mit ueberschriebenen Abhaengigkeiten."""
    from app.main import create_app

    get_settings.cache_clear()
    application = create_app()
    application.dependency_overrides[get_settings] = lambda: settings
    application.dependency_overrides[get_session] = lambda: session

    yield application

    application.dependency_overrides.clear()
    get_settings.cache_clear()


@pytest.fixture
async def client(app_instance: object) -> AsyncIterator[AsyncClient]:
    transport = ASGITransport(app=app_instance)  # type: ignore[arg-type]
    async with AsyncClient(transport=transport, base_url="http://test") as async_client:
        yield async_client
