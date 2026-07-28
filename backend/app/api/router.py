"""Zusammenfuehrung aller API-Routen unter ``/api``."""

from __future__ import annotations

from fastapi import APIRouter

from app.api.routes import health, spoolman, workflows

api_router = APIRouter(prefix="/api")
api_router.include_router(health.router)
api_router.include_router(spoolman.router)
api_router.include_router(workflows.router)
