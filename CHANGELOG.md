# Changelog

Alle nennenswerten Änderungen an diesem Projekt werden hier dokumentiert.

Das Format orientiert sich an
[Keep a Changelog](https://keepachangelog.com/de/1.1.0/), die Versionierung
folgt [Semantic Versioning](https://semver.org/lang/de/).

## [Unveröffentlicht]

### Hinzugefügt

- Projektgrundgerüst, Lizenz und Beitragsrichtlinien
- Architektur- und Analysedokumente für Spoolman-API, Weboberfläche und
  Drucksystem, mit 14 begründeten Architekturentscheidungen
- Backend-Grundgerüst: FastAPI, SQLAlchemy 2 mit asynchronem SQLite, Alembic,
  Konfiguration über Pydantic, strukturiertes Logging, Healthcheck mit
  getrenntem Status je Komponente
- Frontend-Grundgerüst: React 19, TypeScript, Vite, Ant Design 5, Theme mit
  Light-, Dark- und Systemmodus, Sidebar-Layout, typisierter API-Client
- Docker-Setup: Multi-stage Build als Nicht-Root, Compose-Stack mit
  CUPS-Sidecar, Umschaltung aller drei CUPS-Varianten über eine einzige
  Variable in der `.env`
- Secret-Scan in der CI, der die vollständige Historie prüft

### Bekannte Einschränkungen

- **Das Container-Image wurde noch nie gebaut.** Geprüft sind Syntax und die
  Auflösung der Compose-Datei, nicht aber `docker build`. Siehe
  [`docs/status.md`](docs/status.md).
- Der Frontend-Build erzeugt einen einzelnen JS-Chunk von 368 kB gzip.
  Code-Splitting folgt, sobald die Seiten echten Inhalt haben.
- Es gibt noch keine Anbindung an Spoolman und keinen Etikettendruck. Das
  Grundgerüst steht, die Fachlogik folgt in den Phasen 3 bis 8.

[Unveröffentlicht]: https://github.com/sfcdx/spoolman-labeler/commits/develop
