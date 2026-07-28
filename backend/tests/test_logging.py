"""Tests des strukturierten Loggings.

Der Schwerpunkt liegt auf der Frage, ob Geheimnisse zuverlaessig aus den Logs
verschwinden. Das ist eine der verbindlichen Sicherheitsregeln.
"""

from __future__ import annotations

import json
import logging

import pytest

from app.core.logging import HumanFormatter, JsonFormatter


def _record(**extra: object) -> logging.LogRecord:
    record = logging.LogRecord(
        name="test",
        level=logging.INFO,
        pathname=__file__,
        lineno=1,
        msg="ereignis",
        args=(),
        exc_info=None,
    )
    for key, value in extra.items():
        setattr(record, key, value)
    return record


def test_json_formatter_liefert_gueltiges_json() -> None:
    ausgabe = JsonFormatter().format(_record(spool_id=184))
    payload = json.loads(ausgabe)

    assert payload["event"] == "ereignis"
    assert payload["level"] == "INFO"
    assert payload["spool_id"] == 184


@pytest.mark.parametrize(
    "feldname",
    ["password", "cups_password", "api_key", "apiKey", "token", "secret", "Authorization"],
)
def test_geheime_feldnamen_werden_entfernt(feldname: str) -> None:
    ausgabe = JsonFormatter().format(_record(**{feldname: "streng-geheim"}))

    assert "streng-geheim" not in ausgabe
    assert "<entfernt>" in ausgabe


def test_geheimnisse_in_verschachtelten_strukturen_werden_entfernt() -> None:
    """Ein Geheimnis darf sich nicht in einem Unterobjekt verstecken."""
    ausgabe = JsonFormatter().format(
        _record(config={"cups": {"server": "cups", "password": "streng-geheim"}})
    )

    assert "streng-geheim" not in ausgabe
    payload = json.loads(ausgabe)
    assert payload["config"]["cups"]["password"] == "<entfernt>"
    # Unverdaechtige Nachbarwerte bleiben erhalten.
    assert payload["config"]["cups"]["server"] == "cups"


def test_geheimnisse_in_listen_werden_entfernt() -> None:
    ausgabe = JsonFormatter().format(
        _record(eintraege=[{"token": "streng-geheim"}, {"name": "harmlos"}])
    )

    assert "streng-geheim" not in ausgabe
    assert "harmlos" in ausgabe


def test_human_formatter_entfernt_ebenfalls() -> None:
    """Die lesbare Ausgabe darf nicht die Luecke sein."""
    ausgabe = HumanFormatter().format(_record(password="streng-geheim"))

    assert "streng-geheim" not in ausgabe
    assert "<entfernt>" in ausgabe


def test_unverdaechtige_felder_bleiben_erhalten() -> None:
    ausgabe = JsonFormatter().format(_record(printer="Brother_QL_800", cups_job_id=1054))
    payload = json.loads(ausgabe)

    assert payload["printer"] == "Brother_QL_800"
    assert payload["cups_job_id"] == 1054
