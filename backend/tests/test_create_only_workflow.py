"""Tests fuer Idempotenz und Fehlerspur des Create-only-Workflows."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.models.enums import WorkflowStatus
from app.models.workflow_run import WorkflowRun
from app.services.spoolman import SpoolFields, SpoolmanRecord
from app.services.workflows import CreateOnlyRequest, CreateOnlyService


@pytest.mark.asyncio
async def test_create_only_erzeugt_spulen_und_ist_idempotent(
    session: AsyncSession, settings: Settings
) -> None:
    client = AsyncMock()
    client.create_spool.side_effect = [SpoolmanRecord(id=17), SpoolmanRecord(id=18)]
    request = CreateOnlyRequest(
        idempotency_key="create-only-001",
        filament_id=4,
        spool=SpoolFields(lot_nr="LOT-1"),
        quantity=2,
    )
    service = CreateOnlyService(session, client, settings)

    first = await service.run(request)
    second = await service.run(request)

    assert first.status is WorkflowStatus.COMPLETED
    assert first.created_spool_ids_json == "[17, 18]"
    assert second.id == first.id
    assert client.create_spool.await_count == 2


@pytest.mark.asyncio
async def test_create_only_hinterlegt_fehler_und_bereits_erzeugte_spule(
    session: AsyncSession, settings: Settings
) -> None:
    client = AsyncMock()
    client.create_spool.side_effect = [
        SpoolmanRecord(id=17),
        AppError(ErrorCode.SPOOL_CREATE_FAILED, detail="nicht erreichbar"),
    ]
    request = CreateOnlyRequest(
        idempotency_key="create-only-002",
        filament_id=4,
        spool=SpoolFields(),
        quantity=2,
    )

    run = await CreateOnlyService(session, client, settings).run(request)
    await session.commit()
    persisted = await session.scalar(select(WorkflowRun).where(WorkflowRun.id == run.id))

    assert persisted is not None
    assert persisted.status is WorkflowStatus.FAILED
    assert persisted.created_spool_ids_json == "[17]"
    assert persisted.error_code == ErrorCode.SPOOL_CREATE_FAILED.value
    assert persisted.error_message != "nicht erreichbar"


@pytest.mark.asyncio
async def test_create_only_verwendet_die_ermittelte_filament_id_fuer_jede_spule(
    session: AsyncSession, settings: Settings
) -> None:
    """SpoolFields hat kein eigenes filament_id-Feld mehr (siehe SpoolCreate vs.

    SpoolFields in services/spoolman/client.py). Dieser Test stellt sicher,
    dass der Workflow die tatsächlich aufgelöste ID trotzdem korrekt an jede
    erzeugte Spule weiterreicht.
    """
    client = AsyncMock()
    client.create_spool.side_effect = [SpoolmanRecord(id=101), SpoolmanRecord(id=102)]
    request = CreateOnlyRequest(
        idempotency_key="create-only-003",
        filament_id=42,
        spool=SpoolFields(location="Lager A2"),
        quantity=2,
    )

    await CreateOnlyService(session, client, settings).run(request)

    assert client.create_spool.await_count == 2
    for call in client.create_spool.await_args_list:
        sent_payload = call.args[0]
        assert sent_payload.filament_id == 42
        assert sent_payload.location == "Lager A2"
