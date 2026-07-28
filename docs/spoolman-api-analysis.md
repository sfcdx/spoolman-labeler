# Spoolman REST-API — Analyse für spoolman-labeler

**Stand der Recherche:** 2026-07-28
**Analysierter Branch:** `Donkie/Spoolman` @ `master`
**Spoolman-Version laut `pyproject.toml`:** `0.25.0`
**Methodik:** Der Quellcode wurde über `https://raw.githubusercontent.com/Donkie/Spoolman/master/<pfad>` abgerufen und direkt ausgewertet. Alle Zeilennummern in diesem Dokument beziehen sich auf diesen Snapshot vom 2026-07-28.

> **Wichtiger Hinweis zur OpenAPI-Spezifikation:** Die offizielle Doku-Seite `https://donkie.github.io/Spoolman/` und `https://donkie.github.io/Spoolman/openapi.json` waren aus dieser Umgebung **nicht abrufbar** (HTTP 403 vom Agent-Proxy bzw. CONNECT-Tunnel abgelehnt). Die Spezifikation liegt auch **nicht** als Datei im Repo (weder `docs/`, noch ein `gh-pages`-Branch — beide 404). Sie wird zur Release-Zeit generiert (siehe unten). **Alle Angaben in diesem Dokument stammen daher direkt aus dem Router- und Modell-Quellcode**, nicht aus einer gerenderten Spec. Wo das zu Unsicherheit führt, ist das unter „Offene Punkte" vermerkt.

---

## 1. Aufbau, Basis-Pfad und OpenAPI

### 1.1 Mounting und Basis-Pfad

Quelle: `spoolman/main.py:51-57`

Die v1-API ist eine eigenständige FastAPI-Sub-App, die unter `<base_path>/api/v1` gemountet wird:

```
app.mount(env.get_base_path() + "/api/v1", v1_app)
```

`base_path` kommt aus der Umgebungsvariable (Standard: leer). Für eine Standardinstallation gilt also: **`http://<host>:7912/api/v1/...`**.

Die Sub-App selbst (Quelle: `spoolman/api/v1/router.py:22-34`) trägt:

| Attribut | Wert |
|---|---|
| `title` | `Spoolman REST API v1` |
| `version` | `1.0.0` (fix, unabhängig von der App-Version) |

Die äußere App (`spoolman/main.py:51-55`) trägt `title="Spoolman"` und `version=env.get_version()` (also `0.25.0`).

Zusätzlich existieren (nicht Teil von `/api/v1`):
- `GET <base_path>/metrics` — Prometheus-Metriken (`spoolman/main.py:60-71`)
- `GET <base_path>/config.js` — dynamische JS-Config für das Frontend (`spoolman/main.py:85-99`)

### 1.2 Wie die OpenAPI-Spec erzeugt wird

Quelle: `.github/workflows/apidocs.yml`, `pyproject.toml:39-41`

Der Workflow läuft bei `release: [published]` bzw. `workflow_dispatch`, führt `poe generate-docs` aus (Task-Definition: `script = "spoolman.docs:generate_docs"`) und lädt das Verzeichnis `docs/` als GitHub-Pages-Artefakt hoch. Es gibt also **keinen `gh-pages`-Branch** und keine eingecheckte `openapi.json` — die Spec existiert nur als Build-Artefakt auf `donkie.github.io/Spoolman/`.

**Praxis-Empfehlung:** Da Spoolman FastAPI ist, liefert jede laufende Instanz die Spec selbst aus. Erwartbar unter `http://<host>:7912/api/v1/openapi.json` (FastAPI-Default für eine Sub-App). *Nicht verifiziert* — siehe „Offene Punkte".

### 1.3 CORS

Quelle: `spoolman/main.py:106-133`

CORS ist standardmäßig **aus**. Aktivierung über `SPOOLMAN_CORS_ORIGIN` (kommagetrennte Liste). Im Debug-Modus wird `*` erlaubt. Relevant für uns: `expose_headers=["X-Total-Count"]` — der Paginierungs-Header ist bei aktiviertem CORS also auch aus dem Browser lesbar.

---

## 2. Authentifizierung

**Es gibt keine Authentifizierung. Kein API-Key, kein Token, kein Basic-Auth, keine Session, keine Rechteverwaltung.**

Belege:
- `spoolman/main.py` enthält ausschließlich `GZipMiddleware` und optional `CORSMiddleware` — keine Auth-Middleware, kein `Depends(Security(...))`, keine `HTTPBearer`/`APIKeyHeader`-Instanz.
- `spoolman/api/v1/router.py` registriert keine `dependencies=[...]` auf App-Ebene.
- Kein einziger Endpoint in `vendor.py`, `filament.py`, `spool.py`, `field.py`, `other.py`, `setting.py`, `export.py`, `externaldb.py` hat eine Security-Dependency.
- Ein Grep über `main.py` und `env.py` nach `auth|api_key|apikey|token|password|basic|bearer` liefert nur Treffer zum **Datenbank**-Passwort (`SPOOLMAN_DB_PASSWORD`, `SPOOLMAN_DB_PASSWORD_FILE`, `spoolman/env.py:139-170`) und zu CORS.
- Das README verweist auf die REST-API, erwähnt aber keinerlei Authentifizierung.

**Konsequenz für spoolman-labeler:** Wir brauchen kein Credential-Handling. Wer die Spoolman-URL erreicht, hat vollen Lese- **und Schreibzugriff** inkl. `DELETE`. Ein optionales Feld für einen vorgeschalteten Reverse-Proxy-Header (z.B. Basic-Auth) wäre eine reine Eigenleistung auf unserer Seite.

---

## 3. Vendors — `/api/v1/vendor`

Quelle: `spoolman/api/v1/vendor.py`, Modell `spoolman/api/v1/models.py:66-105`

### 3.1 Response-Schema `Vendor`

Quelle: `models.py:66-105`

| Feld | Typ | Constraints | Anmerkung |
|---|---|---|---|
| `id` | `int` | — | **read-only**, vom Server vergeben |
| `registered` | `string` (ISO-8601, UTC, `Z`-Suffix) | — | **read-only**, vom Server gesetzt |
| `name` | `string` | `max_length=64` | |
| `comment` | `string \| null` | `max_length=1024` | |
| `empty_spool_weight` | `float \| null` | `>= 0` | Gramm |
| `external_id` | `string \| null` | `max_length=256` | ID in externer Datenbank |
| `extra` | `dict[str, string]` | — | Werte sind **JSON-kodierte Strings**, s. Abschnitt 7.2 |

Das Datumsformat wird von `datetime_to_str` erzeugt (`models.py:14-21`): ISO-8601, `+00:00` wird durch `Z` ersetzt, z.B. `2026-07-28T12:34:56Z`.

### 3.2 `GET /api/v1/vendor` — Liste/Suche

Quelle: `vendor.py:67-156`

| Query-Parameter | Typ | Default | Bedeutung |
|---|---|---|---|
| `name` | `string` | — | Teilstring, case-insensitive. Mehrere Terme kommagetrennt. `"…"` = exakte Suche. |
| `external_id` | `string` | — | Exakter Match, kommagetrennt. Leerstring = ohne External-ID. |
| `sort` | `string` | — | `"feld:richtung"`, kommagetrennt, z.B. `name:asc,id:desc` |
| `limit` | `int \| null` | `null` | max. Anzahl |
| `offset` | `int` | `0` | Offset |
| `extra.<key>` | `string` | — | Filter auf Custom Field, s. Abschnitt 7.3 (`vendor.py:128-134`) |

- **Response:** `200`, JSON-Array von `Vendor`. `null`-Felder werden **weggelassen** (`exclude_none=True`, `vendor.py:151-154`).
- **Paginierung:** Header `x-total-count` mit der Gesamtzahl der Treffer (`vendor.py:155`).
- **Fehler:** `400` mit `{"message": "..."}` bei ungültigem Filter/Sortierfeld (`vendor.py:146-147`).
- Auf demselben Pfad läuft ein **WebSocket** für Change-Events (`vendor.py:159-174`).

