"""Verifikation der Render-Sandbox und des QR-Formats."""

from __future__ import annotations

import base64
from unittest.mock import patch

import segno
from weasyprint.urls import URLFetchingError

from app.core.config import Settings
from app.services.rendering import LabelRenderer


def test_renderer_erzeugt_pdf_und_escaped_werte(settings: Settings) -> None:
    renderer = LabelRenderer(settings)

    rendered = renderer.render_pdf(
        html_content='<p>{{ spool.name }}</p><img src="{{ qr }}">',
        css_content="p { font-size: 3mm; }",
        width_mm=62,
        height_mm=29,
        context={"spool": {"name": "<b>PLA</b>"}, "qr": renderer.qr_data_uri(42)},
    )

    assert rendered.startswith(b"%PDF")


def test_renderer_blockiert_externe_ressourcen(settings: Settings) -> None:
    renderer = LabelRenderer(settings)

    try:
        renderer._url_fetcher("http://example.invalid/secret.png")
    except URLFetchingError:
        pass
    else:
        msg = "Externe Ressourcen wurden nicht abgewiesen"
        raise AssertionError(msg)


def test_qr_data_uri_enthaelt_spoolman_uri(settings: Settings) -> None:
    renderer = LabelRenderer(settings)
    with patch("app.services.rendering.pdf_renderer.segno.make", wraps=segno.make) as make:
        uri = renderer.qr_data_uri(42)

    svg = base64.b64decode(uri.split(",", maxsplit=1)[1]).decode()
    assert make.call_args.args[0] == "WEB+SPOOLMAN:S-42"
    assert svg.startswith("<?xml")
