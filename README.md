<div align="center">

# Spoolman Labeler

**Filamentrollen erfassen und in einem Schritt etikettieren.**

Eine eigenständige Weboberfläche neben [Spoolman](https://github.com/Donkie/Spoolman),
die neue Spulen anlegt und das passende Etikett direkt über CUPS ausdruckt —
ohne Browser-Druckdialog.

[![Lizenz: MIT](https://img.shields.io/badge/Lizenz-MIT-blue.svg)](LICENSE)
[![Status: in Entwicklung](https://img.shields.io/badge/Status-in%20Entwicklung-orange.svg)](#projektstatus)

</div>

---

> ### Projektstatus
>
> **Dieses Projekt befindet sich in aktiver Entwicklung und hat noch kein
> erstes Release.** Was bereits funktioniert und durch automatisierte Tests
> **und** einen echten Docker-Build-und-Start-Lauf verifiziert ist:
>
> - Der Compose-Stack baut und startet zuverlässig (Spoolman + Labeler +
>   CUPS-Sidecar), alle Healthchecks werden gesund.
> - Filamente, Hersteller und Spulen lassen sich über die Spoolman-API anlegen
>   (`POST /api/workflows/create-only`), inklusive Idempotenz und mehrerer
>   identischer Spulen in einem Durchgang.
> - Etiketten werden serverseitig als PDF gerendert (physische mm-Maße,
>   QR-Code im Spoolman-kompatiblen Format), sandboxed ohne Netzwerkzugriff.
>
> **Was noch fehlt:** Die eigentliche CUPS-Druckanbindung (Warteschlange,
> Übermittlung, Statusabfrage) sowie die Weboberfläche für den Hauptworkflow,
> Einstellungen, Vorlagenverwaltung und Druckhistorie sind Platzhalter. Es
> gibt derzeit **kein veröffentlichtes Container-Image** — der Stack wird aus
> dem Quelltext gebaut (`docker compose up -d --build`).
>
> Den vollständigen, laufend aktualisierten Stand findest du in
> [`docs/status.md`](docs/status.md).

---

## Worum geht es?

Spoolman verwaltet Filamentbestände hervorragend — aber der Weg von „Paket
geöffnet“ zu „Rolle beschriftet im Regal“ besteht aus vielen kleinen
Handgriffen: Filament suchen oder anlegen, Spule erfassen, ID notieren,
Etikettenprogramm öffnen, Daten abtippen, drucken.

Spoolman Labeler macht daraus einen Vorgang:

```text
Filament auswählen oder neu anlegen
        ↓
Spulendaten eingeben  (auch mehrere identische Spulen auf einmal)
        ↓
In Spoolman speichern  →  jede Spule bekommt ihre eigene ID
        ↓
Etikett aus Vorlage rendern  (HTML/CSS → PDF, exakte mm-Maße, QR-Code)
        ↓
Über CUPS drucken  →  Ergebnis wird protokolliert
```

Spoolman bleibt dabei das führende Inventarsystem. Spoolman Labeler
kommuniziert ausschließlich über die offizielle REST-API und schreibt
**niemals** direkt in die Spoolman-Datenbank.

---

## Geplante Funktionen (MVP)

| Bereich     | Funktion                                                               |
| ----------- | ---------------------------------------------------------------------- |
| Workflow    | Filament suchen, neu anlegen, Spule(n) erfassen, speichern und drucken |
| Mengen      | Mehrere identische Spulen — jede mit eigener Spoolman-ID und Etikett   |
| Etiketten   | HTML/CSS-Vorlagen mit Jinja2-Platzhaltern, PDF-Ausgabe in exakten mm   |
| QR-Codes    | Verweis auf die konkrete Spule in der Spoolman-Weboberfläche          |
| Drucken     | Serverseitig über CUPS, USB- und Netzwerkdrucker, kein Browser-Dialog  |
| Robustheit  | Idempotenz gegen Doppelklicks, Wiederholungsdruck ohne neue Spulen     |
| Historie    | Druckaufträge mit Status, Fehlern und erneutem Druck                   |
| Vorlagen    | Anlegen, bearbeiten, duplizieren, importieren, exportieren, testen     |
| Darstellung | Light und Dark Mode, responsiv, an Spoolman angelehnt                 |

Was **nicht** zum ersten Release gehört (grafischer Etikettendesigner, RFID,
Benutzerverwaltung, native Druckertreiber und mehr), ist in
[`docs/architecture.md`](docs/architecture.md) festgehalten.

---

## Architektur im Überblick

```text
                    Docker-Host
   ┌──────────────────────────────────────────────────┐
   │                                                  │
   │  ┌────────────────┐      ┌────────────────────┐  │
   │  │   spoolman     │      │  spoolman-labeler  │  │
   │  │                │◀─────│                    │  │
   │  │  Port 7912     │ REST │  Port 7913         │  │
   │  │  → intern 8000 │  v1  │                    │  │
   │  │                │      │  • Weboberfläche   │  │
   │  │  Inventar-     │      │  • SQLite (/data)  │  │
   │  │  datenbank     │      │  • Vorlagen        │  │
   │  └────────────────┘      │  • PDF-Renderer    │  │
   │                          └─────────┬──────────┘  │
   │                                    │ IPP         │
   │                          ┌─────────▼──────────┐  │
   │                          │       CUPS         │  │
   │                          │     Port 631       │  │
   │                          └─────────┬──────────┘  │
   └────────────────────────────────────┼─────────────┘
                                        │
                                 ┌──────▼───────┐
                                 │ Etiketten-   │
                                 │ drucker      │
                                 └──────────────┘
```

**Zuständigkeiten sind sauber getrennt:**

- **Spoolman** besitzt Hersteller, Filamente, Spulen, Gewichte, Lagerorte.
- **Spoolman Labeler** besitzt Drucker, Vorlagen, Druckaufträge, Historie und
  die eigenen Einstellungen. Es hält keine Schattenkopie des Inventars.

Die Details stehen in [`docs/architecture.md`](docs/architecture.md).

---

## Dokumentation

| Dokument                                                          | Inhalt                                     |
| ----------------------------------------------------------------- | ------------------------------------------ |
| [`docs/status.md`](docs/status.md)                                 | Aktueller Stand und nächste Schritte       |
| [`docs/architecture.md`](docs/architecture.md)                     | Architekturentscheidungen und Begründungen |
| [`docs/deployment.md`](docs/deployment.md)                         | Betrieb, CUPS-Varianten, Backup, Update    |
| [`docs/spoolman-api-analysis.md`](docs/spoolman-api-analysis.md)   | Untersuchung der Spoolman-REST-API         |
| [`docs/ui-analysis.md`](docs/ui-analysis.md)                       | Untersuchung der Spoolman-Weboberfläche    |
| [`docs/printing-architecture.md`](docs/printing-architecture.md)   | CUPS-Integration und Druckwege             |
| [`CONTRIBUTING.md`](CONTRIBUTING.md)                               | Branch-Modell, Commits, Release-Prozess    |
| [`SECURITY.md`](SECURITY.md)                                       | Sicherheitsmodell und Meldeweg             |

---

## Voraussetzungen

- Linux-Host mit Docker und Docker Compose (v2)
- Eine laufende Spoolman-Instanz — oder du startest sie aus dem mitgelieferten
  Compose-Beispiel gleich mit
- Ein Etikettendrucker, der über CUPS ansprechbar ist (USB oder Netzwerk)
- **Architektur:** Der Build ist für `linux/amd64` **und** `linux/arm64`
  ausgelegt (alle Python-Abhängigkeiten bringen `cp313`-Wheels für beide
  mit, siehe Dockerfile-Kommentar). Automatisiert verifiziert ist bislang
  jedoch nur `amd64` — der CI-Runner baut nicht für `arm64`. Auf einem
  Raspberry Pi o. Ä. bitte den ersten Build beobachten
  (`docker compose build --progress=plain`) und Auffälligkeiten melden.

---

## Schnellstart

```bash
git clone https://github.com/sfcdx/spoolman-labeler.git
cd spoolman-labeler
cp .env.example .env
```

**Vor dem Start in `.env` mindestens `CUPS_PASSWORD` setzen** — der Stack
startet sonst absichtlich nicht:

```dotenv
CUPS_PASSWORD=<ein-sicheres-passwort>   # z. B. mit: openssl rand -base64 24
```

Dann bauen und starten:

```bash
docker compose up -d --build
```

Danach erreichbar:

```text
Spoolman          http://SERVER-IP:7912
Spoolman Labeler  http://SERVER-IP:7913
CUPS-Weboberfläche http://127.0.0.1:631   (nur vom Docker-Host aus, siehe unten)
```

Alle drei Dienste starten mit dem Default-Profil `spoolman,cups` automatisch
mit. Läuft Spoolman bereits an anderer Stelle oder soll CUPS auf dem Host
statt im Container laufen, steht die Umschaltung — ausschließlich über
`.env`, ohne die Compose-Datei anzufassen — in
[`docs/deployment.md`](docs/deployment.md).

Ob der Stack gesund ist, zeigt:

```bash
curl http://SERVER-IP:7913/api/health
```

---

## Sicherheitshinweis

Spoolman Labeler ist für den Betrieb im **lokalen Netzwerk** gedacht und
bringt **keine eigene Benutzeranmeldung** mit. Exponiere Port `7913` nicht
ins Internet. Details und Empfehlungen stehen in [`SECURITY.md`](SECURITY.md).

---

## Mitmachen

Beiträge sind willkommen. Bitte lies vorher
[`CONTRIBUTING.md`](CONTRIBUTING.md) — dort stehen Branch-Modell,
Commit-Konventionen und der Release-Prozess.

Eine Regel vorab: **Keine personenbezogenen Daten, Zugangsdaten, echten
Hostnamen oder IP-Adressen** in Code, Issues, Screenshots oder Testdaten.

---

## Lizenz

[MIT](LICENSE) — © 2026 Spoolman Labeler Contributors

Dieses Projekt ist ein eigenständiges Begleitwerkzeug und weder von den
Spoolman-Entwicklern betrieben noch offiziell mit ihnen verbunden.