### 3.3 `GET /api/v1/vendor/{vendor_id}`

Quelle: `vendor.py:177-192`. Response `200` = `Vendor`; `404` = `{"message": "No vendor with ID … found."}`.

### 3.4 `POST /api/v1/vendor` — Anlegen

Quelle: `vendor.py:214-242`, Body-Modell `VendorParameters` (`vendor.py:27-52`)

| Body-Feld | Typ | Pflicht? | Default | Constraints |
|---|---|---|---|---|
| `name` | `string` | **JA** | — | `max_length=64` |
| `comment` | `string \| null` | nein | `null` | `max_length=1024` |
| `empty_spool_weight` | `float \| null` | nein | `null` | `>= 0` |
| `external_id` | `string \| null` | nein | `null` | `max_length=256` |
| `extra` | `dict[str,string] \| null` | nein | `null` | Werte JSON-kodiert |

**Einziges Pflichtfeld: `name`.** `id` und `registered` dürfen **nicht** gesetzt werden (sie sind nicht Teil von `VendorParameters`; FastAPI/Pydantic ignoriert unbekannte Felder im Default hier stillschweigend).

Response `200` = angelegter `Vendor`. Fehler `400` mit `{"message": ...}`, wenn `extra` ungültige Keys/Typen enthält (`vendor.py:226-231`).

### 3.5 `PATCH /api/v1/vendor/{vendor_id}` — Ändern

Quelle: `vendor.py:245-279`, Body-Modell `VendorUpdateParameters` (`vendor.py:55-64`)

Identisch zu `VendorParameters`, aber `name` ist optional. Es gilt: **nur explizit gesendete Felder werden geändert** (`model_dump(exclude_unset=True)`, `vendor.py:264`). Ein explizit gesendetes `"name": null` wird durch einen Validator abgelehnt (`vendor.py:58-64`) → `422`.

`extra` bei Vendor-PATCH ersetzt die Extra-Felder **vollständig** (`spoolman/database/vendor.py:120-121`: `vendor.extra = [...]`).

Fehler: `400` (ungültige Extra-Felder), `404` (Vendor existiert nicht).

### 3.6 `DELETE /api/v1/vendor/{vendor_id}`

Quelle: `vendor.py:282-295`. Response `200` = `{"message": "Success!"}`. `404` falls nicht vorhanden. Filamente, die auf den Vendor zeigen, behalten ihr `vendor`-Attribut **nicht** — es wird geleert (laut Endpoint-Beschreibung, `vendor.py:285-287`).

---

## 4. Filaments — `/api/v1/filament`

Quelle: `spoolman/api/v1/filament.py`, Modell `models.py:115-235`

### 4.1 Response-Schema `Filament`

Quelle: `models.py:115-235`

| Feld | Typ | Constraints | Anmerkung |
|---|---|---|---|
| `id` | `int` | — | **read-only** |
| `registered` | `string` (ISO-8601 UTC) | — | **read-only** |
| `name` | `string \| null` | `max_length=64` | |
| `vendor` | `Vendor \| null` | — | **eingebettetes Objekt** (nicht `vendor_id`!) |
| `material` | `string \| null` | `max_length=64` | z.B. `PLA` |
| `price` | `float \| null` | `>= 0` | |
| `density` | `float` | `> 0` | g/cm³, immer gesetzt |
| `diameter` | `float` | `> 0` | mm, immer gesetzt |
| `weight` | `float \| null` | `> 0` | Netto-Filamentgewicht einer vollen Spule, g |
| `spool_weight` | `float \| null` | `>= 0` | Leergewicht der Spule, g |
| `article_number` | `string \| null` | `max_length=64` | |
| `comment` | `string \| null` | `max_length=1024` | |
| `settings_extruder_temp` | `int \| null` | `>= 0` | °C |
| `settings_bed_temp` | `int \| null` | `>= 0` | °C |
| `color_hex` | `string \| null` | `min_length=6`, `max_length=8` | s. Abschnitt 7.4 |
| `multi_color_hexes` | `string \| null` | `min_length=6` | kommagetrennte Hex-Codes |
| `multi_color_direction` | `"coaxial" \| "longitudinal" \| null` | Enum | `models.py:108-112` |
| `external_id` | `string \| null` | `max_length=256` | |
| `extra` | `dict[str,string]` | — | JSON-kodierte Werte |

**Wichtig:** Im Response steht `vendor` als vollständiges Objekt, im Request-Body dagegen `vendor_id` als Integer. Asymmetrie beachten.

### 4.2 `GET /api/v1/filament` — Liste/Suche (alle Filterparameter)

Quelle: `filament.py:188-379`

| Query-Parameter | Typ | Default | Bedeutung |
|---|---|---|---|
| `vendor.name` | `string` | — | Teilstring-Suche im Vendor-Namen, kommagetrennt, `""` = ohne Vendor-Name, `"…"` = exakt |
| `vendor.id` | `string` | — | Exakte Vendor-IDs, kommagetrennt. `-1` = Filamente ohne Vendor. Pattern `^-?\d+(,-?\d+)*$` |
| `name` | `string` | — | Teilstring im Filamentnamen, kommagetrennt, `""` = ohne Namen, `"…"` = exakt |
| `material` | `string` | — | Teilstring im Material, kommagetrennt, `""` = ohne Material, `"…"` = exakt |
| `article_number` | `string` | — | Teilstring in der Artikelnummer, gleiche Syntax |
| `external_id` | `string` | — | External-IDs, kommagetrennt, `""` = ohne External-ID |
| `color_hex` | `string` | — | **Farbähnlichkeitssuche.** Im Quellcode explizit als „Slow operation!" markiert (`filament.py:279-285`) |
| `color_similarity_threshold` | `float` | `20.0` | `0.0`–`100.0`; `0` = nur exakt gleiche Farbe |
| `sort` | `string` | — | `"feld:richtung"`, kommagetrennt; unterstützt verschachtelte Felder, z.B. `vendor.name:asc,spool_weight:desc` |
| `limit` | `int \| null` | `null` | |
| `offset` | `int` | `0` | |
| `extra.<key>` | `string` | — | Custom-Field-Filter (`filament.py:346-352`) |
| `vendor_name` | `string` | — | **DEPRECATED**, Alias für `vendor.name` (`filament.py:206-209`) |
| `vendor_id` | `string` | — | **DEPRECATED**, Alias für `vendor.id` (`filament.py:210-219`) |

Die Farbsuche funktioniert über CIELAB-Delta-E (`spoolman/math.py:41-96`), nicht über String-Vergleich. Sie wird als separater Vorab-Query ausgeführt, der eine ID-Liste liefert (`filament.py:336-344`).

- **Response:** `200`, JSON-Array von `Filament`, `null`-Felder weggelassen.
- **Paginierung:** Header `x-total-count` (`filament.py:378`).
- **Fehler:** `400` `{"message": ...}` bei ungültigem Filter/Sort.

### 4.3 Filtersyntax im Detail

Quelle: `spoolman/database/utils.py:41-85`

Für **alle** Textfilter (`name`, `material`, `article_number`, `vendor.name`, `location`, `lot_nr`, …) gilt dieselbe Logik:

1. Der Wert wird an `,` gesplittet.
2. Die Teile werden mit **OR** verknüpft.
3. Leerer Teil (`""`) → `feld IS NULL OR feld = ''` (bei optionalen Feldern) bzw. `feld = ''`.
4. Teil in doppelten Anführungszeichen (`"PLA"`) → **exakter** Vergleich (`==`).
5. Sonst → `ILIKE '%teil%'` (Teilstring, case-insensitive).

Beispiele:

```
GET /api/v1/filament?material=PLA,PETG           → material LIKE %PLA% OR LIKE %PETG%
GET /api/v1/filament?material="PLA"              → material = 'PLA'   (URL-encoded: %22PLA%22)
GET /api/v1/filament?vendor.name=Polymaker&name=Charcoal
GET /api/v1/filament?vendor.id=1,2
GET /api/v1/filament?vendor.id=-1                → Filamente ohne Vendor
GET /api/v1/filament?name=                       → Filamente ohne Namen
```

