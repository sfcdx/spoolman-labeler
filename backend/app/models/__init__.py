"""ORM-Modelle von Spoolman Labeler.

Alle Modelle werden hier importiert, damit Alembics Autogenerierung sie in
``Base.metadata`` findet.
"""

from app.models.audit_event import AuditEvent
from app.models.enums import (
    BackendType,
    OutputFormat,
    PrintJobStatus,
    QrContentMode,
    WorkflowStatus,
)
from app.models.print_job import PrintJob
from app.models.printer import Printer
from app.models.setting import Setting
from app.models.template import Template
from app.models.workflow_run import WorkflowRun

__all__ = [
    "AuditEvent",
    "BackendType",
    "OutputFormat",
    "PrintJob",
    "PrintJobStatus",
    "Printer",
    "QrContentMode",
    "Setting",
    "Template",
    "WorkflowRun",
    "WorkflowStatus",
]
