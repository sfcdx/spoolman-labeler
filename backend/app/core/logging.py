"""Strukturiertes Logging.

Ausgabe als JSON-Zeilen, damit Logs maschinell auswertbar bleiben. Ein Filter
entfernt Werte, die wie Geheimnisse aussehen — als zweite Verteidigungslinie
zusaetzlich dazu, dass Geheimnisse gar nicht erst geloggt werden sollen.
"""

from __future__ import annotations

import json
import logging
import re
import sys
from typing import Any

#: Schluesselnamen, deren Werte niemals im Log erscheinen duerfen.
_SECRET_KEY_PATTERN = re.compile(
    r"(pass(word)?|secret|token|api[_-]?key|authorization|credential)",
    re.IGNORECASE,
)

_REDACTED = "<entfernt>"

#: Standardattribute eines LogRecord, die nicht als Zusatzfeld gelten.
_RESERVED_ATTRS = frozenset(
    {
        "args",
        "asctime",
        "created",
        "exc_info",
        "exc_text",
        "filename",
        "funcName",
        "levelname",
        "levelno",
        "lineno",
        "module",
        "msecs",
        "message",
        "msg",
        "name",
        "pathname",
        "process",
        "processName",
        "relativeCreated",
        "stack_info",
        "stack_length",
        "thread",
        "threadName",
        "taskName",
    }
)


def _redact(value: Any, key: str | None = None) -> Any:
    """Ersetzt verdaechtige Werte rekursiv durch einen Platzhalter."""
    if key is not None and _SECRET_KEY_PATTERN.search(key):
        return _REDACTED
    if isinstance(value, dict):
        return {k: _redact(v, k) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact(v) for v in value]
    return value


class JsonFormatter(logging.Formatter):
    """Formatiert LogRecords als eine JSON-Zeile."""

    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "event": record.getMessage(),
        }

        for key, value in record.__dict__.items():
            if key in _RESERVED_ATTRS or key.startswith("_"):
                continue
            payload[key] = _redact(value, key)

        if record.exc_info:
            payload["exception"] = self.formatException(record.exc_info)

        return json.dumps(payload, ensure_ascii=False, default=str)


class HumanFormatter(logging.Formatter):
    """Kompakte, gut lesbare Ausgabe fuer die lokale Entwicklung."""

    def format(self, record: logging.LogRecord) -> str:
        base = f"{self.formatTime(record, '%H:%M:%S')} {record.levelname:<8} {record.getMessage()}"
        extras = {
            k: _redact(v, k)
            for k, v in record.__dict__.items()
            if k not in _RESERVED_ATTRS and not k.startswith("_")
        }
        if extras:
            rendered = " ".join(f"{k}={v}" for k, v in extras.items())
            base = f"{base}  {rendered}"
        if record.exc_info:
            base = f"{base}\n{self.formatException(record.exc_info)}"
        return base


def configure_logging(level: str = "INFO", *, human_readable: bool = False) -> None:
    """Richtet das Wurzel-Log ein. Mehrfachaufrufe sind unschaedlich."""
    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(HumanFormatter() if human_readable else JsonFormatter())

    root = logging.getLogger()
    root.handlers.clear()
    root.addHandler(handler)
    root.setLevel(level)

    # Uvicorn bringt eigene Handler mit, die sonst doppelt ausgeben.
    for name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logger = logging.getLogger(name)
        logger.handlers.clear()
        logger.propagate = True

    # httpx loggt jede Anfrage auf INFO, das ist hier zu gespraechig.
    logging.getLogger("httpx").setLevel("WARNING")


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)