**Achtung:** Die Anführungszeichen müssen URL-encodiert werden (`%22`). Verschiedene Filterparameter untereinander sind **AND**-verknüpft, die kommagetrennten Werte innerhalb eines Parameters **OR**-verknüpft.

Für Integer-Filter (`vendor.id`, `filament.id`) gilt einfaches `IN (…)` (`utils.py:88-110`), kein Fuzzy-Matching.

### 4.4 `GET /api/v1/filament/{filament_id}`

Quelle: `filament.py:400-415`. `200` = `Filament`, `404` = `{"message": ...}`.

### 4.5 `POST /api/v1/filament` — Anlegen

Quelle: `filament.py:437-477`, Body-Modell `FilamentParameters` (`filament.py:31-172`)

| Body-Feld | Typ | Pflicht? | Default | Constraints |
|---|---|---|---|---|
| `density` | `float` | **JA** | — | `> 0` |
| `diameter` | `float` | **JA** | — | `> 0` |
| `name` | `string \| null` | nein | `null` | `max_length=64` |
| `vendor_id` | `int \| null` | nein | `null` | — |
| `material` | `string \| null` | nein | `null` | `max_length=64` |
| `price` | `float \| null` | nein | `null` | `>= 0` |
| `weight` | `float \| null` | nein | `null` | `> 0` (Netto, g) |
| `spool_weight` | `float \| null` | nein | `null` | `>= 0` (Leergewicht, g) |
| `article_number` | `string \| null` | nein | `null` | `max_length=64` |
| `comment` | `string \| null` | nein | `null` | `max_length=1024` |
| `settings_extruder_temp` | `int \| null` | nein | `null` | `>= 0` |
| `settings_bed_temp` | `int \| null` | nein | `null` | `>= 0` |
| `color_hex` | `string \| null` | nein | `null` | 6 oder 8 Hex-Zeichen, optionales `#` |
| `multi_color_hexes` | `string \| null` | nein | `null` | ≥ 2 kommagetrennte Hex-Codes |
| `multi_color_direction` | `"coaxial"\|"longitudinal"\|null` | nein | `null` | nur zusammen mit `multi_color_hexes` |
| `external_id` | `string \| null` | nein | `null` | `max_length=256` |
| `extra` | `dict[str,string] \| null` | nein | `null` | JSON-kodierte Werte |

**Pflichtfelder beim Filament-Create: nur `density` und `diameter`.** Alles andere ist optional — auch `name`, `material` und `vendor_id`.

**Cross-Field-Validierung** (`filament.py:160-172`), alle Verstöße → HTTP `422`:
- `color_hex` **und** `multi_color_hexes` gleichzeitig → Fehler.
- `multi_color_hexes` mit weniger als 2 Farben → Fehler.
- `multi_color_hexes` ohne `multi_color_direction` → Fehler.
- `multi_color_direction` ohne `multi_color_hexes` → Fehler.

Response `200` = angelegtes `Filament`. `400` bei ungültigen Extra-Feldern (`filament.py:449-454`).

### 4.6 `PATCH /api/v1/filament/{filament_id}`

Quelle: `filament.py:480-514`, Body-Modell `FilamentUpdateParameters` (`filament.py:175-185`)

Wie `FilamentParameters`, aber `density` und `diameter` sind optional. Explizites `null` für diese beiden wird per Validator abgelehnt (`filament.py:179-185`) → `422`. Nur gesendete Felder werden geändert (`exclude_unset=True`, `filament.py:499`).

`extra` beim Filament-PATCH ersetzt die Extra-Felder **vollständig** (`spoolman/database/filament.py:186-187`).

Fehler: `400`, `404`.

### 4.7 `DELETE /api/v1/filament/{filament_id}`

Quelle: `filament.py:517-539`

`200` = `{"message": "Success!"}`.
**`403`** = `{"message": "Failed to delete filament, see server logs for more information."}` — tritt auf, wenn noch Spulen auf das Filament verweisen (`ItemDeleteError`).
`404` falls nicht vorhanden.

---

## 5. Spools — `/api/v1/spool`

Quelle: `spoolman/api/v1/spool.py`, Modell `models.py:238-366`

### 5.1 Response-Schema `Spool`

Quelle: `models.py:238-366`

| Feld | Typ | Constraints | Anmerkung |
|---|---|---|---|
| `id` | `int` | — | **read-only** |
| `registered` | `string` (ISO-8601 UTC) | — | **read-only** |
| `first_used` | `string \| null` | — | schreibbar |
| `last_used` | `string \| null` | — | schreibbar |
| `filament` | `Filament` | — | **eingebettetes Objekt**, immer vorhanden |
| `price` | `float \| null` | `>= 0` | |
| `remaining_weight` | `float \| null` | `>= 0` | **berechnet**, s. 5.6 |
| `initial_weight` | `float \| null` | `>= 0` | persistiert (Netto) |
| `spool_weight` | `float \| null` | `>= 0` | persistiert (Tara) |
| `used_weight` | `float` | `>= 0` | persistiert, immer vorhanden |
| `remaining_length` | `float \| null` | `>= 0` | **berechnet**, mm |
| `used_length` | `float` | `>= 0` | **berechnet**, mm |
| `location` | `string \| null` | `max_length=64` | |
| `lot_nr` | `string \| null` | `max_length=64` | |
| `comment` | `string \| null` | `max_length=1024` | |
| `archived` | `bool` | — | |
| `extra` | `dict[str,string]` | — | JSON-kodierte Werte |

### 5.2 `GET /api/v1/spool` — Liste/Suche

Quelle: `spool.py:114-323`

| Query-Parameter | Typ | Default | Bedeutung |
|---|---|---|---|
| `filament.name` | `string` | — | Teilstring, kommagetrennt, `""`/`"…"`-Syntax |
| `filament.id` | `string` | — | exakte IDs, kommagetrennt, Pattern `^-?\d+(,-?\d+)*$` |
| `filament.material` | `string` | — | Teilstring, kommagetrennt |
| `filament.vendor.name` | `string` | — | Teilstring, kommagetrennt |
| `filament.vendor.id` | `string` | — | exakte IDs, `-1` = Spulen mit Filament ohne Vendor |
| `location` | `string` | — | Teilstring, kommagetrennt, `""` = ohne Location |
| `lot_nr` | `string` | — | Teilstring, kommagetrennt |
| `allow_archived` | `bool` | **`false`** | `true` schließt archivierte Spulen ein |
| `sort` | `string` | — | z.B. `filament.name:asc,filament.vendor.id:asc,location:desc` |
| `limit` | `int \| null` | `null` | |
| `offset` | `int` | `0` | |
| `extra.<key>` | `string` | — | Custom-Field-Filter (`spool.py:289-295`) |
| `filament_name` | `string` | — | **DEPRECATED** → `filament.name` |
| `filament_id` | `string` | — | **DEPRECATED** → `filament.id` |
| `filament_material` | `string` | — | **DEPRECATED** → `filament.material` |
| `vendor_name` | `string` | — | **DEPRECATED** → `filament.vendor.name` |
| `vendor_id` | `string` | — | **DEPRECATED** → `filament.vendor.id` |

**Wichtig:** `allow_archived` ist standardmäßig `false`. Archivierte Spulen tauchen in der Liste ohne diesen Parameter **nicht** auf. `GET /api/v1/spool/{id}` liefert archivierte Spulen dagegen weiterhin aus (kein Filter im Einzelabruf, `spool.py:354-359`).

Response: `200`, Array von `Spool`, `null`-Felder weggelassen, Header `x-total-count` (`spool.py:322`). `400` bei ungültigem Filter/Sort.

### 5.3 `GET /api/v1/spool/{spool_id}`

Quelle: `spool.py:344-359`. `200` = `Spool`, `404` = `{"message": ...}`.

### 5.4 `POST /api/v1/spool` — Anlegen

Quelle: `spool.py:381-435`, Body-Modell `SpoolParameters` (`spool.py:32-90`)

