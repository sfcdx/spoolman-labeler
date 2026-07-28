"""Sicherer, serverseitiger PDF-Renderer für Etiketten."""

from __future__ import annotations

import base64
import io
from collections.abc import Mapping
from pathlib import Path
from typing import Any, cast
from urllib.parse import unquote, urlparse

import segno
from jinja2 import StrictUndefined
from jinja2.sandbox import SandboxedEnvironment
from weasyprint import CSS, HTML, default_url_fetcher
from weasyprint.urls import URLFetchingError

from app.core.config import Settings
from app.core.errors import AppError, ErrorCode


class LabelRenderer:
    """Erzeugt PDFs mit festen Millimetermaßen ohne Netzwerkkontakt.

    HTML und CSS bleiben bewusst eine fortgeschrittene Vorlage-Funktion. Die
    Jinja-Sandbox verhindert Python-Zugriffe; der URL-Fetcher verhindert, dass
    WeasyPrint über CSS oder HTML interne Dienste anfragt.
    """

    def __init__(self, settings: Settings) -> None:
        self.settings = settings
        self.assets_dir = settings.asset_dir.resolve()
        self.environment = SandboxedEnvironment(autoescape=True, undefined=StrictUndefined)

    def render_pdf(
        self,
        *,
        html_content: str,
        css_content: str,
        width_mm: float,
        height_mm: float,
        context: Mapping[str, Any],
    ) -> bytes:
        """Rendert ein Etikett und hebt nur sichere, stabile Fehler hervor."""
        if width_mm <= 0 or height_mm <= 0:
            raise AppError(ErrorCode.TEMPLATE_INVALID, detail="Etikettenmaße müssen positiv sein")
        if (
            len(html_content.encode()) + len(css_content.encode())
            > self.settings.max_template_upload_bytes
        ):
            raise AppError(
                ErrorCode.TEMPLATE_INVALID, detail="Vorlage überschreitet das Größenlimit"
            )
        try:
            html = self.environment.from_string(html_content).render(**dict(context))
            css = self.environment.from_string(css_content).render(**dict(context))
            page_css = f"@page {{ size: {width_mm}mm {height_mm}mm; margin: 0; }}"
            return cast(
                bytes,
                HTML(string=html, url_fetcher=self._url_fetcher).write_pdf(
                    stylesheets=[
                        CSS(string=page_css),
                        CSS(string=css, url_fetcher=self._url_fetcher),
                    ]
                ),
            )
        except AppError:
            raise
        except Exception as exc:
            raise AppError(ErrorCode.TEMPLATE_RENDER_FAILED) from exc

    @staticmethod
    def qr_data_uri(spool_id: int) -> str:
        """Erzeugt den von Spoolmans Scanner erwarteten QR-Code als SVG-Data-URI."""
        if spool_id <= 0:
            raise AppError(ErrorCode.QR_RENDER_FAILED, detail="Ungültige Spulen-ID")
        try:
            buffer = io.BytesIO()
            segno.make(f"WEB+SPOOLMAN:S-{spool_id}", error="h").save(buffer, kind="svg", scale=3)
            encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
            return f"data:image/svg+xml;base64,{encoded}"
        except Exception as exc:
            raise AppError(ErrorCode.QR_RENDER_FAILED) from exc

    def _url_fetcher(self, url: str) -> dict[str, Any]:
        parsed = urlparse(url)
        if parsed.scheme == "data":
            return cast(dict[str, Any], default_url_fetcher(url))
        if parsed.scheme != "file":
            raise URLFetchingError("Externe Ressourcen sind in Vorlagen nicht erlaubt")
        path = Path(unquote(parsed.path)).resolve()
        if not path.is_relative_to(self.assets_dir):
            raise URLFetchingError("Ressource liegt außerhalb des Asset-Verzeichnisses")
        return cast(dict[str, Any], default_url_fetcher(path.as_uri()))
