"""Sicherer, serverseitiger PDF-Renderer für Etiketten."""

from __future__ import annotations

import base64
import io
from collections.abc import Mapping
from pathlib import Path
from typing import Any, cast
from urllib.parse import unquote, urlparse

import anyio
import segno
from jinja2 import StrictUndefined
from jinja2.sandbox import SandboxedEnvironment
from weasyprint import CSS, HTML
from weasyprint.urls import URLFetcher, URLFetchingError

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
        # WeasyPrints ehemalige Funktion `default_url_fetcher` ist seit 69.0
        # als deprecated markiert und kann in einer künftigen Version ohne
        # Vorwarnung entfallen (pyproject.toml pinnt nur `>=63`). `URLFetcher`
        # ist die von WeasyPrint selbst empfohlene Ersatzklasse — intern macht
        # `default_url_fetcher` nichts anderes, als genau das hier zu tun.
        # `allow_redirects=False` erhält das bisherige, engere Verhalten.
        self._fetcher = URLFetcher(allowed_protocols=("data", "file"), allow_redirects=False)

    async def render_pdf(
        self,
        *,
        html_content: str,
        css_content: str,
        width_mm: float,
        height_mm: float,
        context: Mapping[str, Any],
    ) -> bytes:
        """Rendert ein Etikett in einem Worker-Thread, mit harter Zeitbegrenzung.

        WeasyPrint ist blockierend; ohne Worker-Thread wuerde ein teures oder
        pathologisches Template (z. B. aus einem veraenderten Spoolman-Preset)
        den gesamten Event-Loop blockieren (Single-Worker-Betrieb, siehe
        ADR-014). ``anyio.fail_after`` erzwingt die in ADR-014 versprochene,
        bislang nicht durchgesetzte harte Zeitbegrenzung.
        """
        try:
            with anyio.fail_after(self.settings.render_timeout_seconds):
                return await anyio.to_thread.run_sync(
                    lambda: self._render_pdf_sync(
                        html_content=html_content,
                        css_content=css_content,
                        width_mm=width_mm,
                        height_mm=height_mm,
                        context=context,
                    ),
                    # abandon_on_cancel=True: bei Ueberschreitung soll der Request
                    # sofort zurueckkehren, statt auf das Ende des (moeglicherweise
                    # haengenden) WeasyPrint-Aufrufs im Worker-Thread zu warten.
                    # Der Thread laeuft dann verwaist zu Ende, blockiert aber
                    # nicht laenger den Request.
                    abandon_on_cancel=True,
                )
        except TimeoutError as exc:
            raise AppError(
                ErrorCode.TEMPLATE_RENDER_FAILED, detail="Zeitüberschreitung beim Rendern"
            ) from exc

    def _render_pdf_sync(
        self,
        *,
        html_content: str,
        css_content: str,
        width_mm: float,
        height_mm: float,
        context: Mapping[str, Any],
    ) -> bytes:
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

    def _url_fetcher(self, url: str) -> Any:
        parsed = urlparse(url)
        if parsed.scheme == "data":
            return self._fetcher.fetch(url)
        if parsed.scheme != "file":
            raise URLFetchingError("Externe Ressourcen sind in Vorlagen nicht erlaubt")
        path = Path(unquote(parsed.path)).resolve()
        if not path.is_relative_to(self.assets_dir):
            raise URLFetchingError("Ressource liegt außerhalb des Asset-Verzeichnisses")
        return self._fetcher.fetch(path.as_uri())
