"""Fehlercodes und Ausnahmen der Anwendung.

Die Oberflaeche zeigt die deutschen Texte aus ``USER_MESSAGES``. Logs und
API-Antworten duerfen zusaetzlich technische Details enthalten — aber niemals
Geheimnisse.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Any


class ErrorCode(StrEnum):
    """Stabile, interne Fehlercodes."""

    # -- Spoolman ----------------------------------------------------------
    SPOOLMAN_UNREACHABLE = "SPOOLMAN_UNREACHABLE"
    SPOOLMAN_AUTH_FAILED = "SPOOLMAN_AUTH_FAILED"
    SPOOLMAN_VALIDATION_FAILED = "SPOOLMAN_VALIDATION_FAILED"
    VENDOR_CREATE_FAILED = "VENDOR_CREATE_FAILED"
    FILAMENT_CREATE_FAILED = "FILAMENT_CREATE_FAILED"
    SPOOL_CREATE_FAILED = "SPOOL_CREATE_FAILED"
    SPOOL_FETCH_FAILED = "SPOOL_FETCH_FAILED"

    # -- Vorlagen und Rendering -------------------------------------------
    TEMPLATE_NOT_FOUND = "TEMPLATE_NOT_FOUND"
    TEMPLATE_INVALID = "TEMPLATE_INVALID"
    TEMPLATE_RENDER_FAILED = "TEMPLATE_RENDER_FAILED"
    QR_RENDER_FAILED = "QR_RENDER_FAILED"

    # -- Drucken -----------------------------------------------------------
    CUPS_UNREACHABLE = "CUPS_UNREACHABLE"
    PRINTER_NOT_FOUND = "PRINTER_NOT_FOUND"
    PRINTER_OFFLINE = "PRINTER_OFFLINE"
    PRINT_SUBMISSION_FAILED = "PRINT_SUBMISSION_FAILED"
    PRINT_STATUS_UNKNOWN = "PRINT_STATUS_UNKNOWN"
    PRINT_CANCEL_FAILED = "PRINT_CANCEL_FAILED"
    PRINT_JOB_NOT_FOUND = "PRINT_JOB_NOT_FOUND"
    PRINT_JOB_NOT_RETRYABLE = "PRINT_JOB_NOT_RETRYABLE"

    # -- Allgemein ---------------------------------------------------------
    DATABASE_ERROR = "DATABASE_ERROR"
    CONFIGURATION_ERROR = "CONFIGURATION_ERROR"
    IDEMPOTENCY_CONFLICT = "IDEMPOTENCY_CONFLICT"
    VALIDATION_FAILED = "VALIDATION_FAILED"
    INTERNAL_ERROR = "INTERNAL_ERROR"


#: Verstaendliche deutsche Texte fuer die Oberflaeche.
USER_MESSAGES: dict[ErrorCode, str] = {
    ErrorCode.SPOOLMAN_UNREACHABLE: (
        "Spoolman ist nicht erreichbar. Bitte prüfe die Verbindung in den Einstellungen."
    ),
    ErrorCode.SPOOLMAN_AUTH_FAILED: "Die Anmeldung an Spoolman wurde abgelehnt.",
    ErrorCode.SPOOLMAN_VALIDATION_FAILED: "Spoolman hat die übermittelten Daten abgelehnt.",
    ErrorCode.VENDOR_CREATE_FAILED: "Der Hersteller konnte nicht angelegt werden.",
    ErrorCode.FILAMENT_CREATE_FAILED: "Das Filament konnte nicht angelegt werden.",
    ErrorCode.SPOOL_CREATE_FAILED: "Die Spule konnte nicht angelegt werden.",
    ErrorCode.SPOOL_FETCH_FAILED: "Die Spule konnte nicht aus Spoolman geladen werden.",
    ErrorCode.TEMPLATE_NOT_FOUND: "Die Vorlage wurde nicht gefunden.",
    ErrorCode.TEMPLATE_INVALID: "Die Vorlage ist fehlerhaft und wurde nicht gespeichert.",
    ErrorCode.TEMPLATE_RENDER_FAILED: "Das Etikett konnte nicht erzeugt werden.",
    ErrorCode.QR_RENDER_FAILED: "Der QR-Code konnte nicht erzeugt werden.",
    ErrorCode.CUPS_UNREACHABLE: (
        "Das Drucksystem ist nicht erreichbar. Bitte prüfe die CUPS-Einstellungen."
    ),
    ErrorCode.PRINTER_NOT_FOUND: "Der ausgewählte Drucker existiert nicht.",
    ErrorCode.PRINTER_OFFLINE: "Der Drucker ist derzeit nicht bereit.",
    ErrorCode.PRINT_SUBMISSION_FAILED: "Der Druckauftrag konnte nicht übermittelt werden.",
    ErrorCode.PRINT_STATUS_UNKNOWN: "Der Status des Druckauftrags ist unbekannt.",
    ErrorCode.PRINT_CANCEL_FAILED: "Der Druckauftrag konnte nicht abgebrochen werden.",
    ErrorCode.PRINT_JOB_NOT_FOUND: "Der Druckauftrag wurde nicht gefunden.",
    ErrorCode.PRINT_JOB_NOT_RETRYABLE: (
        "Nur fehlgeschlagene oder abgebrochene Druckaufträge können erneut gedruckt werden."
    ),
    ErrorCode.DATABASE_ERROR: "Es ist ein Datenbankfehler aufgetreten.",
    ErrorCode.CONFIGURATION_ERROR: "Die Konfiguration ist unvollständig oder fehlerhaft.",
    ErrorCode.IDEMPOTENCY_CONFLICT: (
        "Dieser Vorgang wurde bereits ausgeführt. Es wurde nichts doppelt angelegt."
    ),
    ErrorCode.VALIDATION_FAILED: "Bitte prüfe die markierten Eingaben.",
    ErrorCode.INTERNAL_ERROR: "Es ist ein unerwarteter Fehler aufgetreten.",
}

#: HTTP-Status je Fehlercode.
_HTTP_STATUS: dict[ErrorCode, int] = {
    ErrorCode.SPOOLMAN_UNREACHABLE: 502,
    ErrorCode.SPOOLMAN_AUTH_FAILED: 502,
    ErrorCode.SPOOLMAN_VALIDATION_FAILED: 422,
    ErrorCode.VENDOR_CREATE_FAILED: 502,
    ErrorCode.FILAMENT_CREATE_FAILED: 502,
    ErrorCode.SPOOL_CREATE_FAILED: 502,
    ErrorCode.SPOOL_FETCH_FAILED: 502,
    ErrorCode.TEMPLATE_NOT_FOUND: 404,
    ErrorCode.TEMPLATE_INVALID: 422,
    ErrorCode.TEMPLATE_RENDER_FAILED: 500,
    ErrorCode.QR_RENDER_FAILED: 500,
    ErrorCode.CUPS_UNREACHABLE: 502,
    ErrorCode.PRINTER_NOT_FOUND: 404,
    ErrorCode.PRINTER_OFFLINE: 409,
    ErrorCode.PRINT_SUBMISSION_FAILED: 502,
    ErrorCode.PRINT_STATUS_UNKNOWN: 200,
    ErrorCode.PRINT_CANCEL_FAILED: 502,
    ErrorCode.PRINT_JOB_NOT_FOUND: 404,
    ErrorCode.PRINT_JOB_NOT_RETRYABLE: 409,
    ErrorCode.DATABASE_ERROR: 500,
    ErrorCode.CONFIGURATION_ERROR: 500,
    ErrorCode.IDEMPOTENCY_CONFLICT: 409,
    ErrorCode.VALIDATION_FAILED: 422,
    ErrorCode.INTERNAL_ERROR: 500,
}


class AppError(Exception):
    """Fehler mit stabilem Code, deutschem Text und technischem Detail."""

    def __init__(
        self,
        code: ErrorCode,
        *,
        detail: str | None = None,
        context: dict[str, Any] | None = None,
        status_code: int | None = None,
    ) -> None:
        self.code = code
        self.detail = detail
        self.context = context or {}
        self.status_code = status_code or _HTTP_STATUS.get(code, 500)
        super().__init__(f"{code}: {detail}" if detail else str(code))

    @property
    def user_message(self) -> str:
        return USER_MESSAGES.get(self.code, USER_MESSAGES[ErrorCode.INTERNAL_ERROR])

    def to_response(self) -> dict[str, Any]:
        """Antwortkoerper fuer die API."""
        body: dict[str, Any] = {
            "error": {
                "code": self.code.value,
                "message": self.user_message,
            }
        }
        if self.detail:
            body["error"]["detail"] = self.detail
        if self.context:
            body["error"]["context"] = self.context
        return body
