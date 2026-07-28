"""Aufzaehlungen des Datenmodells."""

from __future__ import annotations

from enum import StrEnum


class PrintJobStatus(StrEnum):
    """Lebenszyklus eines Druckauftrags.

    Wichtig: ``completed`` bedeutet, dass CUPS den Auftrag als abgeschlossen
    meldet — nicht, dass das Etikett nachweislich physisch gedruckt wurde.
    Die Oberflaeche unterscheidet das sprachlich (siehe ADR-013).
    """

    QUEUED = "queued"
    SUBMITTED = "submitted"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"
    UNKNOWN = "unknown"

    @property
    def is_terminal(self) -> bool:
        return self in {
            PrintJobStatus.COMPLETED,
            PrintJobStatus.FAILED,
            PrintJobStatus.CANCELLED,
        }

    @property
    def is_retryable(self) -> bool:
        return self in {PrintJobStatus.FAILED, PrintJobStatus.CANCELLED}


class WorkflowStatus(StrEnum):
    """Lebenszyklus eines Workflow-Laufs.

    ``PARTIAL`` ist der fachlich wichtigste Zustand: Die Spulen wurden in
    Spoolman angelegt, der Druck ist aber fehlgeschlagen. Ein solcher Lauf
    darf niemals zurueckgerollt werden (siehe ADR-012).
    """

    PENDING = "pending"
    CREATING = "creating"
    PRINTING = "printing"
    COMPLETED = "completed"
    PARTIAL = "partial"
    FAILED = "failed"

    @property
    def is_terminal(self) -> bool:
        return self in {
            WorkflowStatus.COMPLETED,
            WorkflowStatus.PARTIAL,
            WorkflowStatus.FAILED,
        }


class OutputFormat(StrEnum):
    """Ausgabeformat einer Etikettenvorlage."""

    PDF = "pdf"
    PNG = "png"
    SVG = "svg"


class QrContentMode(StrEnum):
    """Inhalt des QR-Codes.

    ``SPOOLMAN_URI`` ist der Standard, weil nur dieses Format von Spoolmans
    eigenem Scanner zuverlaessig erkannt wird (siehe ADR-010).
    """

    SPOOLMAN_URI = "spoolman_uri"
    HTTP_URL = "http_url"


class BackendType(StrEnum):
    """Anbindungsart eines Druckers."""

    CUPS = "cups"
