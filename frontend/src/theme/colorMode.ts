/**
 * Farbschema-Grundlagen.
 *
 * Bewusst identisch zu Spoolman (docs/ui-analysis.md, Abschnitt 3):
 * dieselben drei Zustaende und derselbe `localStorage`-Schluessel. Laeuft der
 * Labeler unter derselben Origin wie Spoolman, teilen beide Anwendungen damit
 * automatisch die Praeferenz.
 */

export type ColorModePreference = "system" | "light" | "dark";
export type ResolvedColorMode = "light" | "dark";

/** Schluessel wie in Spoolman — nicht umbenennen. */
export const COLOR_MODE_STORAGE_KEY = "colorMode";

export const PREFERS_DARK_QUERY = "(prefers-color-scheme: dark)";

/**
 * Der einzige Design-Token-Override der gesamten Anwendung
 * (ADR-004). Alles Weitere ist unveraenderter Ant-Design-5-Standard —
 * im Dark Mode leitet Ant Design daraus selbst `#be682f` ab.
 */
export const COLOR_PRIMARY = "#dc7734";

export const DEFAULT_COLOR_MODE_PREFERENCE: ColorModePreference = "system";

export function isColorModePreference(value: unknown): value is ColorModePreference {
  return value === "system" || value === "light" || value === "dark";
}

/** Liest die gespeicherte Praeferenz; faellt bei jedem Problem auf `system` zurueck. */
export function readStoredPreference(): ColorModePreference {
  if (typeof window === "undefined") {
    return DEFAULT_COLOR_MODE_PREFERENCE;
  }
  try {
    const stored = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
    return isColorModePreference(stored) ? stored : DEFAULT_COLOR_MODE_PREFERENCE;
  } catch {
    // Privater Modus oder blockierter Speicher — kein Grund zu scheitern.
    return DEFAULT_COLOR_MODE_PREFERENCE;
  }
}

export function writeStoredPreference(preference: ColorModePreference): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, preference);
  } catch {
    // Speichern ist ein Komfortmerkmal, kein harter Fehler.
  }
}

/** Aktueller Systemwunsch laut `prefers-color-scheme`. */
export function readSystemMode(): ResolvedColorMode {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return "light";
  }
  return window.matchMedia(PREFERS_DARK_QUERY).matches ? "dark" : "light";
}

export function resolveColorMode(
  preference: ColorModePreference,
  systemMode: ResolvedColorMode,
): ResolvedColorMode {
  return preference === "system" ? systemMode : preference;
}