| Body-Feld | Typ | Pflicht? | Default | Constraints |
|---|---|---|---|---|
| `filament_id` | `int` | **JA** | — | muss existieren, sonst `404` |
| `first_used` | `datetime \| null` | nein | `null` | wird nach UTC konvertiert |
| `last_used` | `datetime \| null` | nein | `null` | wird nach UTC konvertiert |
| `price` | `float \| null` | nein | `null` | `>= 0` |
| `initial_weight` | `float \| null` | nein | `null` | `>= 0`, Netto |
| `spool_weight` | `float \| null` | nein | `null` | `>= 0`, Tara |
| `remaining_weight` | `float \| null` | nein | `null` | `>= 0`, s. 5.6 |
| `used_weight` | `float \| null` | nein | `null` | `>= 0` |
| `location` | `string \| null` | nein | `null` | `max_length=64` |
| `lot_nr` | `string \| null` | nein | `null` | `max_length=64` |
| `comment` | `string \| null` | nein | `null` | `max_length=1024` |
| `archived` | `bool` | nein | **`false`** | |
| `extra` | `dict[str,string] \| null` | nein | `null` | JSON-kodierte Werte |

**Einziges Pflichtfeld beim Spool-Create: `filament_id`.**

Ein `POST /api/v1/spool` mit `{"filament_id": 42}` legt eine volle Spule an (`used_weight = 0`).

Fehler:
- `400` `{"message": "Only specify either remaining_weight or used_weight."}` wenn beide gesetzt sind (`spool.py:399-403`).
- `400` `{"message": ...}` bei ungültigen Extra-Feldern.
- `400` `{"message": "Failed to create spool, see server logs for more information."}` bei `ItemCreateError` — u.a. wenn `remaining_weight` ohne ableitbares `initial_weight` gesetzt wird (`spool.py:430-435`, `database/spool.py:66-73`).
- `404` wenn `filament_id` nicht existiert (durchgereicht von `filament.get_by_id`).

### 5.5 `PATCH /api/v1/spool/{spool_id}`

Quelle: `spool.py:438-487`, Body-Modell `SpoolUpdateParameters` (`spool.py:93-102`)

Wie `SpoolParameters`, aber `filament_id` optional; explizites `null` wird abgelehnt → `422`. Nur gesendete Felder werden geändert.

- `remaining_weight` und `used_weight` gleichzeitig → `400`.
- `remaining_weight` setzen erfordert ein bereits gesetztes `initial_weight`, sonst `400` (`database/spool.py:243-246`).

**Abweichendes `extra`-Verhalten beim Spool-PATCH:** Die Endpoint-Beschreibung sagt „all existing extra fields will be removed and replaced with the new ones" (`spool.py:445`), die Implementierung führt aber einen **Merge** durch — nur Keys, die im Request vorkommen, werden überschrieben, alle anderen bleiben erhalten (`database/spool.py:249-251`). Bei Filament und Vendor wird dagegen tatsächlich vollständig ersetzt. **Nicht auf das dokumentierte Verhalten verlassen** — für uns heißt das: beim Spool-PATCH `extra` immer vollständig mitsenden, wenn wir Ersetzungssemantik brauchen.

### 5.6 Gewichtslogik — der wichtigste Teil

Quellen: `spoolman/database/spool.py:37-98` (Create), `:228-256` (Update), `:372-...` (Measure), `models.py:319-366` (Response-Berechnung), `spoolman/math.py:8-38`

#### Persistierte Felder (in der DB, `database/models.py:62-84`)
`initial_weight`, `spool_weight`, `used_weight`. **Mehr nicht.**

#### Nicht persistiert, sondern jedes Mal berechnet
`remaining_weight`, `remaining_length`, `used_length`.

#### Ablauf beim Create (`database/spool.py:55-98`)

1. Filament wird über `filament_id` geladen (`404` falls nicht existent).
2. Ist `spool_weight` **nicht** im Body → Fallback auf `filament.spool_weight`.
3. Ist `initial_weight` **nicht** im Body → Fallback auf `filament.weight` (das Netto-Vollgewicht des Filamenttyps).
4. Dann:
   - `used_weight` gesetzt → wird direkt übernommen.
   - sonst `remaining_weight` gesetzt → `used_weight = max(initial_weight − remaining_weight, 0)`. **Voraussetzung:** `initial_weight` ist nach Schritt 3 nicht `null` und nicht `0`, sonst `ItemCreateError` → `400`.
   - sonst → `used_weight = 0` (Spule gilt als voll).

#### Berechnung im Response (`models.py:324-346`)

```
wenn spool.initial_weight is not None:
    remaining_weight = max(initial_weight − used_weight, 0)
sonst wenn filament.weight is not None:
    remaining_weight = max(filament.weight − used_weight, 0)
sonst:
    remaining_weight = null   (und remaining_length = null)

remaining_length = length_from_weight(remaining_weight, density, diameter)
used_length      = length_from_weight(used_weight, density, diameter)
```

Die Längenformel (`math.py:25-38`):
`länge_mm = (gewicht_g / dichte_g_cm3) * 1000 / (π * (durchmesser_mm/2)²)`

#### Begriffsklärung (kritisch, weil leicht zu verwechseln)

| Feld | Ebene | Bedeutung |
|---|---|---|
| `filament.weight` | Filament | **Netto**-Filamentgewicht einer vollen Spule dieses Typs (g) |
| `filament.spool_weight` | Filament | **Tara** — Leergewicht der Spule dieses Typs (g) |
| `spool.initial_weight` | Spule | **Netto** — Filamentmenge, die auf *dieser konkreten* Spule war (g) |
| `spool.spool_weight` | Spule | **Tara** dieser konkreten Spule (g) |
| `spool.used_weight` | Spule | verbrauchte Menge (g), persistiert |
| `spool.remaining_weight` | Spule | berechnet, nicht persistiert |
| `vendor.empty_spool_weight` | Vendor | Default-Tara des Herstellers (g) — wird **nicht** automatisch auf Filament/Spule vererbt |

#### Was darf man beim Create setzen?

- **Setzbar:** `initial_weight`, `spool_weight`, und **entweder** `remaining_weight` **oder** `used_weight` (nie beides).
- **Nicht setzbar / rein berechnet:** `remaining_length`, `used_length`.
- `remaining_weight` ist im Request ein *Eingabekomfort*, der intern sofort in `used_weight` umgerechnet und dann verworfen wird.

**Empfehlung für uns:** Für deterministisches Verhalten beim Anlegen immer `initial_weight` **und** `spool_weight` explizit mitgeben und den Verbrauch über `used_weight` (oder gar nicht) ausdrücken. Dann hängt nichts an Fallbacks aus dem Filament-Datensatz.

### 5.7 `PUT /api/v1/spool/{spool_id}/use` — Verbrauch buchen

Quelle: `spool.py:504-539`, Body `SpoolUseParameters` (`spool.py:105-107`)

| Body-Feld | Typ | Pflicht? | Anmerkung |
|---|---|---|---|
| `use_length` | `float \| null` | — | mm |
| `use_weight` | `float \| null` | — | g |

**Genau eines von beiden muss gesetzt sein.** Beide gesetzt → `400 {"message": "Only specify either use_weight or use_length."}`. Keines gesetzt → `400 {"message": "Either use_weight or use_length must be specified."}`.

Response `200` = aktualisierter `Spool`. `404` falls Spule nicht existiert.

### 5.8 `PUT /api/v1/spool/{spool_id}/measure` — Verbrauch per Waage

Quelle: `spool.py:542-566`, Body `SpoolMeasureParameters` (`spool.py:110-111`)

| Body-Feld | Typ | Pflicht? | Anmerkung |
|---|---|---|---|
| `weight` | `float` | **JA** | aktuelles **Brutto**-Gewicht der Spule (g), also inkl. Tara |

Response `200` = aktualisierter `Spool`. `400` `{"message": ...}` bei `SpoolMeasureError` (z.B. wenn weder auf Spule noch auf Filament ein `initial_weight`/`spool_weight` ableitbar ist, `database/spool.py:398-402`). `404` wenn Spule nicht existiert.

### 5.9 `DELETE /api/v1/spool/{spool_id}`

