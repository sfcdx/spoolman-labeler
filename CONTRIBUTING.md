# Beitragen zu Spoolman Labeler

Danke für dein Interesse! Dieses Dokument beschreibt, wie das Repository
organisiert ist und wie Änderungen den Weg in ein Release finden.

---

## Verhaltensgrundsatz

Sei freundlich und sachlich. Kritik gilt dem Code, nicht der Person.

---

## Branch-Modell

Das Projekt verwendet ein bewusst schlankes Modell mit zwei dauerhaften
Branches:

| Branch    | Zweck                                                      | Geschützt | Docker-Tag |
| --------- | ---------------------------------------------------------- | --------- | ---------- |
| `main`    | Immer veröffentlichungsfähig. Nur getestete Releases.       | ja        | `latest`   |
| `develop` | Integrationsbranch. Hier laufen alle Features zusammen.     | ja        | `edge`     |

Alle Arbeit passiert in kurzlebigen Branches, die von `develop` abzweigen:

```text
feat/<kurzbeschreibung>      Neue Funktion
fix/<kurzbeschreibung>       Fehlerbehebung
docs/<kurzbeschreibung>      Nur Dokumentation
chore/<kurzbeschreibung>     Build, CI, Abhängigkeiten
refactor/<kurzbeschreibung>  Umbau ohne Verhaltensänderung
```

Ausnahme: **Hotfixes** für ein veröffentlichtes Release zweigen direkt von
`main` ab (`hotfix/<beschreibung>`) und werden nach dem Merge in `main`
zusätzlich nach `develop` zurückgeführt.

```text
feat/xyz ──▶ develop ──▶ release/1.2.0 ──▶ main ──▶ Tag v1.2.0
                  ▲                                    │
                  └──────────── back-merge ────────────┘
```

### Regeln

1. Niemals direkt auf `main` oder `develop` pushen — immer über Pull Request.
2. Ein Pull Request braucht grüne CI und mindestens ein Review.
3. Pull Requests werden **squash-merged**, damit die Historie lesbar bleibt.
   Ausnahme: Release- und Hotfix-Merges nach `main` behalten ihre Historie.
4. Der Branch wird nach dem Merge gelöscht.

---

## Commit-Konventionen

Wir folgen [Conventional Commits](https://www.conventionalcommits.org/).
Daraus wird der Changelog automatisch erzeugt.

```text
<typ>(<bereich>): <kurzbeschreibung im Imperativ>

<optionaler Fließtext>

<optionale Footer, z.B. BREAKING CHANGE: ...>
```

Erlaubte Typen: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`,
`build`, `ci`, `chore`, `revert`.

Übliche Bereiche: `backend`, `frontend`, `printing`, `rendering`, `spoolman`,
`templates`, `docker`, `ci`, `docs`.

Beispiele:

```text
feat(printing): CUPS-Job-Status über IPP abfragen
fix(rendering): Etikettenbreite in mm statt px berechnen
feat(spoolman)!: Mindestversion auf 0.22 anheben

BREAKING CHANGE: Ältere Spoolman-Versionen liefern kein `extra`-Feld.
```

---

## Release-Prozess

Versionierung nach [Semantic Versioning](https://semver.org/lang/de/):
`MAJOR.MINOR.PATCH`.

1. **Release-Branch anlegen**

   ```bash
   git switch develop && git pull
   git switch -c release/1.2.0
   ```

2. **Vorbereiten**
   - Version in `backend/pyproject.toml` und `frontend/package.json` anheben
   - `CHANGELOG.md` aus den Commits seit dem letzten Tag ergänzen
   - Dokumentation prüfen (README, `.env.example`, Compose-Beispiele)
   - Vollständigen Testlauf ausführen

3. **Pull Request `release/1.2.0` → `main`** stellen und mergen (kein Squash).

4. **Taggen**

   ```bash
   git switch main && git pull
   git tag -a v1.2.0 -m "Release 1.2.0"
   git push origin v1.2.0
   ```

   Der Tag löst den Release-Workflow aus: Multi-Arch-Image-Build,
   Veröffentlichung nach GHCR und Erstellung des GitHub-Releases.

5. **Zurückführen**

   ```bash
   git switch develop && git merge --no-ff main && git push
   ```

### Container-Tags

| Auslöser          | Tags                                       |
| ----------------- | ------------------------------------------ |
| Push auf `develop`| `edge`, `edge-<sha>`                       |
| Tag `v1.2.0`      | `1.2.0`, `1.2`, `1`, `latest`              |

`latest` zeigt immer auf das jüngste stabile Release, niemals auf `develop`.

---

## Entwicklungsumgebung

> Das Backend- und Frontend-Grundgerüst entsteht gerade. Sobald es steht,
> beschreibt `docs/development.md` das vollständige Setup und wird hier
> verlinkt.

Vor jedem Pull Request lokal ausführen:

```bash
make lint      # Ruff, ESLint, Prettier
make typecheck # mypy, tsc
make test      # pytest, vitest
```

---

## Keine personenbezogenen Daten im Repository

Das ist eine harte Regel, kein Richtwert:

- Keine echten `.env`-Dateien, Zugangsdaten, API-Keys oder Passwörter.
- Keine Datenbankdateien (`*.db`) — die enthalten echten Lagerbestand.
- Keine echten Hostnamen, internen IP-Adressen oder E-Mail-Adressen in Code,
  Kommentaren, Beispielen oder Screenshots. Nutze Platzhalter wie
  `192.0.2.10` (RFC 5737), `example.local` oder `SERVER-IP`.
- Screenshots vor dem Hochladen auf sichtbare Lagerorte, Chargennummern,
  Preise und Netzwerkinformationen prüfen.

Die CI führt bei jedem Pull Request einen Secret-Scan aus. Ein Fund
blockiert den Merge.

Falls doch einmal etwas durchrutscht: **nicht einfach einen Folge-Commit
machen** — der Wert bleibt in der Historie. Melde es über den in
[`SECURITY.md`](SECURITY.md) beschriebenen Weg, damit das Geheimnis rotiert
und die Historie bereinigt werden kann.

---

## Pull Requests

- Beschreibe **was** sich ändert und **warum**.
- Verlinke ein zugehöriges Issue, sofern vorhanden.
- Halte den PR fokussiert — ein Thema pro PR.
- Neue Funktionen brauchen Tests und aktualisierte Dokumentation
  (siehe „Definition of Done“ in [`docs/architecture.md`](docs/architecture.md)).
