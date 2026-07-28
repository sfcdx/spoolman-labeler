# Spoolman Frontend — UI-Analyse

Analyse des Frontends von [Donkie/Spoolman](https://github.com/Donkie/Spoolman) als Grundlage für die
Begleit-Webanwendung **Spoolman Labeler**.

**Analysierter Stand:** Branch `master`, Commit `eced411a519a326ef8eb0e88596389c03ca1fecc` (2026-07-24),
`client/package.json` Version `0.25.0`. Analyse erstellt am 2026-07-28.

**Methode:** Vollständiger flacher Clone von `https://github.com/Donkie/Spoolman.git` und Lektüre der
Quelldateien. Die exakten Dependency-Versionen stammen aus `client/package-lock.json`. Die konkreten
Design-Token-HEX-Werte wurden reproduziert, indem `antd@5.29.3` (die im Lockfile aufgelöste Version)
lokal installiert und `theme.getDesignToken({ algorithm, token: { colorPrimary: "#dc7734" } })`
ausgeführt wurde — sie sind also berechnet, nicht geraten.

---

## 1. Frontend-Stack

Quelle: `client/package.json`, `client/package-lock.json`, `client/vite.config.ts`, `client/src/index.tsx`

Der Verdacht **React + Refine + Ant Design + Vite** ist bestätigt. Details:

| Bereich | Technologie | Version (`package.json` / aufgelöst im Lockfile) |
| --- | --- | --- |
| Framework | React | `^19.2.3` / **19.2.7** |
| Meta-Framework / CRUD | Refine (`@refinedev/core`) | `^5.0.7` / **5.0.12** |
| Refine-UI-Adapter | `@refinedev/antd` | `^6.0.3` / **6.0.3** |
| UI-Bibliothek | **Ant Design (antd)** | *keine direkte Dependency* / **5.29.3** (transitiv über `@refinedev/antd`) |
| Icons | `@ant-design/icons` | transitiv / **5.6.1** |
| React-19-Kompatibilität | `@ant-design/v5-patch-for-react-19` | `^1.0.3` (in `src/index.tsx` als erster Import) |
| Router | `react-router` v7, `@refinedev/react-router` | `^7.11.0` / **7.18.1** |
| Build | **Vite** | `^7.3.0` / **7.3.6**, Plugins: `@vitejs/plugin-react`, `vite-plugin-svgr`, `vite-plugin-pwa`, `vite-plugin-mkcert` |
| Sprache | TypeScript | **5.9.3** |
| Server-State | `@tanstack/react-query` | `^5.90.16` |
| Client-State | `zustand` | `^5.0.9` |
| HTTP | `axios` + `@refinedev/simple-rest` | — |
| Datum | `dayjs` | `^1.11.10` |
| i18n | `i18next`, `react-i18next`, `i18next-http-backend`, `i18next-browser-languagedetector` | siehe Abschnitt 8 |
| QR-Scan | `@yudiel/react-qr-scanner` | `^2.5.0` |
| Druck | `react-to-print` `^3.2.0`, `html-to-image` `^1.11.13` | — |
| Command-Palette | `@refinedev/kbar` | `^2.0.1` |
| Code-Splitting | `@loadable/component` | `^5.16.7` |

Bemerkenswert:

- **Kein Tailwind, kein CSS-in-JS-Framework von Hand.** Das Styling kommt praktisch vollständig aus Ant
  Designs eigenem CSS-in-JS (`@ant-design/cssinjs`) plus Inline-`style`-Objekten, die die antd-Design-Tokens
  über `theme.useToken()` lesen.
- Es gibt exakt **drei** eigene CSS-Dateien im gesamten Client: `src/utils/overrides.css` (4 Zeilen),
  `src/components/spoolIcon.css`, `src/pages/locations/locations.css`. Alles andere ist antd.
- Der Build ist eine **PWA** (`vite-plugin-pwa`, `registerType: "autoUpdate"`), das Manifest steht in
  `client/vite.config.ts`.
- `vite.config.ts` setzt `base: ""` (relative Asset-Pfade), damit die App unter einem beliebigen Base-Path
  ausgeliefert werden kann.
- Die Skripte laufen über die Refine-CLI: `dev` = `refine dev`, `build` = `tsc && refine build`.
- Die API-URL wird zur Build-Zeit über `VITE_APIURL` gesetzt; im offiziellen Build ist das `/api/v1`
  (`.github/workflows/ci.yml`). Ohne diese Variable rendert die App nur eine Fehlerseite
  („Missing API URL", `client/src/App.tsx`).

---

## 2. Design-Tokens

Quellen: `client/src/contexts/color-mode/index.tsx`, `client/vite.config.ts`, `client/index.html`,
`client/public/favicon.svg`, `client/src/icon.svg`

### 2.1 Die einzige echte Anpassung

Spoolman überschreibt **genau einen** Ant-Design-Token:

```tsx
// client/src/contexts/color-mode/index.tsx
<ConfigProvider
  theme={{
    algorithm: mode === "light" ? defaultAlgorithm : darkAlgorithm,
    token: {
      colorPrimary: "#dc7734",
    },
  }}
>
```

**`#dc7734`** (ein gebranntes Orange) ist damit *die* Markenfarbe. Sie taucht zusätzlich auf in:

- `client/index.html`: `<meta name="theme-color" content="#DC7734" />`
- `client/vite.config.ts` (PWA-Manifest): `theme_color: "#DC7734"`, `background_color: "#1F1F1F"`
- `client/public/favicon.svg` und `client/src/icon.svg`: der abgerundete Hintergrund des Logos ist
  `fill:#dc7734`, der innere Kreis `fill:#343434`.

Alles andere (Radien, Schrift, Abstände, Hintergründe, Grautöne) sind die **unveränderten
Ant-Design-v5-Defaults**. Es gibt kein eigenes Token-Preset, keine Component-Token-Overrides, kein
`RefineThemes.*`.

### 2.2 Konkrete abgeleitete Werte (berechnet mit antd 5.29.3)

Diese Werte sind das Ergebnis von `theme.getDesignToken()` mit `colorPrimary: "#dc7734"` — also exakt das,
was Spoolman zur Laufzeit rendert.

#### Light Mode (`defaultAlgorithm`)

| Token | Wert |
| --- | --- |
| `colorPrimary` | `#dc7734` |
| `colorPrimaryHover` | `#e8995d` |
| `colorPrimaryActive` | `#b55822` |
| `colorPrimaryBorder` | `#ffdbb8` |
| `colorPrimaryBg` | `#fff8f0` |
| `colorBgBase` | `#fff` |
| `colorBgLayout` (Seitenhintergrund) | `#f5f5f5` |
| `colorBgContainer` (Karten, Tabellen, Sidebar) | `#ffffff` |
| `colorBgElevated` (Header, Dropdowns, Modals) | `#ffffff` |
| `colorText` | `rgba(0,0,0,0.88)` |
| `colorTextSecondary` | `rgba(0,0,0,0.65)` |
| `colorTextTertiary` | `rgba(0,0,0,0.45)` |
| `colorBorder` | `#d9d9d9` |
| `colorBorderSecondary` | `#f0f0f0` |
| `colorSplit` | `rgba(5,5,5,0.06)` |
| `colorSuccess` / `colorWarning` / `colorError` / `colorInfo` | `#52c41a` / `#faad14` / `#ff4d4f` / `#1677ff` |
| `colorLink` | `#1677ff` (Links bleiben antd-blau, **nicht** orange!) |

#### Dark Mode (`darkAlgorithm`)

| Token | Wert |
| --- | --- |
| `colorPrimary` | **`#be682f`** (antd dunkelt die Seed-Farbe ab) |
| `colorPrimaryHover` | `#d38c56` |
| `colorPrimaryActive` | `#965429` |
| `colorPrimaryBg` / `colorPrimaryBorder` | `#50321e` |
| `colorBgBase` | `#000` |
| `colorBgLayout` | `#000000` |
| `colorBgContainer` | `#141414` |
| `colorBgElevated` | `#1f1f1f` |
| `colorText` | `rgba(255,255,255,0.85)` |
| `colorTextSecondary` | `rgba(255,255,255,0.65)` |
| `colorTextTertiary` | `rgba(255,255,255,0.45)` |
| `colorBorder` | `#424242` |
| `colorBorderSecondary` | `#303030` |
| `colorSplit` | `rgba(253,253,253,0.12)` |
| `colorSuccess` / `colorWarning` / `colorError` / `colorInfo` | `#49aa19` / `#d89614` / `#dc4446` / `#1668dc` |

> **Wichtig für uns:** Wer die Primärfarbe im Dark Mode hart als `#dc7734` setzt, sieht *anders* aus als
> Spoolman. Spoolman zeigt dort `#be682f`. Die Sidebar ist im Dark Mode `#141414`, der Header `#1f1f1f`.

#### Geometrie, Typografie, Abstände (identisch in Light und Dark)

| Token | Wert |
| --- | --- |
| `borderRadius` | `6px` |
| `borderRadiusLG` (Karten, Content-Container) | `8px` |
| `borderRadiusSM` / `borderRadiusXS` | `4px` / `2px` |
| `fontSize` | `14px` |
| `fontSizeLG` | `16px` |
| `fontSizeHeading1/2/3` | `38px` / `30px` / `24px` |
| `lineHeight` | `1.5714285714285714` (≈ 22px bei 14px) |
| `controlHeight` | `32px` |
| `padding` / `paddingLG` / `paddingSM` | `16` / `24` / `12` |
| `margin` / `marginLG` | `16` / `24` |
| `sizeUnit` / `sizeStep` | `4` / `4` (die Abstandsskala ist ein 4px-Raster) |
| `boxShadow` | `0 6px 16px 0 rgba(0,0,0,0.08), 0 3px 6px -4px rgba(0,0,0,0.12), 0 9px 28px 8px rgba(0,0,0,0.05)` |

**Schriftart** (antd-Default-System-Stack, Spoolman lädt *keine* Webfont):

```
-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial,
'Noto Sans', sans-serif, 'Apple Color Emoji', 'Segoe UI Emoji', 'Segoe UI Symbol',
'Noto Color Emoji'
```

Monospace: `'SFMono-Regular', Consolas, 'Liberation Mono', Menlo, Courier, monospace`

### 2.3 Eigene, nicht-antd Design-Details

- **Spool-Icon** (`client/src/components/spoolIcon.css` + `spoolIcon.tsx`): kleine farbige Balken-Kachel,
  die die Filamentfarbe(n) zeigt. Standardgröße `1.5em × 2.5em`, „large" `4em × 4em`, `gap: 2px`,
  Rahmen `#44444430 solid 2px`, Ecken der Randelemente `6px`, innere `2px`. Bei Multi-Color werden mehrere
  Divs mit `flex: 1 1 0` nebeneinander/übereinander gelegt (`vertical` / `horizontal`).
- **Archivierte Zeilen** in der Spool-Tabelle: `fontStyle: "italic"`, `color: "#999"`
  (`client/src/pages/spools/list.tsx`).
- **Locations-Board** (`client/src/pages/locations/locations.css`): Spalten `24em` breit, `padding: 1em`,
  Spool-Karten `border-radius: 0.5em`, Überschriften `21px`, Drag-Cursor `grab`.

---

## 3. Light/Dark-Mode

Quelle: `client/src/contexts/color-mode/index.tsx`, `client/src/components/header/index.tsx`

- Implementiert als eigener React-Context `ColorModeContextProvider`, der einen zweiten `ConfigProvider`
  mit `algorithm: defaultAlgorithm | darkAlgorithm` rendert.
- **Drei** Zustände, nicht zwei: `ThemePreference = "system" | "light" | "dark"`. `"system"` folgt live der
  Media Query `(prefers-color-scheme: dark)` über einen `matchMedia`-`change`-Listener.
- **Speicherung: `localStorage`, Key `colorMode`**, Wert direkt einer von `"system" | "light" | "dark"`.
  Kein Cookie, kein Server-Setting. Ältere Versionen speicherten dort bereits `"light"`/`"dark"` — die
  bleiben gültig. Ist nichts gesetzt, ist der Default `"system"` (laut Kommentar wegen Issue #947).
- **Bedienelement:** ein antd-`Segmented` im Header mit drei Icons — `DesktopOutlined` (System),
  `SunOutlined` (Hell), `MoonOutlined` (Dunkel), mit `aria-label` aus `t("theme.label")`.
- Der Context exportiert `{ mode, preference, setPreference }`; `mode` ist die aufgelöste Variante.

Für den Labeler heißt das: Wir können denselben `localStorage`-Key `colorMode` lesen. Beide Apps laufen
allerdings nur dann auf derselben Origin (und teilen damit `localStorage`), wenn wir den Labeler unter
demselben Host/Port ausliefern. Sonst müssen wir eine eigene Präferenz speichern und sollten dieselbe
Drei-Zustands-Semantik anbieten.

---

## 4. Navigation & Layout

Quellen: `client/src/components/layout.tsx`, `client/src/components/header/index.tsx`,
`client/src/App.tsx`, `@refinedev/antd@6.0.3` `dist/index.mjs` (für die Layout-Maße)

### 4.1 Struktur

`SpoolmanLayout` ist ein dünner Wrapper um Refines `ThemedLayout`:

- **Sider:** `ThemedSider` mit `fixed`, Titel `ThemedTitle` mit Text `"Spoolman"` und dem SVG-Logo
  (`src/icon.svg` als React-Komponente via `vite-plugin-svgr`).
- **Header:** eigener `Header` (siehe unten), `sticky`.
- **Footer:** eigener `SpoolmanFooter` — zentriert, zeigt `version` + `<Version />` und einen Ko-fi-Button
  (`https://ko-fi.com/donkie`).

### 4.2 Menüpunkte (Reihenfolge und Icons aus der `resources`-Liste in `App.tsx`)

| Resource | Pfad | Icon (`@ant-design/icons`) |
| --- | --- | --- |
| `home` | `/` | `HomeOutlined` |
| `spool` | `/spool` | `FileOutlined` |
| `filament` | `/filament` | `HighlightOutlined` |
| `vendor` | `/vendor` | `UserOutlined` |
| `locations` | `/locations` | `TableOutlined` |
| `settings` | `/settings` | `ToolOutlined` |
| `help` | `/help` | `QuestionOutlined` |

Refine generiert das Sidebar-Menü automatisch aus dieser Liste. Zusätzlich hängt `ThemedSider`
standardmäßig einen Logout-Eintrag an, wenn ein Auth-Provider existiert — Spoolman hat keinen, also
erscheint keiner.

### 4.3 Maße

- **Sider:** `200px` ausgeklappt, `80px` eingeklappt (`collapsedWidth: 80`), Übergang `all 0.2s`.
  Hintergrund `token.colorBgContainer`, rechte Kante `1px solid ${token.colorBgElevated}`.
  Bei `fixed` wird zusätzlich ein gleich breiter Platzhalter-Div gerendert.
- **Header:** `height: 64px`, `padding: 0px 24px`, `backgroundColor: token.colorBgElevated`,
  `justifyContent: flex-end`, bei `sticky` zusätzlich `position: sticky; top: 0; z-index: 1`.
  Inhalt (rechtsbündig): Sprach-Dropdown → Theme-`Segmented` → QR-Scanner-`FloatButton`.
- **Content-Container** (Muster aus `pages/home/index.tsx` und `pages/printing/index.tsx`):

  ```tsx
  <Content style={{
    padding: "2em 20px",         // Printing: 20
    minHeight: 280,
    maxWidth: 800,               // nur Home; Printing hat kein maxWidth
    margin: "0 auto",
    backgroundColor: token.colorBgContainer,
    borderRadius: token.borderRadiusLG,   // 8px
    color: token.colorText,
    fontFamily: token.fontFamily,
    fontSize: token.fontSizeLG,           // 16px
    lineHeight: 1.5,
  }} />
  ```

  Die **Home-Seite ist auf `maxWidth: 800px` begrenzt**, die Listen-/Detailseiten nutzen die volle Breite
  des Refine-`List`/`Show`-Wrappers.

### 4.4 Kartenstil

Reine antd-`Card`-Defaults (Radius 8px, `colorBgContainer`, dünner Rand). Auf der Home-Seite:
`<Row justify="center" gutter={[16,16]}>` mit `<Col xs={12} md={6}>`, darin eine `Card` mit `actions`
(Listen-Link `UnorderedListOutlined`, Anlegen-Link `PlusOutlined`) und einer `Statistic` mit
Ressourcen-Icon als `prefix`.

### 4.5 Tabellenstil

Aus `client/src/pages/spools/list.tsx`:

- Refine-`List`-Wrapper mit `headerButtons`: alle als `type="primary"` (also orange gefüllt) —
  „Beschriftung drucken" (`PrinterOutlined`), „Archivierte anzeigen" (`InboxOutlined`),
  „Filter zurücksetzen" (`FilterOutlined`), Spalten-Dropdown (`EditOutlined`), dann `defaultButtons`.
- `<Table sticky tableLayout="auto" scroll={{ x: "max-content" }} rowKey="id" />`
- Pagination: Default `pageSize: 20`, `showSizeChanger = true`.
- Default-Sortierung `[{ field: "id", order: "asc" }]`.
- Tabellenzustand (Sorters/Filters/Pagination/sichtbare Spalten) wird in `localStorage` unter dem Namespace
  `spoolList-v2` gespeichert **und** zusätzlich in den **URL-Hash** geschrieben
  (`client/src/utils/saveload.ts`). Der Hash ist also für Tabellenzustand belegt — er ist **nicht** Teil
  des Routings.

---

## 5. KRITISCH — URL-Struktur der Weboberfläche

Quelle: `client/src/App.tsx` (Zeilen 90–241), `client/src/utils/url.ts`, `spoolman/main.py`

### 5.1 Kein Hash-Router

```tsx
<BrowserRouter basename={getBasePath() + "/"}>
```

Spoolman benutzt einen **`BrowserRouter`** aus `react-router` v7, **keinen `HashRouter`**. Es gibt also
**kein `#/`** in den Anwendungs-URLs. Serverseitig liefert FastAPI eine SPA-Fallback-Mount aus
(`app.mount(base_path, app=SinglePageApplication(directory="client/dist", base_path=...))`,
`spoolman/main.py`), damit Deep Links funktionieren.

Der URL-Hash wird ausschließlich für persistierten Tabellenzustand verwendet (siehe 4.5).

### 5.2 Die kanonischen Detail-URLs

| Entität | Pfad-Muster |
| --- | --- |
| **Spule** | **`/spool/show/{id}`** |
| Filament | `/filament/show/{id}` |
| Hersteller (Vendor) | `/vendor/show/{id}` |

Vollständige Route-Matrix (identisch für alle drei Ressourcen, `<res>` ∈ `spool` \| `filament` \| `vendor`):

| Aktion | Pfad |
| --- | --- |
| Liste | `/<res>` |
| Anlegen | `/<res>/create` |
| Klonen | `/<res>/clone/{id}` |
| Bearbeiten | `/<res>/edit/{id}` |
| **Detail** | **`/<res>/show/{id}`** |

Weitere Routen: `/` (Home), `/spool/print` (Etikettendruck), `/locations`, `/settings/*`, `/help`,
`*` → `ErrorComponent`.

### 5.3 Base-Path — der wichtige Stolperstein

`getBasePath()` (`client/src/utils/url.ts`) liest `window.SPOOLMAN_BASE_PATH`. Diese Variable wird vom
Backend zur Laufzeit über eine generierte `/config.js` gesetzt (`spoolman/main.py`, Zeile ~88), die in
`index.html` per `<script src="./config.js">` eingebunden wird.

Steht z. B. `SPOOLMAN_BASE_PATH=/spoolman`, dann lautet die volle Spool-Detail-URL:

```
https://host:7912/spoolman/spool/show/42
```

Ohne Base-Path (Default, leerer String):

```
http://host:7912/spool/show/42
```

Die API liegt analog unter `getBasePath() + "/api/v1"`.

**Für unsere QR-Codes gilt daher:** Die Basis-URL muss konfigurierbar sein und den Base-Path enthalten.
Wir dürfen sie nicht aus `window.location.origin` allein ableiten. Spoolman selbst hat dafür ein
Server-Setting (siehe 6.3).

---

## 6. Vorhandene QR-/Label-Funktionen

Spoolman hat bereits eine **vollständige Etikettendruck-Funktion**. Das ist für uns die zentrale
Kompatibilitätsvorgabe.

Quellen: `client/src/pages/printing/*` (5 Dateien), `client/src/components/qrCodeScanner.tsx`,
`client/src/pages/spools/list.tsx`

### 6.1 Was es kann

- Einstiegspunkt: Button **„Beschriftung drucken"** (i18n-Key `printing.qrcode.button`) in der
  Spool-Liste → Route `/spool/print`.
- `/spool/print` nimmt die Auswahl über Query-Parameter entgegen:
  `?spools=1&spools=2&spools=3&return=/spool/print` (mehrfaches `spools`). Ohne `spools` wird zuerst ein
  Auswahl-Modal (`spoolSelectModal.tsx`) gezeigt.
- Layout-Engine (`printingDialog.tsx`): Papierformate **A3, A4, A5, Letter, Legal, Tabloid** plus
  „custom" (Breite/Höhe in mm). Konfigurierbar: Spalten (Default 3), Zeilen (Default 8), Ränder
  (Default 10 mm allseits), „Sicherheitsabstand" des Druckers (Default 5 mm), horizontaler/vertikaler
  Abstand (Default 0), zu überspringende Etiketten (`skipItems`), Kopien pro Etikett (`itemCopies`),
  Rahmenmodus `none | border | grid` (Default `grid`), Vorschau-Skalierung.
- Gedruckt wird per **`react-to-print`** (Browser-Druckdialog), alternativ Export als Bild per
  **`html-to-image`** („Als Bild speichern").
- QR-Code-Rendering: antd-Komponente **`<QRCode type="svg" color="#000" errorLevel="H" />`**,
  optional mit eingebettetem Icon (`getBasePath() + "/favicon.svg"`). Modus
  `showQRCodeMode: "no" | "simple" | "withIcon"`, Default **`withIcon`**.
- **Etiketten-Template-Engine** mit eigener Mini-Syntax (`printing.tsx`, `renderLabelContents`):
  - `{tag}` → Wert einsetzen; `**fett**` → `<b>`; `\n` → `<br>`.
  - `{Prefix {tag} Suffix}` → der ganze Block verschwindet, wenn `tag` leer/unbekannt ist
    (der Platzhalter liefert dann `"?"`).
  - Verfügbare Tags: Spool-Felder (`id`, `registered`, `first_used`, `last_used`, `price`,
    `initial_weight`, `spool_weight`, `remaining_weight`, `used_weight`, `remaining_length`,
    `used_length`, `location`, `lot_nr`, `comment`, `archived`), Filament-Felder (`filament.*`,
    u. a. `filament.name`, `filament.material`, `filament.color_hex`, `filament.settings_extruder_temp`,
    `filament.settings_bed_temp`), Vendor-Felder (`filament.vendor.*`) sowie alle benutzerdefinierten
    Extra-Felder als `extra.<key>`, `filament.extra.<key>`, `filament.vendor.extra.<key>`.
  - Default-Template:

    ```
    **{filament.vendor.name} - {filament.name}
    #{id} - {filament.material}**
    Spool Weight: {filament.spool_weight} g
    {ET: {filament.settings_extruder_temp} °C}
    {BT: {filament.settings_bed_temp} °C}
    {Lot Nr: {lot_nr}}
    {{comment}}
    {filament.comment}
    {filament.vendor.comment}
    ```
- **Presets:** Mehrere benannte Druckvorlagen werden serverseitig im Spoolman-Setting `print_presets`
  als JSON gespeichert (Struktur `SpoolQRCodePrintSettings[]` mit `template` + `labelSettings`,
  jede mit UUID `id`). Sie sind also über die API les- und schreibbar.
- Textgröße des Etiketts in **mm** (Slider 2–7 mm, Default 3 mm) — das Label-Layout rechnet konsequent
  in Millimetern.

### 6.2 Welches Format wird in den QR-Code kodiert? (entscheidend)

`client/src/pages/printing/spoolQrCodePrintingDialog.tsx`, Zeile 303:

```tsx
value: useHTTPUrl ? `${baseUrlRoot}/spool/show/${spool.id}` : `WEB+SPOOLMAN:S-${spool.id}`,
```

Es gibt also **zwei** Formate, umschaltbar per Radio-Group („QR Code Link": *Standard* vs. *URL*):

1. **Default — Custom-URI-Schema:** `WEB+SPOOLMAN:S-{id}`
   Beispiel: `WEB+SPOOLMAN:S-42`
   Das ist kompakt (mehr Fehlerkorrektur bei kleinem Etikett) und funktioniert laut Tooltip **nur** mit
   Spoolmans eigener Scan-Funktion.
2. **HTTP-URL:** `{baseUrlRoot}/spool/show/{id}`
   `baseUrlRoot` = das Server-Setting `base_url` (JSON-String), falls gesetzt und nicht leer, sonst
   `window.location.origin`.

Die Auswahl wird lokal gespeichert (`localStorage`-Key `print-useHTTPUrl` über `useSavedState`,
Default `false` → also **standardmäßig das `WEB+SPOOLMAN:`-Schema**).

### 6.3 Was der Scanner akzeptiert

`client/src/components/qrCodeScanner.tsx` — der `FloatButton` mit Kamera-Icon im Header öffnet einen
Scanner (`@yudiel/react-qr-scanner`, `facingMode: "environment"`), der folgende Symbologien liest:
`qr_code`, `micro_qr_code`, `rm_qr_code`, `data_matrix`, `aztec`, `pdf417`.

Erkannt werden genau zwei Payload-Muster:

```ts
/^web\+spoolman:s-(?<id>[0-9]+)$/i          // → navigate(`/spool/show/${id}`)
/^https?:\/\/[^/]+\/spool\/show\/(?<id>[0-9]+)$/i  // → navigate(`/spool/show/${id}`)
```

**Zwei wichtige Konsequenzen für uns:**

- Das `WEB+SPOOLMAN:`-Muster ist **case-insensitive** und erlaubt **nur** das Präfix `S-` gefolgt von
  Ziffern. Es gibt (Stand jetzt) **kein** `F-`/`V-`-Äquivalent für Filamente oder Hersteller — QR-Codes
  gibt es ausschließlich für Spulen.
- Der zweite Regex enthält **keinen Base-Path**: `^https?://[^/]+/spool/show/\d+$`. Läuft Spoolman unter
  `/spoolman`, wird die eigene HTTP-URL-Variante vom eigenen Scanner **nicht** erkannt. Zudem darf kein
  Query-String und kein Trailing Slash dranhängen. Das ist eine reale Einschränkung, die wir kennen
  müssen, wenn wir URLs erzeugen.

### 6.4 Empfehlung zur QR-Kompatibilität für den Labeler

Wir sollten **beide** Formate erzeugen können und **`WEB+SPOOLMAN:S-{id}` als Default** übernehmen —
das ist das Format, das Spoolmans eingebauter Scanner-Workflow zuverlässig versteht, und es ist kürzer,
was bei kleinen Etiketten die Modulgröße deutlich verbessert. Die HTTP-URL-Variante als Option anbieten
(nützlich für generische Handy-Kameras, die kein Custom-Schema kennen), mit konfigurierbarer Basis-URL
inkl. Base-Path. Beim Erzeugen der HTTP-Variante ohne Base-Path bleiben wir mit Spoolmans Scanner
kompatibel; mit Base-Path nicht — das sollte im UI als Hinweis stehen.

Die Basis-URL sollten wir aus dem Spoolman-Setting **`base_url`** über die API lesen
(`GET {api}/setting/base_url`, Wert ist ein JSON-kodierter String; registriert in
`spoolman/settings.py`, Zeile 71), statt sie erneut vom Nutzer erfragen zu lassen.

---

## 7. Lizenz

Quelle: `LICENSE` im Repository-Root

```
MIT License
Copyright (c) 2023 Daniel Hultgren
```

Es ist die unveränderte MIT-Standardlizenz. Es gibt **keine** `NOTICE`-Datei, **keinen** separaten
Lizenzhinweis im `client/`-Verzeichnis, **keine** Marken- oder Logo-Klausel im README.

### Was das konkret für uns bedeutet

**(a) Visuelles Design nachempfinden — unproblematisch, auch ohne MIT.**
Farbwerte, Abstände, Radien und Layout-Ideen sind keine schutzfähigen Werke. Zusätzlich stammt praktisch
das gesamte visuelle System gar nicht von Spoolman, sondern von **Ant Design (MIT, Copyright Ant Group
und Alipay.com)**. Spoolmans einzige eigene Design-Entscheidung ist die Primärfarbe `#dc7734` — eine
einzelne Farbe ist nicht urheberrechtlich geschützt. Wir können also gefahrlos „wie Spoolman" aussehen.

**(b) Code-Snippets übernehmen — erlaubt, mit einer Pflicht.**
MIT erlaubt Nutzung, Änderung und Weiterverbreitung ohne Copyleft. Die *einzige* Bedingung: der
Copyright-Hinweis und der Lizenztext müssen „in allen Kopien oder wesentlichen Teilen der Software"
mitgeliefert werden. Praktisch heißt das: Sobald wir nicht-triviale Codeteile übernehmen (z. B. die
Template-Engine `renderLabelContents`, die mm-Layout-Berechnung aus `printingDialog.tsx` oder die
Scanner-Regexe), legen wir eine Datei `THIRD_PARTY_LICENSES.md` (oder `NOTICE`) an, die den vollständigen
MIT-Text mit „Copyright (c) 2023 Daniel Hultgren" und die Herkunft nennt. Ein Kommentar an der
Fundstelle im Code ist zusätzlich guter Stil. Das ist keine große Hürde — es ist buchstäblich eine Datei.

**(c) Icons/Assets übernehmen — hier differenzieren.**

- `client/src/icon.svg`, `client/public/favicon.svg`, `pwa-*.png`, `maskable-icon-512x512.png`:
  Das **Spoolman-Logo**. Formal steht es unter derselben MIT-Lizenz (keine ausgenommene Klausel), aber
  ein Logo ist eine **Herkunftskennzeichnung**. Es in einer eigenständigen Drittanwendung zu verwenden,
  suggeriert offizielle Zugehörigkeit und ist markenrechtlich (bzw. wettbewerbsrechtlich) heikel,
  unabhängig von der Urheberrechtslizenz. → **Nicht übernehmen.** Wir bauen ein eigenes Logo.
- `client/public/kofi_s_logo_nolabel.png`: fremdes Ko-fi-Logo, gehört nicht Spoolman.
  → **Auf keinen Fall übernehmen.**
- `client/public/locales/*/common.json`: Die Übersetzungen sind MIT und *dürfen* übernommen werden.
  Für Fachbegriffe („Spule", „Hersteller", „Chargennummer", „Beschriftung drucken") lohnt es sich, die
  Terminologie **abzugleichen**, damit unsere UI dieselben Wörter benutzt — mit Attribution.
- **Ant-Design-Icons** (`@ant-design/icons`): kommen ohnehin nicht von Spoolman, sind MIT und
  problemlos nutzbar, wenn wir antd einsetzen.

**Klare Empfehlung:**

| | Verdikt |
| --- | --- |
| Farbpalette `#dc7734` + antd-Token übernehmen | **Ja**, ohne Einschränkung |
| Layout-/Navigationsstruktur nachbauen | **Ja** |
| Code-Snippets (Template-Engine, Regexe, mm-Layout) | **Ja**, mit `THIRD_PARTY_LICENSES.md` + MIT-Text + Quellenkommentar |
| Deutsche Terminologie aus `de/common.json` angleichen | **Ja**, mit Attribution |
| Spoolman-Logo / Favicon / PWA-Icons | **Nein** — eigenes Icon bauen (z. B. eine stilisierte Spule/Etikett in `#dc7734`) |
| Ko-fi-Logo | **Nein** |
| Name/Branding | „Spoolman **Labeler**" ist als beschreibender Companion-Name vertretbar; im README explizit „inoffiziell, nicht mit Donkie/Spoolman verbunden" schreiben |

> Hinweis: Das ist eine technische Einschätzung, keine Rechtsberatung.

---

## 8. Internationalisierung

Quelle: `client/src/i18n.ts`, `client/public/locales/`, `client/src/App.tsx`, `client/package.json`

- **Bibliothek:** `i18next` (**25.10.10**) mit `react-i18next`, `i18next-http-backend` und
  `i18next-browser-languagedetector`.
- **Ladeweg:** Übersetzungen werden **zur Laufzeit per HTTP nachgeladen**, nicht gebundelt:
  `loadPath: getBasePath() + "/locales/{{lng}}/{{ns}}.json"`.
- Ein einziger Namespace: `common` (`ns: "common"`, `defaultNS: "common"`), `fallbackLng: "en"`.
- Sprachauswahl über ein Dropdown im Header (alphabetisch nach Sprachcode sortiert).
- **Deutsch ist dabei:** Key `de`, Anzeigename `"Deutsch"`, `fullCode: "de-DE"`,
  dayjs-Locale `dayjs/locale/de`. Die Datei `client/public/locales/de/common.json` ist gepflegt und
  vollständig (u. a. der komplette Druck-/QR-Bereich).
- **27 Sprachen** sind in `i18n.ts` registriert: `en`, `sv`, `de`, `es`, `zh`, `zh-Hant`, `pl`, `ru`,
  `cs`, `nb-NO`, `nl`, `fr`, `hu`, `it`, `uk`, `el`, `da`, `pt`, `fa`, `ro`, `ja`, `pt-BR`, `ta`, `th`,
  `lt`, `tr`.
  Im Verzeichnis `client/public/locales/` liegen **34** Ordner — u. a. `et`, `hi-Latn`, `ko`, `lv`, `sk`,
  `sl` sind vorhanden, aber (noch) **nicht** in `i18n.ts` registriert und damit nicht auswählbar.
- Drei Systeme werden zusammen umgeschaltet: i18next, **antd-Locale** (dynamischer Import von
  `antd/es/locale/{fullCode mit _}.js` in `App.tsx`) und **dayjs-Locale** (über den
  `languageChanged`-Listener).
- Refines `i18nProvider` ist ein dünner Adapter über `useTranslation()`; in Komponenten wird
  `useTranslate()` aus `@refinedev/core` benutzt.
- Es gibt ein Konsistenz-Skript: `npm run check-i18n` → `node scripts/check-i18n.js`.

**Relevante deutsche Begriffe zum Abgleich** (aus `client/public/locales/de/common.json`):
„Beschriftung drucken" (Print labels), „Vorlage" (Preset), „Vorlagenname", „Papiergröße",
„Sicherheitsabstand" (printer margin), „Anzahl der Kopien", „Objekt überspringen", „Gitter"/„Ränder"/„Keine",
„Textgröße Label", „QR Code Link" mit den Optionen „Standard" / „URL", „QR-Code Scanner",
„Gewicht Spule", „Chargennummer", „Hersteller".

---

## Empfehlung für Spoolman Labeler

### Ausgangslage

Wir bauen eine eigenständige Docker-Anwendung mit CUPS-Anbindung, die über die REST-API an Spoolman
hängt. Zwei Optionen stehen zur Debatte.

### Option A — Ant Design 5 + React 19 + Vite (maximale visuelle Nähe)

**Pro**
- Pixel-identische Nähe zu Spoolman ist nahezu geschenkt: ein einziger `ConfigProvider` mit
  `colorPrimary: "#dc7734"` und `defaultAlgorithm`/`darkAlgorithm` reproduziert *das komplette* Design.
  Es gibt keine zweite Design-Entscheidung, die wir treffen müssten — Spoolman hat auch keine getroffen.
- Formulare, Tabellen, Modals, Slider, `InputNumber` mit `addonAfter`, `Segmented`, `QRCode` — genau die
  Bausteine, die eine Labeler-UI braucht, sind fertig und sehen automatisch „richtig" aus.
- antd hat eine eigene `<QRCode>`-Komponente — dasselbe Rendering wie Spoolman, inklusive `errorLevel`
  und Icon-Einbettung.
- MIT-lizenziert, keine Reibung.
- Wenn wir Code-Snippets übernehmen (Template-Engine, Layout-Rechnung), passen sie **ohne Portierung**.
  Das ist der größte praktische Vorteil: `renderLabelContents` und `printingDialog` sind antd-Code.
- Dark Mode inkl. korrektem `#be682f` im Dunkeln funktioniert automatisch richtig — bei einer
  Eigenlösung würden wir das mit hoher Wahrscheinlichkeit falsch machen.

**Contra**
- Bundle-Größe. antd ist schwer; ein realistischer Gzip-Wert für eine kleine antd-App liegt grob im
  Bereich mehrerer hundert Kilobyte. *(Nicht gemessen — siehe Offene Punkte.)*
- Weniger Kontrolle über Details, gelegentliche CSS-in-JS-Reibung (Spoolman braucht dafür sogar den
  `@ant-design/v5-patch-for-react-19`).

### Option B — Eigenes/leichteres Setup (z. B. Preact/React + CSS-Variablen, oder ein Headless-Kit)

**Pro**
- Deutlich kleineres Bundle, schnellerer Kaltstart auf einem Raspberry Pi.
- Volle Kontrolle, keine Framework-Eigenheiten.

**Contra**
- Wir müssten die antd-Optik von Hand nachbauen: nicht nur die ~15 Farbwerte oben, sondern das komplette
  Verhalten von Buttons, Tabellen, Formularen, Focus-Rings, Hover-States, Disabled-States — in **zwei**
  Themes. Das ist genau die Arbeit, die den Unterschied zwischen „sieht ähnlich aus" und
  „wirkt wie eine Erweiterung" ausmacht, und sie ist überraschend groß.
- Die abgeleiteten antd-Palettenfarben (`colorPrimaryHover`, `colorPrimaryBg`, die Dark-Mode-Ableitung)
  entstehen aus einem Algorithmus. Von Hand nachgepflegt driften sie ab, sobald wir eine Nuance ändern.
- Übernommene Snippets müssten portiert werden — und damit erneut auf Korrektheit geprüft werden
  (die mm-Layout-Rechnung ist fehleranfällig).
- Für ein selbst gehostetes Werkzeug im LAN, das man ein paarmal am Tag öffnet, ist Bundle-Größe
  schlicht das falsche Optimierungsziel.

### Empfehlung: **Option A — Ant Design 5.**

Konkret:

- **React 19 + TypeScript + Vite 7 + antd 5** (dieselbe Major-Linie wie Spoolman; wir müssen `antd`
  anders als Spoolman als **direkte** Dependency führen, da wir kein `@refinedev/antd` haben).
  Plus `@ant-design/v5-patch-for-react-19` als erster Import in `main.tsx` — Spoolman braucht ihn, wir
  auch.
- **Refine bewusst NICHT übernehmen.** Refine ist ein CRUD-Scaffolding-Framework; unsere App ist ein
  Wizard („Spule anlegen → Etikett drucken"), kein CRUD-Backoffice. Refine würde nur Gewicht und
  Konzepte einschleppen, die wir nicht brauchen. Layout und Sidebar sind mit `antd/Layout` in wenigen
  Dutzend Zeilen selbst gebaut — die relevanten Maße stehen in Abschnitt 4.3.
- **Theme:** genau ein Override, `token: { colorPrimary: "#dc7734" }`, plus
  `algorithm: defaultAlgorithm | darkAlgorithm`. Nichts weiter. Damit sind wir per Konstruktion identisch
  zu Spoolman, auch wenn antd seine Defaults einmal anpasst.
- **Theme-Umschalter:** dieselbe Drei-Zustands-Semantik (`system | light | dark`), gespeichert unter
  `localStorage["colorMode"]` — dann teilen wir bei gleicher Origin sogar die Präferenz.
- **Layout:** Sider 200/80 px, Header 64 px mit `colorBgElevated`, Content-Container mit
  `borderRadiusLG` und `colorBgContainer`, Content-Breite `maxWidth: 800px` für die Wizard-Schritte —
  das ist Spoolmans Home-Seiten-Maß und passt zum Charakter unserer App.
- **Eigenes Logo**, gleiche Farbfamilie (`#dc7734`), aber erkennbar eigenes Motiv (z. B. Etikett statt
  Spule). Kein Spoolman-Logo, auch nicht im Favicon.
- **i18n:** `i18next` + `react-i18next` mit **de/en**, statisch gebundelt statt per HTTP-Backend
  (bei zwei Sprachen lohnt Lazy Loading nicht). Terminologie an `de/common.json` angleichen.
- **QR-Default:** `WEB+SPOOLMAN:S-{id}`, HTTP-URL als Option, Basis-URL aus dem Spoolman-Setting
  `base_url` vorbefüllt.

Der ausschlaggebende Punkt ist die **visuelle Nähe zum Nulltarif**: Spoolman *ist* im Wesentlichen
„Ant Design mit einer orangen Primärfarbe". Wenn wir dasselbe tun, sind wir per Definition eine natürliche
Erweiterung. Wenn wir etwas anderes tun, kämpfen wir dauerhaft gegen eine Lücke an, die nur durch die
Wahl eines anderen Toolkits überhaupt entstanden ist.

### Sofort verwendbares Theme-Snippet

```tsx
import { ConfigProvider, theme } from "antd";

<ConfigProvider
  theme={{
    algorithm: mode === "light" ? theme.defaultAlgorithm : theme.darkAlgorithm,
    token: { colorPrimary: "#dc7734" },
  }}
>
  {children}
</ConfigProvider>
```

Falls doch Option B: Die Werte aus Abschnitt 2.2 lassen sich 1:1 als CSS-Custom-Properties übernehmen.

---

## Offene Punkte

Alles Folgende wurde **nicht** verifiziert und darf nicht als Fakt behandelt werden:

1. **Bundle-Größe von antd** — nicht gemessen. Die Aussage „mehrere hundert KB gzip" ist eine
   Erfahrungsschätzung, keine Messung. Vor einer endgültigen Entscheidung sollte ein minimaler
   antd-Prototyp gebaut und `dist` gemessen werden.
2. **Rendering nicht visuell geprüft.** Die Analyse ist rein quellcodebasiert; die laufende Anwendung
   wurde nicht im Browser betrachtet. Screenshots/Live-Abgleich stehen aus.
3. **Refine-Interna nur teilweise geprüft.** Sider-Breite (200/80 px), Sider-Hintergrund
   (`colorBgContainer`) und Rand (`colorBgElevated`) stammen aus dem gebündelten `dist/index.mjs` von
   `@refinedev/antd@6.0.3`. Weitere Details von `ThemedLayout` / `ThemedTitle` (Logo-Größe,
   Menü-Einrückungen, Breakpoint für den mobilen Drawer) wurden nicht ausgelesen.
4. **Ob `base_url` per API auch ohne Auth lesbar ist**, wurde nicht getestet — nur, dass das Setting in
   `spoolman/settings.py` registriert ist und das Frontend es über `useGetSetting("base_url")` liest.
   Der exakte Endpunktpfad (vermutlich `{api}/setting/base_url`) wurde nicht am Backend-Router
   verifiziert.
5. **Ob `WEB+SPOOLMAN:` irgendwo als echter Protocol-Handler registriert wird**
   (`navigator.registerProtocolHandler`): Eine Suche im ganzen Repository fand das Token ausschließlich in
   den zwei Druck-Dateien und dem Scanner-Regex. Es ist also **kein** OS-registriertes Schema, sondern
   ein reiner In-App-Konvention-String. Externe Scanner-Apps können damit nichts anfangen.
6. **Kein `F-`/`V-`-QR-Format gefunden** — nach Quellcode existiert nur `S-` für Spulen. Ob das in
   Zukunft erweitert wird (Issues/PRs), wurde nicht recherchiert; GitHub-Issues waren in dieser Session
   nicht abfragbar.
7. **Die 8 nicht registrierten Locale-Ordner** (`et`, `hi-Latn`, `ko`, `lv`, `sk`, `sl`, u. a.) — ob das
   Absicht ist oder ein Versehen im Repo, wurde nicht geklärt.
8. **Ant-Design-Version-Drift:** antd ist bei Spoolman nur transitiv über `@refinedev/antd` gebunden.
   Ein anderer Build-Zeitpunkt kann eine andere antd-5.x-Patch-Version ziehen. Die berechneten Tokens
   gelten für **5.29.3**; die Seed-Werte (Radius 6, fontSize 14, Schriftstack) sind über 5.x hinweg
   allerdings sehr stabil.
9. **Marken-/Namensrechte am Begriff „Spoolman"** wurden nicht geprüft (keine Markenrecherche). Die
   Empfehlung in Abschnitt 7 ist eine Vorsichtsmaßnahme, keine juristische Bewertung.
10. **CUPS-/Druckerseite** war nicht Teil dieser Analyse. Spoolman druckt ausschließlich über den
    Browser-Druckdialog (`react-to-print`), nicht über CUPS — hier hat unser Labeler keine Vorlage im
    Upstream und muss eigene Wege gehen.

---

## Quellenübersicht

Alle Pfade relativ zu `https://github.com/Donkie/Spoolman` @ `eced411a` bzw. abrufbar als
`https://raw.githubusercontent.com/Donkie/Spoolman/master/<pfad>`.

| Thema | Datei(en) |
| --- | --- |
| Stack, Versionen | `client/package.json`, `client/package-lock.json`, `client/vite.config.ts`, `client/index.html`, `client/src/index.tsx` |
| Design-Tokens | `client/src/contexts/color-mode/index.tsx`, `client/vite.config.ts`, `client/public/favicon.svg`, `client/src/icon.svg`, `client/src/components/spoolIcon.css`, `client/src/pages/locations/locations.css`, `client/src/utils/overrides.css` |
| Light/Dark | `client/src/contexts/color-mode/index.tsx`, `client/src/components/header/index.tsx` |
| Layout, Navigation | `client/src/components/layout.tsx`, `client/src/components/header/index.tsx`, `client/src/pages/home/index.tsx`, `client/src/pages/spools/list.tsx`, `client/src/utils/saveload.ts`, `@refinedev/antd@6.0.3` `dist/index.mjs` |
| **Routing / URLs** | **`client/src/App.tsx`**, `client/src/utils/url.ts`, `spoolman/main.py` |
| QR & Etikettendruck | `client/src/pages/printing/index.tsx`, `printing.tsx`, `printingDialog.tsx`, `qrCodePrintingDialog.tsx`, `spoolQrCodePrintingDialog.tsx`, `spoolSelectModal.tsx`, `client/src/components/qrCodeScanner.tsx`, `spoolman/settings.py` |
| Lizenz | `LICENSE` |
| i18n | `client/src/i18n.ts`, `client/public/locales/**`, `client/scripts/check-i18n.js` |
