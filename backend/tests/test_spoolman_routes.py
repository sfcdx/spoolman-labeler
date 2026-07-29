from __future__ import annotations

import httpx
import respx
from httpx import AsyncClient


@respx.mock
async def test_filaments_proxy(client: AsyncClient) -> None:
    route = respx.get("http://spoolman:8000/api/v1/filament").mock(
        return_value=httpx.Response(200, json=[{"id": 8}])
    )
    response = await client.get("/api/spoolman/filaments", params={"name": "ABS"})
    assert response.status_code == 200
    assert response.json() == [{"id": 8}]
    assert route.calls[0].request.url.params["name"] == "ABS"


@respx.mock
async def test_search_spools_proxy(client: AsyncClient) -> None:
    respx.get(
        "http://spoolman:8000/api/v1/spool",
        params={"limit": "50", "sort": "filament.vendor.name:asc,filament.name:asc"},
    ).mock(return_value=httpx.Response(200, json=[{"id": 3}]))

    response = await client.get("/api/spoolman/spools/search")

    assert response.status_code == 200
    assert response.json() == [{"id": 3}]


@respx.mock
async def test_print_presets_proxy(client: AsyncClient) -> None:
    respx.get("http://spoolman:8000/api/v1/setting/print_presets").mock(
        return_value=httpx.Response(200, json={"value": "[]"})
    )

    response = await client.get("/api/spoolman/print-presets")

    assert response.status_code == 200
    assert response.json() == []