Quelle: `spool.py:490-501`. `200` = `{"message": "Success!"}`, `404` falls nicht vorhanden.

---

## 6. Custom Fields — `/api/v1/field`

Quelle: `spoolman/api/v1/field.py`, Definitionen `spoolman/extra_field_registry.py`

`{entity_type}` ist ein Enum mit exakt drei Werten (`extra_field_registry.py:23-26`): **`vendor`**, **`filament`**, **`spool`**.

### 6.1 `GET /api/v1/field/{entity_type}` — lesen

Quelle: `field.py:32-42`. Response `200` = Array von `ExtraField`.

### 6.2 Schema `ExtraField`

Quelle: `extra_field_registry.py:39-55`

| Feld | Typ | Pflicht? | Default | Anmerkung |
|---|---|---|---|---|
| `key` | `string` | ja (aus dem Pfad) | — | Pattern `^[a-z0-9_]+$`, Länge 1–64 |
| `entity_type` | `"vendor"\|"filament"\|"spool"` | ja (aus dem Pfad) | — | |
| `name` | `string` | **JA** | — | Anzeigename, Länge 1–128 |
| `field_type` | Enum | **JA** | — | s. Tabelle unten |
| `order` | `int` | nein | `0` | Sortierreihenfolge in der UI |
| `unit` | `string \| null` | nein | `null` | Länge 1–16 |
| `default_value` | `string \| null` | nein | `null` | **JSON-kodierter String** |
| `choices` | `list[string] \| null` | nur bei `choice` | `null` | min. 1 Eintrag |
| `multi_choice` | `bool \| null` | nur bei `choice` | `null` | |

**Feldtypen** (`extra_field_registry.py:29-37`) und die JSON-Form der Werte (`validate_extra_field_value`, `:58-108`):

| `field_type` | erwarteter JSON-Typ des Werts | Beispiel-Wert im `extra`-Dict |
|---|---|---|
| `text` | String | `"\"hello\""` |
| `integer` | Integer | `"42"` |
| `integer_range` | Array mit genau 2 Integers oder `null` | `"[1, 10]"` |
| `float` | Number (bool ausgeschlossen) | `"1.75"` |
| `float_range` | Array mit genau 2 Numbers oder `null` | `"[0.5, 2.5]"` |
| `datetime` | String | `"\"2026-07-28T10:00:00Z\""` |
| `boolean` | Boolean | `"true"` |
| `choice` (single) | String, muss in `choices` sein | `"\"rot\""` |
| `choice` (multi) | Array von Strings, alle in `choices` | `"[\"rot\",\"blau\"]"` |

### 6.3 `POST /api/v1/field/{entity_type}/{key}` — anlegen/ändern

Quelle: `field.py:45-72`. Body = `ExtraFieldParameters` (also **ohne** `key`/`entity_type`, die kommen aus dem Pfad).

Response `200` = **die komplette Liste** aller Extra-Felder dieses Entity-Typs (nicht nur das geänderte Feld).

Validierungsregeln (`extra_field_registry.py:111-129`, `:163-186`), Verstoß → `400 {"message": ...}`:
- `field_type == choice` → `choices` **und** `multi_choice` müssen gesetzt sein.
- `field_type != choice` → `choices` und `multi_choice` dürfen **nicht** gesetzt sein.
- `default_value` muss zum `field_type` passen.
- Bei Update eines bestehenden Feldes: `field_type` darf **nicht** geändert werden; `multi_choice` darf **nicht** geändert werden; bestehende `choices` dürfen **nicht** entfernt werden.

Der `key` im Pfad muss `^[a-z0-9_]+$` erfüllen (`field.py:59`) — sonst `422`.

### 6.4 `DELETE /api/v1/field/{entity_type}/{key}`

Quelle: `field.py:75-100`. Response `200` = restliche Feldliste. `404 {"message": "Extra field with key … does not exist for entity type …"}`.

**Achtung:** Beim Löschen einer Felddefinition werden **alle gespeicherten Werte** dieses Keys über alle Entities hinweg mitgelöscht (`extra_fields.py:64-71` → `clear_extra_field`). Das ist destruktiv und nicht rückgängig zu machen.

### 6.5 Speicherort

Custom-Field-**Definitionen** liegen nicht in einer eigenen Tabelle, sondern als JSON-Array in den Settings `extra_fields_vendor` / `extra_fields_filament` / `extra_fields_spool` (`spoolman/settings.py:68-70`, `extra_field_registry.py:145-160`). Sie werden serverseitig in `extra_field_cache` gecacht. Die **Werte** liegen in eigenen Tabellen `vendor_field` / `filament_field` / `spool_field` (`database/models.py:94-118`).

---

## 7. Besonderheiten

### 7.1 `null`-Felder werden aus Responses entfernt

Alle Endpunkte setzen `response_model_exclude_none=True`, die Listen-Endpunkte zusätzlich `jsonable_encoder(..., exclude_none=True)`. **Ein Feld mit Wert `null` fehlt in der JSON-Antwort komplett.** Unser Client muss also mit *fehlenden* Keys umgehen, nicht mit `null`-Werten. Beispiel: Ein Filament ohne Vendor liefert kein `"vendor": null`, sondern gar kein `vendor`-Key.

