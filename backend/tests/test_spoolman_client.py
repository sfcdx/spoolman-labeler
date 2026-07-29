from __future__ import annotations

import json

import httpx
import pytest
import respx

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode
from app.services.spoolman import FilamentCreate, SpoolCreate, SpoolmanClient, VendorCreate


@respx.mock
async def test_create_kodiert_extra_und_farben() -> None:
    route = respx.post("http://spoolman:8000/api/v1/filament").mock(
        return_value=httpx.Response(200, json={"id": 9})
    )
    result = await SpoolmanClient(Settings()).create_filament(
        FilamentCreate(density=1.2, diameter=1.75, color_hex="#112233", extra={"name": "ABS"})
    )
    assert result.id == 9
    assert json.loads(route.calls[0].request.content) == {
        "density": 1.2,
        "diameter": 1.75,
        "color_hex": "112233",
        "extra": {"name": '"ABS"'},
    }


@respx.mock
async def test_create_spool_und_vendor() -> None:
    respx.post("http://spoolman:8000/api/v1/vendor").mock(
        return_value=httpx.Response(200, json={"id": 1})
    )
    respx.post("http://spoolman:8000/api/v1/spool").mock(
        return_value=httpx.Response(200, json={"id": 2})
    )
    client = SpoolmanClient(Settings())
    assert (await client.create_vendor(VendorCreate(name="Test"))).id == 1
    assert (await client.create_spool(SpoolCreate(filament_id=1))).id == 2


@respx.mock
async def test_spoolman_fehler_wird_gemappt() -> None:
    respx.post("http://spoolman:8000/api/v1/spool").mock(
        return_value=httpx.Response(400, json={"message": "ungültig"})
    )
    with pytest.raises(AppError) as raised:
        await SpoolmanClient(Settings()).create_spool(SpoolCreate(filament_id=1))
    assert raised.value.code is ErrorCode.SPOOLMAN_VALIDATION_FAILED


@respx.mock
async def test_print_presets_entpackt_den_json_setting_wert() -> None:
    respx.get("http://spoolman:8000/api/v1/setting/print_presets").mock(
        return_value=httpx.Response(
            200,
            json={"value": '[{"id":"preset-1","template":"{id}","labelSettings":{}}]'},
        )
    )

    presets = await SpoolmanClient(Settings()).print_presets()

    assert presets == [{"id": "preset-1", "template": "{id}", "labelSettings": {}}]


@respx.mock
async def test_vendors_und_filaments_senden_limit_und_saubere_namensfilter() -> None:
    vendor_route = respx.get("http://spoolman:8000/api/v1/vendor").mock(
        return_value=httpx.Response(200, json=[])
    )
    filament_route = respx.get("http://spoolman:8000/api/v1/filament").mock(
        return_value=httpx.Response(200, json=[])
    )
    client = SpoolmanClient(Settings())

    await client.vendors('ACME, "exact" PLA', limit=10)
    await client.filaments(limit=500)

    assert vendor_route.calls[0].request.url.params["name"] == "ACME  exact PLA"
    assert vendor_route.calls[0].request.url.params["limit"] == "10"
    # limit wird auf MAX_LIST_LIMIT gedeckelt, auch wenn ein groesserer Wert
    # angefragt wird (grosse Filament-Datenbank, siehe Sicherheitsanalyse).
    assert filament_route.calls[0].request.url.params["limit"] == "200"


@respx.mock
async def test_search_spools_ohne_query_listet_unarchivierte_spulen() -> None:
    route = respx.get("http://spoolman:8000/api/v1/spool").mock(
        return_value=httpx.Response(200, json=[{"id": 1}, {"id": 2}])
    )

    results = await SpoolmanClient(Settings()).search_spools()

    assert [record.id for record in results] == [1, 2]
    assert "filament.name" not in route.calls[0].request.url.params
    assert route.calls[0].request.url.params["sort"] == "filament.vendor.name:asc,filament.name:asc"


@respx.mock
async def test_search_spools_mit_query_dedupliziert_treffer() -> None:
    respx.get(
        "http://spoolman:8000/api/v1/spool", params={"filament.name": "PLA", "limit": "50"}
    ).mock(return_value=httpx.Response(200, json=[{"id": 1}, {"id": 2}]))
    respx.get(
        "http://spoolman:8000/api/v1/spool", params={"filament.vendor.name": "PLA", "limit": "50"}
    ).mock(return_value=httpx.Response(200, json=[{"id": 2}, {"id": 3}]))

    results = await SpoolmanClient(Settings()).search_spools("PLA")

    assert sorted(record.id for record in results) == [1, 2, 3]


@respx.mock
async def test_print_presets_lehnt_ungueltiges_format_ab() -> None:
    respx.get("http://spoolman:8000/api/v1/setting/print_presets").mock(
        return_value=httpx.Response(200, json={"value": "keine-json-liste"})
    )

    with pytest.raises(AppError) as raised:
        await SpoolmanClient(Settings()).print_presets()

    assert raised.value.code is ErrorCode.SPOOLMAN_VALIDATION_FAILED
