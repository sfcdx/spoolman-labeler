"""Tests der Konfiguration."""

from __future__ import annotations

from pathlib import Path

import pytest
from pydantic import ValidationError

from app.core.config import Settings, get_settings


def test_api_base_wird_aus_url_abgeleitet() -> None:
    settings = Settings(spoolman_api_url="http://spoolman:8000")
    assert settings.spoolman_api_base == "http://spoolman:8000/api/v1"


def test_abschliessender_schraegstrich_wird_entfernt() -> None:
    """Sonst entstuenden URLs mit doppeltem Schraegstrich."""
    settings = Settings(
        spoolman_api_url="http://spoolman:8000/",
        spoolman_public_url="http://192.0.2.10:7912///",
    )
    assert settings.spoolman_api_url == "http://spoolman:8000"
    assert settings.spoolman_public_url == "http://192.0.2.10:7912"
    assert settings.spoolman_api_base == "http://spoolman:8000/api/v1"


def test_url_ohne_schema_wird_abgelehnt() -> None:
    with pytest.raises(ValidationError, match="http://"):
        Settings(spoolman_api_url="spoolman:8000")


@pytest.mark.parametrize("port", [0, -1, 70000])
def test_unplausible_ports_werden_abgelehnt(port: int) -> None:
    with pytest.raises(ValidationError):
        Settings(app_port=port)


@pytest.mark.parametrize(("feld", "wert"), [("default_label_width_mm", 0), ("default_dpi", 10)])
def test_unplausible_etikettenwerte_werden_abgelehnt(feld: str, wert: float) -> None:
    with pytest.raises(ValidationError):
        Settings(**{feld: wert})


def test_safe_dump_gibt_keine_geheimnisse_preis() -> None:
    settings = Settings(cups_password="streng-geheim", cups_username="drucker")
    dumped = settings.safe_dump()

    serialisiert = repr(dumped)
    assert "streng-geheim" not in serialisiert
    assert dumped["cups_password"] == "<gesetzt>"
    assert dumped["spoolman_api_token"] == "<nicht gesetzt>"
    # Der Benutzername ist kein Geheimnis und darf sichtbar bleiben.
    assert dumped["cups_username"] == "drucker"


def test_geheimnis_aus_datei_wird_gelesen(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    """Docker Secrets werden ueber <NAME>_FILE eingebunden."""
    secret_file = tmp_path / "cups_password"
    secret_file.write_text("aus-der-datei\n", encoding="utf-8")

    monkeypatch.setenv("CUPS_PASSWORD_FILE", str(secret_file))
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.cups_password is not None
    assert settings.cups_password.get_secret_value() == "aus-der-datei"

    get_settings.cache_clear()


def test_direkte_variable_schlaegt_datei(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    secret_file = tmp_path / "cups_password"
    secret_file.write_text("aus-der-datei", encoding="utf-8")

    monkeypatch.setenv("CUPS_PASSWORD", "direkt-gesetzt")
    monkeypatch.setenv("CUPS_PASSWORD_FILE", str(secret_file))
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.cups_password is not None
    assert settings.cups_password.get_secret_value() == "direkt-gesetzt"

    get_settings.cache_clear()


def test_fehlende_geheimnisdatei_bricht_nicht_ab(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CUPS_PASSWORD_FILE", "/gibt/es/nicht")
    get_settings.cache_clear()

    settings = get_settings()
    assert settings.cups_password is None

    get_settings.cache_clear()


def test_verzeichnisse_werden_angelegt(tmp_path: Path) -> None:
    settings = Settings(data_dir=tmp_path / "data")
    settings.ensure_directories()

    assert settings.rendered_dir.is_dir()
    assert settings.templates_dir.is_dir()
    assert settings.logs_dir.is_dir()


def test_compose_variablen_werden_von_settings_uebernommen(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Der Compose-Vertrag darf keine wirksamen Werte still verwerfen."""
    monkeypatch.setenv("LOG_LEVEL", "WARNING")
    monkeypatch.setenv("SPOOLMAN_API_URL", "http://spoolman:8000")
    monkeypatch.setenv("SPOOLMAN_PUBLIC_URL", "http://localhost:7912")
    monkeypatch.setenv("CUPS_SERVER", "cups")
    monkeypatch.setenv("CUPS_PORT", "631")
    monkeypatch.setenv("CUPS_USERNAME", "admin")
    monkeypatch.setenv("CUPS_USE_TLS", "false")
    monkeypatch.setenv("DEFAULT_DPI", "300")
    monkeypatch.setenv("MAX_PRINT_RETRIES", "2")
    monkeypatch.setenv("MAX_TEMPLATE_UPLOAD_BYTES", "1048576")

    settings = Settings()

    assert settings.log_level == "WARNING"
    assert settings.spoolman_api_url == "http://spoolman:8000"
    assert settings.spoolman_public_url == "http://localhost:7912"
    assert settings.cups_server == "cups"
    assert settings.cups_port == 631
    assert settings.cups_username == "admin"
    assert settings.default_dpi == 300
    assert settings.max_print_retries == 2
    assert settings.max_template_upload_bytes == 1_048_576
