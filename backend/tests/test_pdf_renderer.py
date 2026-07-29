"""Verifikation der Render-Sandbox und des QR-Formats."""

from __future__ import annotations

import base64
from unittest.mock import patch

import pytest
import segno
from weasyprint.urls import URLFetchingError

from app.core.config import Settings
from app.core.errors import AppError
from app.services.rendering import LabelRenderer


async def test_renderer_erzeugt_pdf_und_escaped_werte(settings: Settings) -> None:
    renderer = LabelRenderer(settings)

    rendered = await renderer.render_pdf(
        html_content='<p>{{ spool.name }}</p><img src="{{ qr }}">',
        css_content="p { font-size: 3mm; }",
        width_mm=62,
        height_mm=29,
        context={"spool": {"name": "<b>PLA</b>"}, "qr": renderer.qr_data_uri(42)},
    )

    assert rendered.startswith(b"%PDF")


async def test_renderer_bricht_bei_zeitueberschreitung_ab(settings: Settings) -> None:
    """ADR-014 verspricht eine harte Zeitbegrenzung — hier verifiziert."""
    slow_settings = settings.model_copy(update={"render_timeout_seconds": 0.001})
    renderer = LabelRenderer(slow_settings)

    with pytest.raises(AppError) as raised:
        await renderer.render_pdf(
            html_content="<p>{{ spool.name }}</p>",
            css_content="",
            width_mm=62,
            height_mm=29,
            context={"spool": {"name": "PLA"}},
        )

    assert raised.value.code.value == "TEMPLATE_RENDER_FAILED"


def test_renderer_blockiert_externe_ressourcen(settings: Settings) -> None:
    renderer = LabelRenderer(settings)

    try:
        renderer._url_fetcher("http://example.invalid/secret.png")
    except URLFetchingError:
        pass
    else:
        msg = "Externe Ressourcen wurden nicht abgewiesen"
        raise AssertionError(msg)


def test_renderer_blockiert_pfadausbruch_aus_dem_asset_verzeichnis(
    settings: Settings, tmp_path: object
) -> None:
    """`file:`-URIs sind erlaubt, aber nur innerhalb von ``asset_dir``.

    Eine Vorlage darf nicht per ``../../etc/passwd`` aus dem freigegebenen
    Verzeichnis ausbrechen. Das ist derselbe Kontrollmechanismus wie die
    Ablehnung von `http(s)`, nur für den erlaubten Pfad.
    """
    renderer = LabelRenderer(settings)
    ausserhalb = renderer.assets_dir.parent / "geheim.txt"

    try:
        renderer._url_fetcher(f"file://{ausserhalb}")
    except URLFetchingError:
        pass
    else:
        msg = "Pfadausbruch aus dem Asset-Verzeichnis wurde nicht abgewiesen"
        raise AssertionError(msg)


def test_qr_data_uri_enthaelt_spoolman_uri(settings: Settings) -> None:
    renderer = LabelRenderer(settings)
    with patch("app.services.rendering.pdf_renderer.segno.make", wraps=segno.make) as make:
        uri = renderer.qr_data_uri(42)

    svg = base64.b64decode(uri.split(",", maxsplit=1)[1]).decode()
    assert make.call_args.args[0] == "WEB+SPOOLMAN:S-42"
    assert svg.startswith("<?xml")
