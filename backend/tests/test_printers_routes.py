"""Tests der Drucker-CRUD-Endpunkte."""

from __future__ import annotations

from unittest.mock import AsyncMock

import pytest
from httpx import AsyncClient

from app.schemas.health import ComponentStatus


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {"name": "Werkstattdrucker", "queue_name": "M110S"}
    payload.update(overrides)
    return payload


async def test_drucker_anlegen_und_lesen(client: AsyncClient) -> None:
    created = await client.post("/api/printers", json=_payload())
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Werkstattdrucker"
    assert body["queue_name"] == "M110S"
    assert body["label_width_mm"] == 62.0

    fetched = await client.get(f"/api/printers/{body['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == body["id"]


async def test_ungueltiger_warteschlangenname_wird_abgelehnt(client: AsyncClient) -> None:
    response = await client.post("/api/printers", json=_payload(queue_name="mit leerzeichen"))
    assert response.status_code == 422


async def test_doppelter_warteschlangenname_wird_abgelehnt(client: AsyncClient) -> None:
    await client.post("/api/printers", json=_payload(name="Drucker A"))
    response = await client.post("/api/printers", json=_payload(name="Drucker B"))
    assert response.status_code == 422


async def test_nur_ein_drucker_kann_standard_sein(client: AsyncClient) -> None:
    erster = await client.post("/api/printers", json=_payload(queue_name="Q1", is_default=True))
    zweiter = await client.post("/api/printers", json=_payload(queue_name="Q2", is_default=True))
    assert erster.status_code == 201
    assert zweiter.status_code == 201

    erster_neu = await client.get(f"/api/printers/{erster.json()['id']}")
    assert erster_neu.json()["is_default"] is False
    assert zweiter.json()["is_default"] is True


async def test_patch_setzt_nur_uebergebene_felder(client: AsyncClient) -> None:
    created = await client.post("/api/printers", json=_payload())
    printer_id = created.json()["id"]

    patched = await client.patch(f"/api/printers/{printer_id}", json={"location": "Werkstatt"})

    assert patched.status_code == 200
    body = patched.json()
    assert body["location"] == "Werkstatt"
    assert body["queue_name"] == "M110S"  # unveraendert


async def test_loeschen_entfernt_den_drucker(client: AsyncClient) -> None:
    created = await client.post("/api/printers", json=_payload())
    printer_id = created.json()["id"]

    deleted = await client.delete(f"/api/printers/{printer_id}")
    assert deleted.status_code == 204

    missing = await client.get(f"/api/printers/{printer_id}")
    assert missing.status_code == 404


async def test_unbekannter_drucker_liefert_404(client: AsyncClient) -> None:
    response = await client.get("/api/printers/999")
    assert response.status_code == 404


async def test_testverbindung_ohne_cups_meldet_deaktiviert(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr("app.services.printing.cups_client.CUPS_AVAILABLE", False)
    created = await client.post("/api/printers", json=_payload())
    printer_id = created.json()["id"]

    response = await client.post(f"/api/printers/{printer_id}/test")

    assert response.status_code == 200
    assert response.json()["status"] == ComponentStatus.DISABLED.value


async def test_discover_liefert_gefundene_warteschlangen(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.services.printing.cups_client import DiscoveredQueue

    discover = AsyncMock(
        return_value=[
            DiscoveredQueue(
                queue_name="M110S", model="Phomemo M110S", location=None, supported=True
            )
        ]
    )
    monkeypatch.setattr("app.api.routes.printers.discover_queues", discover)

    response = await client.get("/api/printers/discover")

    assert response.status_code == 200
    body = response.json()
    assert body == [
        {"queue_name": "M110S", "model": "Phomemo M110S", "location": None, "supported": True}
    ]
    discover.assert_awaited_once()


async def test_testverbindung_meldet_erfolg(
    client: AsyncClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    probe = AsyncMock(return_value=(ComponentStatus.OK, None))
    monkeypatch.setattr("app.api.routes.printers.probe_printer", probe)
    created = await client.post("/api/printers", json=_payload())
    printer_id = created.json()["id"]

    response = await client.post(f"/api/printers/{printer_id}/test")

    assert response.status_code == 200
    assert response.json()["status"] == ComponentStatus.OK.value
    probe.assert_awaited_once()
