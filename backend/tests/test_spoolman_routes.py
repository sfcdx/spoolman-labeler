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
async def test_print_presets_proxy(client: AsyncClient) -> None:
    respx.get("http://spoolman:8000/api/v1/setting/print_presets").mock(
        return_value=httpx.Response(200, json={"value": "[]"})
    )

    response = await client.get("/api/spoolman/print-presets")

    assert response.status_code == 200
    assert response.json() == []
