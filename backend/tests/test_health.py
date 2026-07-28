"""Tests des Healthchecks.

Kernaussage: Eine gestoerte externe Abhaengigkeit darf die Kernanwendung nicht
ungesund machen. Sonst wuerde ein ausgeschalteter Drucker einen Neustart des
Containers ausloesen.
"""

from __future__ import annotations

import httpx
import pytest
import respx
from httpx import AsyncClient

from app.schemas.health import ComponentStatus


@pytest.fixture(autouse=True)
def _cups_nicht_verfuegbar(monkeypatch: pytest.MonkeyPatch) -> None:
    """In der Testumgebung ist kein CUPS installiert."""
    monkeypatch.setattr("app.services.printing.cups_probe.CUPS_AVAILABLE", False)


@respx.mock
async def test_health_meldet_ok_wenn_spoolman_antwortet(client: AsyncClient) -> None:
    respx.get("http://spoolman:8000/api/v1/info").mock(
        return_value=httpx.Response(200, json={"version": "0.25.0"})
    )

    antwort = await client.get("/api/health")

    assert antwort.status_code == 200
    body = antwort.json()
    assert body["status"] == ComponentStatus.OK
    assert body["database"] == ComponentStatus.OK
    assert body["spoolman"] == ComponentStatus.OK
    assert body["version"]


@respx.mock
async def test_nicht_erreichbares_spoolman_macht_app_nicht_ungesund(client: AsyncClient) -> None:
    """Das ist die zentrale Zusicherung des Healthchecks."""
    respx.get("http://spoolman:8000/api/v1/info").mock(
        side_effect=httpx.ConnectError("keine Verbindung")
    )

    antwort = await client.get("/api/health")

    assert antwort.status_code == 200, "Ein gestoertes Spoolman darf keinen Neustart ausloesen"
    body = antwort.json()
    assert body["status"] == ComponentStatus.OK
    assert body["spoolman"] == ComponentStatus.ERROR
    assert body["spoolman_detail"]


@respx.mock
async def test_zeitueberschreitung_wird_als_solche_gemeldet(client: AsyncClient) -> None:
    respx.get("http://spoolman:8000/api/v1/info").mock(
        side_effect=httpx.TimeoutException("zu langsam")
    )

    body = (await client.get("/api/health")).json()

    assert body["spoolman"] == ComponentStatus.ERROR
    assert "Zeit" in body["spoolman_detail"]


@respx.mock
async def test_serverfehler_von_spoolman_gilt_als_beeintraechtigt(client: AsyncClient) -> None:
    respx.get("http://spoolman:8000/api/v1/info").mock(return_value=httpx.Response(500))

    body = (await client.get("/api/health")).json()

    assert body["spoolman"] == ComponentStatus.DEGRADED


@respx.mock
async def test_fehlendes_cups_gilt_als_deaktiviert_nicht_als_fehler(client: AsyncClient) -> None:
    """Ohne installiertes pycups ist CUPS nicht kaputt, sondern nicht vorhanden."""
    respx.get("http://spoolman:8000/api/v1/info").mock(return_value=httpx.Response(200, json={}))

    body = (await client.get("/api/health")).json()

    assert body["cups"] == ComponentStatus.DISABLED
    assert body["status"] == ComponentStatus.OK


@respx.mock
async def test_health_gibt_keine_geheimnisse_preis(client: AsyncClient) -> None:
    respx.get("http://spoolman:8000/api/v1/info").mock(return_value=httpx.Response(200, json={}))

    rohtext = (await client.get("/api/health")).text

    for verdaechtig in ("password", "token", "secret"):
        assert verdaechtig not in rohtext.lower()


async def test_version_endpunkt(client: AsyncClient) -> None:
    antwort = await client.get("/api/version")

    assert antwort.status_code == 200
    assert antwort.json()["version"]
