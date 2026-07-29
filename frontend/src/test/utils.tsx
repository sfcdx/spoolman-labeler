import type { ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { vi } from "vitest";
import { ColorModeProvider } from "../theme/ColorModeProvider";
import type { ColorModePreference } from "../theme/colorMode";

export interface RenderOptions {
  initialEntries?: string[];
  initialPreference?: ColorModePreference;
}

/** Rendert Inhalt mit Farbschema-Provider und Router. */
export function renderWithProviders(
  ui: ReactNode,
  { initialEntries = ["/"], initialPreference }: RenderOptions = {},
): RenderResult {
  return render(
    <ColorModeProvider {...(initialPreference ? { initialPreference } : {})}>
      <MemoryRouter initialEntries={initialEntries}>{ui}</MemoryRouter>
    </ColorModeProvider>,
  );
}

/**
 * `userEvent` ohne Pruefung von `pointer-events`.
 *
 * Ant Design blendet die Radio-Eingabefelder des `Segmented` per CSS aus
 * (`pointer-events: none`). In jsdom wuerde user-event deshalb einen echten
 * Klick verweigern, obwohl er im Browser funktioniert.
 */
export function setupUser(): ReturnType<typeof userEvent.setup> {
  return userEvent.setup({ pointerEventsCheck: 0 });
}

/** Antwort-Attrappe fuer `fetch`. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** Gesunde Standardantwort von `GET /api/health`. */
export const healthyPayload = {
  status: "ok",
  database: "ok",
  spoolman: "ok",
  cups: "ok",
  version: "0.1.0",
} as const;

/** Ersetzt `fetch` global durch eine Attrappe, die `payload` liefert. */
export function stubFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): ReturnType<typeof vi.fn> {
  const mock = vi.fn(handler);
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** Ein Eintrag fuer {@link stubRoutedFetch}: Muster gegen die URL, Antwortfunktion. */
export type FetchRoute = [
  RegExp,
  (url: string, init?: RequestInit) => Response | Promise<Response>,
];

/**
 * Fetch-Attrappe mit mehreren Routen, in Reihenfolge geprueft.
 *
 * Fuer Seiten, die mehrere unterschiedliche Endpunkte aufrufen (z. B. Vorlagen
 * laden UND eine neue Vorlage anlegen) reicht eine einzelne Antwort nicht
 * mehr aus. Eine nicht passende Anfrage liefert 404 statt undefiniert zu
 * bleiben, damit ein fehlendes Mock in der Testausgabe sichtbar wird.
 */
export function stubRoutedFetch(routes: FetchRoute[]): ReturnType<typeof vi.fn> {
  return stubFetch((input, init) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = routes.find(([pattern]) => pattern.test(url));
    if (!match) {
      return Promise.resolve(
        jsonResponse({ error: { code: "NOT_FOUND", message: `Kein Mock für ${url}` } }, 404),
      );
    }
    return Promise.resolve(match[1](url, init));
  });
}

/**
 * Bequemer Standard fuer Seiten, die neben dem Systemstatus auch Listen laden
 * (Vorlagen, Drucker, Druckhistorie). Ohne Endpunkt-Unterscheidung wuerde
 * jede dieser Anfragen faelschlich den Health-Payload erhalten — kein Array,
 * wodurch `.find`/`.map` in den Seiten mit einer Ausnahme abbrechen wuerde.
 */
export function stubHealthyFetch(): ReturnType<typeof vi.fn> {
  return stubFetch((input) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/api/health")) {
      return Promise.resolve(jsonResponse(healthyPayload));
    }
    if (
      url.includes("/api/templates") ||
      url.includes("/api/printers") ||
      url.includes("/api/print-jobs") ||
      url.includes("/api/spoolman/")
    ) {
      return Promise.resolve(jsonResponse([]));
    }
    return Promise.resolve(jsonResponse({}));
  });
}
