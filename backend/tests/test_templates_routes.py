"""Tests der Vorlagen-CRUD-Endpunkte inkl. Spoolman-Import und Vorschau."""

from __future__ import annotations

from httpx import AsyncClient


def _payload(**overrides: object) -> dict[str, object]:
    payload: dict[str, object] = {
        "name": "Eigene Vorlage",
        "html_content": "<p>{{ spool.id }}</p>",
        "css_content": "p { font-size: 3mm; }",
        "width_mm": 62,
        "height_mm": 29,
    }
    payload.update(overrides)
    return payload


async def test_vorlage_anlegen_und_lesen(client: AsyncClient) -> None:
    created = await client.post("/api/templates", json=_payload())
    assert created.status_code == 201
    body = created.json()
    assert body["name"] == "Eigene Vorlage"
    assert body["is_builtin"] is False

    fetched = await client.get(f"/api/templates/{body['id']}")
    assert fetched.status_code == 200


async def test_doppelter_name_wird_abgelehnt(client: AsyncClient) -> None:
    await client.post("/api/templates", json=_payload(name="X"))
    response = await client.post("/api/templates", json=_payload(name="X"))
    assert response.status_code == 422


async def test_duplizieren_erzeugt_unabhaengige_kopie(client: AsyncClient) -> None:
    created = await client.post("/api/templates", json=_payload())
    template_id = created.json()["id"]

    duplicate = await client.post(f"/api/templates/{template_id}/duplicate", json={"name": "Kopie"})

    assert duplicate.status_code == 201
    assert duplicate.json()["id"] != template_id
    assert duplicate.json()["html_content"] == created.json()["html_content"]


async def test_eingebaute_vorlage_kann_nicht_geaendert_oder_geloescht_werden(
    client: AsyncClient,
) -> None:
    liste = await client.get("/api/templates")
    builtin = next(item for item in liste.json() if item["is_builtin"])

    patched = await client.patch(f"/api/templates/{builtin['id']}", json={"name": "Neu"})
    deleted = await client.delete(f"/api/templates/{builtin['id']}")

    assert patched.status_code == 422
    assert deleted.status_code == 422


async def test_import_spoolman_preset_uebersetzt_tags_und_meldet_unbekannte(
    client: AsyncClient,
) -> None:
    preset = {
        "name": "Spoolman-Preset",
        "template": "ID {id} - {unbekanntes_tag}",
        "labelSettings": {"labelWidth": 40, "labelHeight": 20},
    }

    response = await client.post("/api/templates/import-spoolman", json={"preset": preset})

    assert response.status_code == 201
    body = response.json()
    assert "{{ spool.id }}" in body["template"]["html_content"]
    assert body["template"]["width_mm"] == 40
    assert body["unknown_tags"] == ["unbekanntes_tag"]


async def test_vorschau_liefert_pdf(client: AsyncClient) -> None:
    response = await client.post(
        "/api/templates/preview",
        json={
            "html_content": "<p>{{ spool.id }} {{ filament.material }}</p>",
            "css_content": "",
            "width_mm": 62,
            "height_mm": 29,
        },
    )

    assert response.status_code == 200
    assert response.headers["content-type"] == "application/pdf"
    assert response.content.startswith(b"%PDF")


async def test_vorschau_gespeicherter_vorlage(client: AsyncClient) -> None:
    liste = await client.get("/api/templates")
    builtin = next(item for item in liste.json() if item["is_builtin"])

    response = await client.get(f"/api/templates/{builtin['id']}/preview")

    assert response.status_code == 200
    assert response.content.startswith(b"%PDF")
