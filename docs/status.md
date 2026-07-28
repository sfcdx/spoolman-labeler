# Projektstatus

**Letzte Aktualisierung:** 28. Juli 2026  
**Arbeitsbranch:** `fix/docker-first-build`

## Erledigt

- Phase 1: Spoolman-API, Oberfläche, Drucksystem und Architektur untersucht.
- Backend-Grundgerüst: FastAPI, SQLAlchemy 2, Alembic, SQLite, Healthcheck und
  strukturierte Fehlerbehandlung.
- Frontend-Grundgerüst: React, TypeScript, Vite, Ant Design, responsives Layout
  sowie System-, Hell- und Dunkelmodus.
- Docker-/Compose-Setup mit nicht privilegiertem Anwendungscontainer,
  optionalem Spoolman-Dienst und CUPS-Sidecar.
- Der Docker-Buildfehler im Frontend-Manifestpfad wurde korrigiert.
- Die Spoolman-Gesundheitsprüfung ignoriert Prozess-Proxies bewusst, damit der
  interne Dienstname `spoolman` nicht über einen Proxy geroutet wird.

## Verifiziert

| Prüfung | Ergebnis |
| --- | --- |
| Backend-Tests | 32 bestanden |
| Backend-Linting (Ruff) | bestanden |
| Backend-Typprüfung (mypy) | bestanden |
| Frontend-Tests | 37 bestanden |
| Frontend-Linting (ESLint) | bestanden |
| Frontend-Produktionsbuild | bestanden |

Die Healthcheck-Tests wurden vor der Proxy-Korrektur absichtlich in der
aktuellen Proxy-Umgebung ausgeführt und schlugen dadurch fehl. Nach der
Korrektur bestehen sie. Damit decken die Tests die Änderung tatsächlich ab.

## Noch nicht verifiziert

Der vollständige Docker-Lauf (`docker compose build`, `up` und der
Container-Healthcheck) konnte nicht ausgeführt werden: Die aktuelle
Arbeitsumgebung stellt keinen Docker-Daemon bereit. Der zuvor blockierende
Dockerfile-Pfad wurde statisch korrigiert; ein realer Image-Build auf einem
Docker-Host bleibt vor dem Merge erforderlich.

## Nächste Schritte

1. Image auf einem Docker-Host bauen und den Start mit dem Compose-Standardprofil
   verifizieren.
2. Phase 3 beginnen: getypter Spoolman-Client mit Fehler-Mapping,
   Hersteller-/Filament-Suche sowie Create-Endpunkten.
3. Die neuen Backend-Bausteine mit Mock-Spoolman testen.

