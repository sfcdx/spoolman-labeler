import type { ReactNode } from "react";
import { render, type RenderResult } from "@testing-library/react";
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

/** Bequemer Standard: jede Anfrage liefert einen gesunden Systemstatus. */
export function stubHealthyFetch(): ReturnType<typeof vi.fn> {
  return stubFetch(() => Promise.resolve(jsonResponse(healthyPayload)));
}
