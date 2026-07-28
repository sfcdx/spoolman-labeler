"""Konfiguration der Anwendung.

Alle Werte kommen aus Umgebungsvariablen. Geheimnisse koennen zusaetzlich
ueber Dateien eingebunden werden (Docker Secrets): Zu jeder Variable ``X``
wird ``X_FILE`` ausgewertet, das den Pfad zu einer Datei mit dem Wert enthaelt.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

# Variablen, die zusaetzlich ueber <NAME>_FILE gesetzt werden koennen.
_FILE_BACKED_VARS = ("CUPS_PASSWORD", "CUPS_USERNAME", "SPOOLMAN_API_TOKEN")


def _load_file_backed_secrets() -> None:
    """Liest ``<NAME>_FILE``-Variablen ein und setzt daraus ``<NAME>``.

    Ein bereits gesetztes ``<NAME>`` hat Vorrang und wird nicht ueberschrieben.
    """
    for name in _FILE_BACKED_VARS:
        if os.environ.get(name):
            continue
        path_value = os.environ.get(f"{name}_FILE")
        if not path_value:
            continue
        try:
            content = Path(path_value).read_text(encoding="utf-8").strip()
        except OSError:
            # Bewusst still: Der Pfad darf fehlen, dann bleibt die Variable
            # ungesetzt. Ein Fehlerlog hier wuerde den Dateinamen preisgeben.
            continue
        if content:
            os.environ[name] = content


class Settings(BaseSettings):
    """Laufzeitkonfiguration von Spoolman Labeler."""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # -- Anwendung ---------------------------------------------------------
    app_host: str = "0.0.0.0"  # noqa: S104 - im Container beabsichtigt
    app_port: int = Field(default=7913, ge=1, le=65535)
    app_env: Literal["development", "production"] = "production"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"

    #: Verzeichnis fuer Datenbank, Vorlagen, gerenderte Dateien und Logs.
    data_dir: Path = Path("/data")

    #: Verzeichnis mit den gebauten Frontend-Dateien.
    static_dir: Path = Path("/app/static")

    #: Ausschließlich dieses Verzeichnis darf der Renderer als lokale
    #: Bild-/Schriftressource in einer Vorlage lesen.
    asset_dir: Path = Path("/app/assets")

    # -- Datenbank ---------------------------------------------------------
    database_url: str = "sqlite+aiosqlite:////data/spoolman-labeler.db"

    # -- Spoolman ----------------------------------------------------------
    #: Intern erreichbare API, z.B. http://spoolman:8000
    spoolman_api_url: str = "http://spoolman:8000"
    #: Oeffentlich erreichbare Oberflaeche, Ziel fuer QR-Codes und Links.
    spoolman_public_url: str = "http://localhost:7912"
    spoolman_timeout_seconds: float = Field(default=10.0, gt=0, le=120)
    #: Platzhalter fuer eine spaetere Spoolman-Version mit Authentifizierung.
    #: Aktuell besitzt Spoolman keinerlei Auth (siehe ADR-002).
    spoolman_api_token: SecretStr | None = None

    # -- CUPS --------------------------------------------------------------
    cups_server: str = "cups"
    cups_port: int = Field(default=631, ge=1, le=65535)
    cups_use_tls: bool = False
    cups_username: str | None = None
    cups_password: SecretStr | None = None
    cups_timeout_seconds: float = Field(default=10.0, gt=0, le=120)

    # -- Vorgaben ----------------------------------------------------------
    default_printer: str | None = None
    default_template: str | None = None
    default_label_width_mm: float = Field(default=62.0, gt=0, le=1000)
    default_label_height_mm: float = Field(default=29.0, gt=0, le=1000)
    default_dpi: int = Field(default=300, ge=50, le=1200)

    # -- Grenzen -----------------------------------------------------------
    max_spools_per_workflow: int = Field(default=50, ge=1, le=1000)
    max_print_retries: int = Field(default=2, ge=0, le=10)
    render_timeout_seconds: float = Field(default=15.0, gt=0, le=300)
    #: Groessenlimit fuer den Import von Vorlagen.
    max_template_upload_bytes: int = Field(default=1_048_576, ge=1024)

    # -- Validierung -------------------------------------------------------
    @field_validator("spoolman_api_url", "spoolman_public_url")
    @classmethod
    def _strip_trailing_slash(cls, value: str) -> str:
        return value.rstrip("/")

    @field_validator("spoolman_api_url", "spoolman_public_url")
    @classmethod
    def _require_http_scheme(cls, value: str) -> str:
        if not value.startswith(("http://", "https://")):
            msg = "URL muss mit http:// oder https:// beginnen"
            raise ValueError(msg)
        return value

    @model_validator(mode="after")
    def _check_label_defaults(self) -> Settings:
        if self.default_label_width_mm <= 0 or self.default_label_height_mm <= 0:
            msg = "Etikettenmasse muessen groesser als 0 sein"
            raise ValueError(msg)
        return self

    # -- Abgeleitete Werte -------------------------------------------------
    @property
    def spoolman_api_base(self) -> str:
        """Basis-URL der Spoolman-REST-API einschliesslich Version."""
        return f"{self.spoolman_api_url}/api/v1"

    @property
    def rendered_dir(self) -> Path:
        return self.data_dir / "rendered"

    @property
    def templates_dir(self) -> Path:
        return self.data_dir / "templates"

    @property
    def logs_dir(self) -> Path:
        return self.data_dir / "logs"

    @property
    def is_development(self) -> bool:
        return self.app_env == "development"

    def ensure_directories(self) -> None:
        """Legt die benoetigten Unterverzeichnisse in ``data_dir`` an."""
        for path in (self.data_dir, self.rendered_dir, self.templates_dir, self.logs_dir):
            path.mkdir(parents=True, exist_ok=True)

    def safe_dump(self) -> dict[str, object]:
        """Konfiguration ohne Geheimnisse, geeignet fuer Logs.

        Geheimnisse werden nicht maskiert, sondern durch einen Hinweis
        ersetzt, ob sie gesetzt sind. So laesst sich ein Konfigurationsfehler
        erkennen, ohne den Wert preiszugeben.
        """
        dumped = self.model_dump(mode="json")
        for key in ("cups_password", "spoolman_api_token"):
            dumped[key] = "<gesetzt>" if getattr(self, key) is not None else "<nicht gesetzt>"
        return dumped


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Liefert die Konfiguration als Singleton."""
    _load_file_backed_secrets()
    return Settings()
