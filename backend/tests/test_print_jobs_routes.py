"""Tests der Druckhistorie-Endpunkte."""

from __future__ import annotations

from httpx import AsyncClient
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.enums import PrintJobStatus
from app.models.print_job import PrintJob


async def test_leere_historie(client: AsyncClient) -> None:
    response = await client.get("/api/print-jobs")
    assert response.status_code == 200
    assert response.json() == []


async def test_historie_zeigt_angelegten_auftrag(
    client: AsyncClient, session: AsyncSession
) -> None:
    session.add(
        PrintJob(
            spoolman_spool_id=7,
            status=PrintJobStatus.COMPLETED,
            copies=1,
        )
    )
    await session.commit()

    response = await client.get("/api/print-jobs")

    assert response.status_code == 200
    body = response.json()
    assert len(body) == 1
    assert body[0]["spoolman_spool_id"] == 7


async def test_unbekannter_druckauftrag_liefert_404(client: AsyncClient) -> None:
    response = await client.get("/api/print-jobs/999")
    assert response.status_code == 404
