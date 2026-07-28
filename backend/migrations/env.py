"""Alembic-Umgebung.

Die Datenbank-URL kommt aus der Anwendungskonfiguration, damit es nur eine
Quelle der Wahrheit gibt und keine Zugangsdaten in einer versionierten Datei
stehen.
"""

from __future__ import annotations

import asyncio
from logging.config import fileConfig

from alembic import context
from sqlalchemy.engine import Connection

# Der Import registriert alle Modelle in Base.metadata. Ohne ihn erzeugt
# die Autogenerierung leere Migrationen.
import app.models  # noqa: F401
from app.core.config import get_settings
from app.db.base import Base

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def _database_url() -> str:
    return get_settings().database_url


def run_migrations_offline() -> None:
    """Erzeugt SQL, ohne eine Verbindung aufzubauen."""
    context.configure(
        url=_database_url(),
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        # Noetig, damit SQLite Spaltenaenderungen ueber Hilfstabellen abbilden kann.
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


def _do_run_migrations(connection: Connection) -> None:
    context.configure(
        connection=connection,
        target_metadata=target_metadata,
        render_as_batch=True,
        compare_type=True,
    )
    with context.begin_transaction():
        context.run_migrations()


async def _run_async_migrations() -> None:
    from app.db.session import create_engine

    engine = create_engine(get_settings())
    try:
        async with engine.connect() as connection:
            await connection.run_sync(_do_run_migrations)
    finally:
        await engine.dispose()


def run_migrations_online() -> None:
    asyncio.run(_run_async_migrations())


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
