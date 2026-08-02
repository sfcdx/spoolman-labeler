# Patch-Serie für den Spoolman-Upstream-Vorschlag

Diese vier Patches ergänzen [Spoolman](https://github.com/Donkie/Spoolman) um
serverseitiges Etikettendrucken. Sie liegen hier, damit die Arbeit nicht nur in
einem kurzlebigen Container existiert — der eigentliche Weg ist ein Fork plus
Pull Request (siehe [`../docs/upstream-plan.md`](../docs/upstream-plan.md) und
den fertigen PR-Text in [`../docs/upstream-pr-body.md`](../docs/upstream-pr-body.md)).

## Anwenden

```bash
git clone https://github.com/<dein-account>/Spoolman.git
cd Spoolman
git checkout -b feature/server-side-printing
git am /pfad/zu/upstream-patches/*.patch
```

Basis ist Spoolmans `master` zum Stand des Commits `9d53a3f` (Merge von
PR #1008). Bei neuerem Upstream kann `git am` an den beiden angefassten
Bestandsdateien (`client_v2/src/lib/components/AddSpoolModal.svelte`,
`.../PrintLayoutPanel.svelte`) anecken — die Konflikte sind klein, weil pro
Datei nur ein Button und wenige Zeilen hinzukommen.

## Inhalt

| Patch | Inhalt |
|---|---|
| 0001 | Minimaler IPP-Client (RFC 8011) auf Basis von `httpx` — bewusst kein `pycups`, damit keine neue Systemabhängigkeit ins Docker-Image kommt |
| 0002 | `printer`-Tabelle, Alembic-Migration, CRUD-API, Warteschlangen-Discovery, Erreichbarkeitstest, Druck-Endpunkt |
| 0003 | Druckereinstellungen in der Svelte-Oberfläche und ein zusätzlicher Druck-Button auf der Etikettenseite |
| 0004 | „Anlegen und Etiketten drucken" im bestehenden Spulen-Dialog |

## Stand der Verifikation

- Backend: 239 Tests grün, Ruff und Ruff-Format sauber.
- Der IPP-Client wurde gegen einen **echten** CUPS-Server geprüft: Warteschlangen-
  Discovery, Druckerstatus, Auftrag einreichen und Status bis „completed"
  verfolgen. Der zugehörige Test (`tests/test_ipp_live.py`) ist opt-in und wird
  ohne gesetzte Umgebungsvariable `SPOOLMAN_TEST_IPP_HOST` übersprungen.
- Frontend: 105 Tests grün, ESLint und Prettier sauber. Drei Tests in
  `src/lib/utils/library.test.ts` schlagen fehl, **auch im unveränderten
  Upstream** — die Entwicklungsumgebung konnte Paraglides inlang-Plugins nicht
  vom CDN laden, wodurch leere Übersetzungen kompiliert wurden. In einer
  Umgebung mit Internetzugang tritt das nicht auf.

## Grundsatz

Alle Änderungen sind additiv: 2731 eingefügte, 4 gelöschte Zeilen — und diese
vier sind erweiterte, nicht entfernte Zeilen (eine Importliste, eine
Funktionssignatur, ein Schleifenrumpf, ein Router-Import). Wer keinen Drucker
einrichtet, sieht keine Verhaltensänderung; die neuen Bedienelemente erscheinen
gar nicht erst.