Laut Release-Notes zu v0.24.0 wurde dieses Verhalten auch auf die WebSocket-Nachrichten übertragen („unset fields are now omitted instead of sent as null, matching REST").

### 7.2 `extra`-Felder im JSON

Quelle: `models.py:24-36` (Docstring `_extra_fields_description`), `extra_field_registry.py:58-108`

`extra` ist auf der Leitung **immer** ein `dict[str, string]`. **Jeder Wert ist ein JSON-kodierter String**, unabhängig vom konfigurierten Feldtyp. Der Original-Kommentar im Code:

> „Every value in the `extra` map is a JSON-encoded string, regardless of the field's configured type. For example, an `integer` field returns `"42"` (not `42`) and a `text` field returns `"\"hello\""`. Consumers must JSON-decode each value to get the typed value."

Praktisch heißt das für einen Text-Custom-Field `label_id`:

```json
{
  "filament_id": 5,
  "extra": {
    "label_id": "\"ABC-123\"",
    "shelf_number": "7",
    "is_opened": "true"
  }
}
```

Also: **`json.dumps(wert)` vor dem Senden, `json.loads(wert)` nach dem Empfangen.** Ein einfacher String wird zu einem String *mit* Anführungszeichen. Wer das vergisst, bekommt bei Text-Feldern `400 {"message": "Invalid extra field for key …: Value is not a string."}` — bzw. bei einem nicht-JSON-parsbaren Wert `"Value is not valid JSON."`.

Unbekannte Keys → `400 {"message": "Unknown extra field <key>."}` (`extra_field_registry.py:135`).

### 7.3 Filtern nach Custom Fields

Quelle: `filament.py:346-352`, `spool.py:289-295`, `vendor.py:128-134`

Alle Query-Parameter, die mit `extra.` beginnen, werden als Custom-Field-Filter interpretiert. Der Präfix wird abgeschnitten, der Rest ist der Key:

```
GET /api/v1/spool?extra.shelf_number=7
GET /api/v1/filament?extra.label_id=ABC-123
```

Sortierung nach Custom Fields ist ebenfalls möglich (Feature aus v0.25.0, „Add filtering and sorting for custom fields"). Die genaue Sort-Syntax für Extra-Felder konnte ich nicht zweifelsfrei verifizieren — siehe „Offene Punkte".

### 7.4 Farbe: `color_hex` und `multi_color_hexes`

Quelle: Validator `filament.py:122-158`, Response-Constraints `models.py:173-197`, DB-Spalten `database/models.py:51-53`

**Validierung beim Schreiben** (`filament.py:122-139`):
- Leerstring/`null` → wird zu `null`.
- Ein führendes `#` wird für die Prüfung entfernt (`removeprefix("#")`).
- Erlaubte Zeichen: `0-9A-Fa-f`.
- Länge nach Entfernen des `#`: genau **6 oder 8** Zeichen (8 = mit Alpha-Kanal).

**Kritisch:** Der Validator gibt `return v` zurück — also den **Originalwert inklusive `#`**, nicht die normalisierte Form. Das `#` wird **nicht** entfernt und landet so in der Datenbank. Die DB-Spalte ist aber `String(8)` (`database/models.py:51`), und das Response-Modell erzwingt `min_length=6, max_length=8` (`models.py:173-182`).

Daraus folgt: `"#RRGGBBAA"` (9 Zeichen) passt weder in die Spalte noch durch die Response-Validierung. Auch `"#RRGGBB"` (7 Zeichen) belegt 7 von 8 Spalten-Zeichen.

> **Empfehlung für spoolman-labeler: `color_hex` immer OHNE `#` senden** (also `FF0000` bzw. `FF0000AA`) und beim Lesen defensiv ein eventuell vorhandenes `#` abschneiden, da ältere/fremde Datensätze es enthalten können.

**`multi_color_hexes`** existiert (`models.py:183-192`, `filament.py:95-103`): kommagetrennte Liste von Hex-Codes, DB-Spalte `String(128)`. Validierung pro Element wie oben. Regeln:
- `color_hex` und `multi_color_hexes` schließen sich gegenseitig aus.
- mindestens 2 Farben.
- `multi_color_direction` (`coaxial` | `longitudinal`) ist dann **Pflicht** und darf umgekehrt ohne `multi_color_hexes` nicht gesetzt sein.

Für die Farbähnlichkeitssuche werden beide Felder berücksichtigt (`database/filament.py:258-261`).

### 7.5 Paginierung

Quelle: `vendor.py:150-156`, `filament.py:373-379`, `spool.py:317-323`

- Der Body ist ein **flaches JSON-Array**, kein Wrapper-Objekt.
- Die Gesamtzahl steht im **Response-Header `x-total-count`** (kleingeschrieben gesetzt; HTTP-Header sind case-insensitive, das Frontend/CORS-Config nennt ihn `X-Total-Count`).
- Steuerung über `limit` (Default: unbegrenzt) und `offset` (Default `0`).
- Nur `/vendor`, `/filament` und `/spool` setzen diesen Header. `/material`, `/location` etc. nicht.

### 7.6 Sortierung

Syntax: `sort=<feld>:<asc|desc>` — mehrere Kriterien kommagetrennt. Die Richtung wird über `SortOrder[direction.upper()]` aufgelöst, ist also case-insensitive (`asc`/`ASC`). Verschachtelte Felder mit Punkt-Notation sind erlaubt, z.B. `vendor.name:asc`, `filament.vendor.id:asc`. Ein unbekanntes Feld führt zu `400` (der `ValueError` wird abgefangen); eine ungültige Richtung führt zu einem `KeyError` und damit vermutlich zu `500` (nicht verifiziert, siehe „Offene Punkte").

### 7.7 Archivierte Spulen

- `spool.archived` ist ein normales, schreibbares `bool`-Feld, Default `false` beim Create.
- `GET /api/v1/spool` blendet archivierte Spulen standardmäßig aus. Mit `?allow_archived=true` werden sie eingeschlossen.
- `GET /api/v1/spool/{id}` liefert archivierte Spulen immer aus.
- `GET /api/v1/export/spools` hat ebenfalls `allow_archived` (Default `false`, `api/v1/export.py:33-42`).

### 7.8 Zeitstempel

Alle Datums-Ausgaben laufen über `datetime_to_str` (`models.py:14-21`): naive Zeitstempel werden als UTC interpretiert, Ausgabe ISO-8601 mit `Z`-Suffix. Eingehende Zeitstempel (`first_used`, `last_used`) werden nach UTC konvertiert und tz-naiv gespeichert (`database/spool.py:33-35, 76-79`).

### 7.9 WebSockets

Auf **jedem** Listen- und Detail-Pfad läuft parallel ein WebSocket, der Änderungsevents pusht — z.B. `ws://<host>/api/v1/spool` und `ws://<host>/api/v1/spool/{id}`. Zusätzlich gibt es einen Root-WebSocket auf `/api/v1/` für alle Änderungen (`router.py:88-103`).

Nachrichtenformat (`models.py:401-435`):

```json
{
  "type": "added" | "updated" | "deleted",
  "resource": "spool" | "filament" | "vendor" | "setting",
  "date": "2026-07-28T12:00:00Z",
  "payload": { ... }
}
```

In der OpenAPI-Spec sind diese als Pseudo-Statuscode **`299`** dokumentiert.

---

## 8. Health, Info und weitere Endpunkte

### 8.1 `GET /api/v1/health`

Quelle: `router.py:63-67`. Response `200`:

```json
{ "status": "healthy" }
```

Schema `HealthCheck` (`models.py:381-382`): ein Feld `status: str`.

### 8.2 `GET /api/v1/info`

Quelle: `router.py:46-60`, Schema `Info` (`models.py:369-378`)

| Feld | Typ | Beispiel |
|---|---|---|
| `version` | `string` | `"0.25.0"` |
| `debug_mode` | `bool` | `false` |
| `automatic_backups` | `bool` | `true` |
| `data_dir` | `string` | `"/home/app/.local/share/spoolman"` |
| `logs_dir` | `string` | `"/home/app/.local/share/spoolman"` |
| `backups_dir` | `string` | `"/home/app/.local/share/spoolman/backups"` |
| `db_type` | `string` | `"sqlite"` |
| `git_commit` | `string \| null` | `"a1b2c3d"` |
| `build_date` | `string \| null` (ISO-8601 UTC) | `"2021-01-01T00:00:00Z"` |

**Es gibt keinen separaten `/version`-Endpunkt.** Die Version kommt aus `/api/v1/info` → `version`. Für unser Kompatibilitäts-Handling ist das der Ort, an dem wir die Spoolman-Version prüfen sollten.

### 8.3 Hilfslisten (`other.py`)

Quelle: `spoolman/api/v1/other.py`

| Methode | Pfad | Response |
|---|---|---|
| `GET` | `/api/v1/material` | `list[string]`, alle distinct Materialien |
| `GET` | `/api/v1/article-number` | `list[string]`, alle Artikelnummern |
| `GET` | `/api/v1/lot-number` | `list[string]`, alle Lot-Nummern |
| `GET` | `/api/v1/location` | `list[string]`, alle Spool-Locations |
| `PATCH` | `/api/v1/location/{location}` | Body `{"name": "<neu>"}` (min. 1 Zeichen), Response: der neue Name als JSON-String. Benennt die Location aller betroffenen Spulen um. |

Diese Endpunkte haben keine Query-Parameter und keinen `x-total-count`-Header.

### 8.4 Nur kurz erwähnt: Backups, Settings, Export, External DB

**Backup** — `POST /api/v1/backup` (`router.py:71-85`). Nur für SQLite sinnvoll. Response `200` = `{"path": "<pfad zur backup-datei>"}`; `500` = `{"message": "Backup failed. …"}`. Kein Body erforderlich.

**Settings** — `spoolman/api/v1/setting.py`:
- `GET /api/v1/setting/` — alle Settings (mit Trailing Slash!)
- `GET /api/v1/setting/{key}` — ein Setting; liefert Default, wenn nicht gesetzt
- `POST /api/v1/setting/{key}` — Body ist der **rohe JSON-Wert** (kein Wrapper-Objekt). Leerer Body oder `null` setzt auf Default zurück. `400` bei Typmismatch, `404` bei unbekanntem Key.
- Response-Schema `SettingResponse` (`models.py:43-46`): `{"value": "<json-string>", "is_set": bool, "type": "boolean"|"number"|"string"|"array"|"object"}`.
- Bekannte Keys (`spoolman/settings.py:64-74`): `currency` (Default `"EUR"`), `round_prices` (`false`), `print_presets` (`[]`), `extra_fields_vendor|filament|spool` (`[]`), `base_url` (`""`), `locations` (`[]`), `locations_spoolorders` (`{}`).
- **Für uns interessant:** `print_presets` — hier liegen offenbar die Label-Druck-Presets des Spoolman-Frontends. Inhalt/Schema nicht untersucht.

**Export** — `spoolman/api/v1/export.py`:
- `GET /api/v1/export/spools?fmt=csv|json&allow_archived=false`
- `GET /api/v1/export/filaments?fmt=csv|json`
- `GET /api/v1/export/vendors?fmt=csv|json`
- `fmt` ist ein **Pflicht**-Query-Parameter (kein Default).

**External DB** — `spoolman/api/v1/externaldb.py`:
- `GET /api/v1/external/filament` — kuratierte Filament-Datenbank (statische JSON-Datei)
- `GET /api/v1/external/material` — kuratierte Material-Datenbank

---

## 9. Fehlerantworten

### 9.1 Format bei Fach-Fehlern: `{"message": "..."}`

Quelle: `models.py:39-40` (`class Message`), Exception-Handler `router.py:37-43`

Für `ItemNotFoundError` ist ein globaler Handler auf der v1-Sub-App registriert, der `404` mit `{"message": "<exception-text>"}` liefert. Alle explizit im Router erzeugten Fehler (`400`, `403`, `500`) nutzen dasselbe Schema.

| Status | Wann | Body |
|---|---|---|
| `400` | Ungültiger Filter/Sort; `remaining_weight` **und** `used_weight`; ungültige/unbekannte Extra-Felder; `ItemCreateError`; `SpoolMeasureError`; `use`-Endpoint mit 0 oder 2 Parametern; Setting-Typmismatch | `{"message": "..."}` |
| `403` | `DELETE /filament/{id}`, wenn noch Spulen darauf verweisen | `{"message": "Failed to delete filament, see server logs for more information."}` |
| `404` | Entity/Setting/Extra-Field existiert nicht | `{"message": "No spool with ID 42 found."}` |
| `500` | Backup fehlgeschlagen | `{"message": "Backup failed. See server logs for more information."}` |

### 9.2 Format bei Validierungsfehlern: `422`

Es ist **kein** eigener Handler für `RequestValidationError` registriert (weder in `main.py` noch in `api/v1/router.py`). Es gilt daher der **FastAPI-Standard**: HTTP `422 Unprocessable Entity` mit

```json
{
  "detail": [
    {
      "type": "greater_than",
      "loc": ["body", "density"],
      "msg": "Input should be greater than 0",
      "input": 0,
      "ctx": { "gt": 0 }
    }
  ]
}
```

`422` tritt auf bei: fehlendem Pflichtfeld, falschem Typ, verletzten `ge`/`gt`/`max_length`-Constraints, ungültigen Enum-Werten, ungültigem `color_hex`, den Cross-Field-Regeln zu Multi-Color, explizitem `null` auf `filament_id`/`density`/`diameter`/`name` im PATCH, und ungültigem `key`-Pattern bei Custom Fields.

> **Wichtig:** Der Body-Aufbau unterscheidet sich zwischen `422` (`detail`, Array) und `400`/`404` (`message`, String). Unser Fehler-Handling muss beide Formen kennen.

### 9.3 Nicht abgedeckt

Es gibt kein Rate-Limiting, keine `Retry-After`-Semantik und keine strukturierten Fehlercodes (nur freier Text in `message`). Fehlermeldungen sind **nicht** stabil genug, um darauf zu matchen — wir sollten auf Statuscodes reagieren, nicht auf Meldungstexte.

---

## 10. Versionierung und Kompatibilität

### 10.1 Aktuelle Version

| Quelle | Wert |
|---|---|
| `pyproject.toml:3` auf `master` | `version = "0.25.0"` |
| Neuestes GitHub-Release | `v0.25.0` |
| API-Sub-App `version` (`router.py:24`) | `1.0.0` — **konstant**, nicht zur Versionsprüfung geeignet |

> **Datums-Vorbehalt:** Die Recherche zum Release-Datum von v0.25.0 lieferte widersprüchliche Angaben („22. Juli 2024" beim direkten Abruf der Release-Seite vs. „vor ca. 5 Tagen / ~23. Juli 2026" laut Websuche). Bei aktuellem Datum 2026-07-28 ist die Websuch-Angabe plausibler. **Die Versionsnummer `0.25.0` ist gesichert, das Datum nicht.**

Zusätzlicher Hinweis: `pyproject.toml:59-60` enthält `[tool.bumpversion] current_version = "0.22.1"` — das steht im Widerspruch zu `version = "0.25.0"` in Zeile 3 und sieht nach einem nicht mitgepflegten Konfigurationsrest aus. Maßgeblich ist Zeile 3 bzw. das Release-Tag.

### 10.2 Relevante Änderungen der letzten Releases

| Version | Änderung | Relevanz für uns |
|---|---|---|
| `v0.25.0` | „Add filtering and sorting for custom fields" | **Hoch** — die `extra.<key>`-Query-Filter (Abschnitt 7.3) sind erst ab hier verlässlich vorhanden |
| `v0.25.0` | Docker-Fix armv7, K8s `SPOOLMAN_PORT`-Handling | keine |
| `v0.24.0` | WebSocket-Nachrichten lassen unset-Felder weg statt `null` — „matching REST". **Breaking**, falls wir WebSockets nutzen | mittel |
| `v0.24.0` | Konfigurierbares Sync-Intervall der External DB, Export archivierter Spulen | gering |
| `v0.23.1` | Fix für Paginierung der Filament-Liste | mittel, falls wir mit `limit`/`offset` arbeiten |
| `v0.23.0` | Python ≥ 3.10 erforderlich, Umstellung auf `uv`, Docker-Hub-Publikation | keine (serverseitig) |

Die Release-Notes wurden über die GitHub-Weboberfläche gelesen; ein Abruf über die GitHub-REST-API war in dieser Umgebung nicht möglich (403 vom Proxy). Die inhaltlichen Zusammenfassungen sind daher gerafft und sollten bei Bedarf am Original gegengeprüft werden.

### 10.3 Empfohlene Mindestversion für unser README

**Empfehlung: `Spoolman >= 0.25.0`.**

Begründung:
- Nur ab `0.25.0` sind Filterung und Sortierung nach Custom Fields (`extra.<key>`) garantiert verfügbar. Falls spoolman-labeler eine Label-ID o.ä. als Custom Field ablegt und danach sucht, ist das eine harte Anforderung.
- Ab `0.24.0` ist das Verhalten „unset statt null" zwischen REST und WebSocket konsistent, was unser Deserialisierungs-Handling vereinfacht.

**Alternative, falls wir bewusst ohne Custom-Field-Filter auskommen:** `>= 0.24.0`. Darunter würde ich nicht gehen.

**Nicht verifiziert:** In welchen konkreten Versionen `initial_weight`/`spool_weight` auf Spool-Ebene, der `/measure`-Endpunkt und der `x-total-count`-Header eingeführt wurden. Wer eine niedrigere Mindestversion angeben will, müsste das per `git log`/Release-Diff nachziehen. Siehe „Offene Punkte".

### 10.4 Robuste Versionsprüfung im Client

`GET /api/v1/info` → Feld `version` (SemVer-String). Das ist die einzig belastbare Quelle. `GET /api/v1/health` eignet sich nur als Erreichbarkeitscheck (liefert konstant `{"status":"healthy"}`).

---

## 11. Kurzreferenz: alle verifizierten Endpunkte

| Methode | Pfad | Zweck |
|---|---|---|
| `GET` | `/api/v1/health` | Healthcheck |
| `GET` | `/api/v1/info` | Version + Server-Infos |
| `POST` | `/api/v1/backup` | DB-Backup auslösen (SQLite) |
| `GET` | `/api/v1/vendor` | Vendors suchen |
| `POST` | `/api/v1/vendor` | Vendor anlegen |
| `GET` | `/api/v1/vendor/{id}` | Vendor lesen |
| `PATCH` | `/api/v1/vendor/{id}` | Vendor ändern |
| `DELETE` | `/api/v1/vendor/{id}` | Vendor löschen |
| `GET` | `/api/v1/filament` | Filamente suchen |
| `POST` | `/api/v1/filament` | Filament anlegen |
| `GET` | `/api/v1/filament/{id}` | Filament lesen |
| `PATCH` | `/api/v1/filament/{id}` | Filament ändern |
| `DELETE` | `/api/v1/filament/{id}` | Filament löschen (`403` falls in Benutzung) |
| `GET` | `/api/v1/spool` | Spulen suchen |
| `POST` | `/api/v1/spool` | Spule anlegen |
| `GET` | `/api/v1/spool/{id}` | Spule lesen |
| `PATCH` | `/api/v1/spool/{id}` | Spule ändern |
| `DELETE` | `/api/v1/spool/{id}` | Spule löschen |
| `PUT` | `/api/v1/spool/{id}/use` | Verbrauch nach Länge oder Gewicht buchen |
| `PUT` | `/api/v1/spool/{id}/measure` | Verbrauch aus Brutto-Wiegung ableiten |
| `GET` | `/api/v1/field/{entity_type}` | Custom Fields lesen |
| `POST` | `/api/v1/field/{entity_type}/{key}` | Custom Field anlegen/ändern |
| `DELETE` | `/api/v1/field/{entity_type}/{key}` | Custom Field löschen |
| `GET` | `/api/v1/material` | alle Materialien |
| `GET` | `/api/v1/article-number` | alle Artikelnummern |
| `GET` | `/api/v1/lot-number` | alle Lot-Nummern |
| `GET` | `/api/v1/location` | alle Locations |
| `PATCH` | `/api/v1/location/{location}` | Location umbenennen |
| `GET` | `/api/v1/setting/` | alle Settings |
| `GET` | `/api/v1/setting/{key}` | ein Setting |
| `POST` | `/api/v1/setting/{key}` | Setting setzen |
| `GET` | `/api/v1/export/spools` | Export (`fmt=csv\|json`) |
| `GET` | `/api/v1/export/filaments` | Export (`fmt=csv\|json`) |
| `GET` | `/api/v1/export/vendors` | Export (`fmt=csv\|json`) |
| `GET` | `/api/v1/external/filament` | externe Filament-DB |
| `GET` | `/api/v1/external/material` | externe Material-DB |
| `WS` | `/api/v1/` | alle Änderungen |
| `WS` | `/api/v1/{vendor\|filament\|spool\|setting}` | Änderungen je Ressourcentyp |
| `WS` | `/api/v1/{vendor\|filament\|spool}/{id}` | Änderungen an einer Entity |

---

## Offene Punkte / Unsicherheiten

1. **OpenAPI-Spec nicht direkt eingesehen.** `https://donkie.github.io/Spoolman/` und `.../openapi.json` waren aus dieser Umgebung nicht erreichbar (Proxy: `CONNECT tunnel failed, response 403`). Die Spec liegt nicht im Repo (`docs/` fehlt auf `master`, kein `gh-pages`-Branch — beide Pfade 404) und wird erst im Release-Workflow via `poe generate-docs` erzeugt. **Alle Angaben hier stammen aus dem Quellcode.** Die gerenderte Spec könnte in Details (z.B. exakte Beispielwerte, generierte Operation-IDs) abweichen — inhaltlich sollte sie aber identisch sein, da FastAPI sie aus genau diesen Modellen erzeugt.

2. **URL der Spec auf einer laufenden Instanz nicht verifiziert.** Erwartbar `http://<host>:7912/api/v1/openapi.json` bzw. `/api/v1/docs`, da die v1-App eine gemountete FastAPI-Sub-App ist. Sollte gegen eine echte Instanz getestet werden, bevor wir das im README nennen.

3. **`spoolman/docs.py` nicht gelesen.** Der Generator (`spoolman.docs:generate_docs`) wurde nicht abgerufen. Ob er die Spec zusätzlich modifiziert (z.B. Server-URLs, Beispiele), ist unklar.

4. **Sort-Syntax für Custom Fields.** Dass Sortierung nach Extra-Feldern in v0.25.0 hinzukam, geht aus den Release-Notes hervor. Die konkrete Syntax (vermutlich `sort=extra.<key>:asc`) habe ich **nicht** verifiziert — die Implementierung liegt in `spoolman/database/extra_field_query.py`, das ich nicht abgerufen habe. Vor Nutzung gegen eine laufende Instanz testen.

5. **Verhalten bei ungültiger Sortier-Richtung.** `SortOrder[direction.upper()]` (z.B. `vendor.py:126`) wirft bei `sort=name:foo` einen `KeyError`, der **nicht** von dem `except ValueError` abgefangen wird. Ergebnis vermutlich `500`. Ebenso wirft `sort=name` (ohne `:`) einen `ValueError` beim `split(":")`-Unpacking, bevor der `try`-Block beginnt. Beides nicht praktisch getestet.

6. **Genaue Einführungsversionen einzelner Features.** Für `spool.initial_weight`/`spool.spool_weight`, `PUT /spool/{id}/measure`, `multi_color_hexes` und den `x-total-count`-Header konnte ich nicht ermitteln, ab welcher Spoolman-Version sie existieren. Meine Mindestversions-Empfehlung (`>= 0.25.0`) ist daher konservativ und stützt sich primär auf die Custom-Field-Filter.

7. **Release-Daten.** Widersprüchliche Angaben zum Datum von v0.25.0 (2024 vs. 2026). Die Versionsnummer selbst ist aus zwei unabhängigen Quellen bestätigt (`pyproject.toml` auf `master` + GitHub-Releases-Seite), das Datum nicht.

8. **`422`-Body-Format nicht empirisch bestätigt.** Ich habe verifiziert, dass **kein** benutzerdefinierter `RequestValidationError`-Handler registriert ist, und leite daraus das FastAPI-Standardformat (`{"detail": [...]}`) ab. Das ist eine belastbare, aber indirekte Schlussfolgerung. Die exakte Struktur der `detail`-Objekte hängt zudem von der Pydantic-v2-Version ab.

9. **`print_presets`-Setting nicht untersucht.** Für einen Labeler potenziell hochrelevant (dort liegen offenbar die Druck-Presets des Spoolman-Frontends), aber Schema und Semantik habe ich nicht analysiert. Das Setting ist als `SettingType.ARRAY` mit Default `[]` registriert (`spoolman/settings.py:66`) — mehr weiß ich nicht.

10. **`color_hex` mit `#` — realer DB-Effekt nicht getestet.** Dass der Validator das `#` nicht entfernt (`filament.py:139`: `return v`) und die Spalte nur `String(8)` ist (`database/models.py:51`), ist im Code eindeutig. Was ein konkreter Server bei `"#RRGGBBAA"` (9 Zeichen) tatsächlich tut — Truncation, DB-Fehler `500`, oder Response-Validierungsfehler beim späteren Lesen — habe ich nicht ausprobiert. Die Empfehlung „immer ohne `#` senden" umgeht das Problem vollständig.

11. **`extra`-Semantik bei PATCH ist inkonsistent.** Verifiziert im Code: Filament (`database/filament.py:186-187`) und Vendor (`database/vendor.py:120-121`) **ersetzen** die Extra-Felder komplett; Spool (`database/spool.py:249-251`) führt einen **Merge** durch, obwohl die Endpoint-Beschreibung „removed and replaced" verspricht. Ob das ein bewusster Unterschied oder ein Bug ist, ist unklar. Ich habe nicht geprüft, ob dazu ein Issue existiert.

12. **`DELETE /vendor/{id}` — Kaskadenverhalten nur aus der Beschreibung.** Dass `filament.vendor` bei betroffenen Filamenten geleert wird, steht in der Endpoint-Beschreibung (`vendor.py:285-287`); die DB-seitige Umsetzung (`ON DELETE SET NULL` vs. explizites Update) habe ich nicht nachgelesen.

13. **Unbekannte Felder im Request-Body.** Ob Pydantic hier `extra="ignore"` (Default, unbekannte Felder werden still verworfen) oder `extra="forbid"` verwendet, hängt von einer eventuellen globalen `model_config` ab, die ich in den Body-Modellen nicht gesehen habe. Ich gehe von „still verworfen" aus, habe es aber nicht getestet — relevant, falls wir versehentlich `id` oder `registered` mitsenden.
