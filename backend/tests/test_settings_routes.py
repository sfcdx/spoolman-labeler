"""Tests der ueberschreibbaren Laufzeit-Einstellungen."""

from __future__ import annotations

from httpx import AsyncClient


async def test_ohne_override_liefert_env_vorgaben(client: AsyncClient) -> None:
    response = await client.get("/api/settings")

    assert response.status_code == 200
    body = response.json()
    assert body["spoolman_public_url"] == "http://localhost:7912"
    assert body["spoolman_public_url_overridden"] is False
    assert body["cups_server"] == "cups"
    assert body["cups_server_overridden"] is False


async def test_spoolman_url_setzen_und_lesen(client: AsyncClient) -> None:
    updated = await client.put(
        "/api/settings", json={"spoolman_public_url": "http://spoolman.local:7912/"}
    )

    assert updated.status_code == 200
    body = updated.json()
    assert body["spoolman_public_url"] == "http://spoolman.local:7912"
    assert body["spoolman_public_url_overridden"] is True

    fetched = await client.get("/api/settings")
    assert fetched.json()["spoolman_public_url"] == "http://spoolman.local:7912"


async def test_ungueltige_url_wird_abgelehnt(client: AsyncClient) -> None:
    response = await client.put("/api/settings", json={"spoolman_public_url": "spoolman.local"})

    assert response.status_code == 422


async def test_cups_server_und_port_setzen(client: AsyncClient) -> None:
    response = await client.put(
        "/api/settings", json={"cups_server": "printserver.local", "cups_port": 6310}
    )

    assert response.status_code == 200
    body = response.json()
    assert body["cups_server"] == "printserver.local"
    assert body["cups_server_overridden"] is True
    assert body["cups_port"] == 6310
    assert body["cups_port_overridden"] is True


async def test_override_kann_wieder_geloescht_werden(client: AsyncClient) -> None:
    await client.put("/api/settings", json={"cups_server": "printserver.local"})

    cleared = await client.delete("/api/settings/cups_server")

    assert cleared.status_code == 200
    body = cleared.json()
    assert body["cups_server"] == "cups"
    assert body["cups_server_overridden"] is False


async def test_teilweises_update_laesst_andere_werte_unveraendert(client: AsyncClient) -> None:
    await client.put("/api/settings", json={"cups_server": "printserver.local"})

    response = await client.put("/api/settings", json={"cups_port": 6310})

    assert response.status_code == 200
    body = response.json()
    assert body["cups_server"] == "printserver.local"
    assert body["cups_port"] == 6310
