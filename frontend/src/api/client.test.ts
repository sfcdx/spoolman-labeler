import { describe, expect, it } from "vitest";
import { ApiError, getHealth, normalizeHealth, request } from "./index";
import { jsonResponse, stubFetch } from "../test/utils";
import { texts } from "../texts/de";

describe("API-Client", () => {
  it("ruft ausschliesslich den relativen Pfad /api auf", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ ok: true })));

    await request("/health");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = fetchMock.mock.calls[0]?.[0] as string;
    expect(url).toBe("/api/health");
  });

  it("haengt Query-Parameter an und laesst undefined aus", async () => {
    const fetchMock = stubFetch(() => Promise.resolve(jsonResponse({ ok: true })));

    await request("/print-jobs", { query: { limit: 20, offset: undefined, failed: true } });

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/print-jobs?limit=20&failed=true");
  });

  it("uebersetzt den Fehler-Body der eigenen API in einen typisierten Fehler", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(
          {
            error: {
              code: "SPOOLMAN_UNREACHABLE",
              message: "Spoolman ist nicht erreichbar.",
              details: { attempts: 3 },
            },
          },
          502,
        ),
      ),
    );

    const error = await request("/health").catch((cause: unknown) => cause);

    expect(error).toBeInstanceOf(ApiError);
    const apiError = error as ApiError;
    expect(apiError.code).toBe("SPOOLMAN_UNREACHABLE");
    expect(apiError.status).toBe(502);
    expect(apiError.message).toBe("Spoolman ist nicht erreichbar.");
    expect(apiError.details).toEqual({ attempts: 3 });
  });

  it("versteht auch die flache Fehlerform ohne error-Huelle", async () => {
    stubFetch(() =>
      Promise.resolve(jsonResponse({ code: "PRINTER_OFFLINE", message: "Drucker offline." }, 409)),
    );

    const apiError = (await request("/print").catch((cause: unknown) => cause)) as ApiError;

    expect(apiError.code).toBe("PRINTER_OFFLINE");
    expect(apiError.message).toBe("Drucker offline.");
  });

  it("uebersetzt FastAPIs Validierungsformat (422)", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse(
          { detail: [{ loc: ["body", "location"], msg: "String zu lang", type: "value_error" }] },
          422,
        ),
      ),
    );

    const apiError = (await request("/spools").catch((cause: unknown) => cause)) as ApiError;

    expect(apiError.status).toBe(422);
    expect(apiError.message).toContain("body.location");
    expect(apiError.message).toContain("String zu lang");
  });

  it("faellt bei leerem Fehler-Body auf eine verstaendliche Meldung zurueck", async () => {
    stubFetch(() => Promise.resolve(new Response("", { status: 500 })));

    const apiError = (await request("/health").catch((cause: unknown) => cause)) as ApiError;

    expect(apiError.code).toBe("HTTP_ERROR");
    expect(apiError.message).toContain("HTTP 500");
  });

  it("macht aus einem Netzwerkfehler einen ApiError mit NETWORK_ERROR", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));

    const apiError = (await request("/health").catch((cause: unknown) => cause)) as ApiError;

    expect(apiError.code).toBe("NETWORK_ERROR");
    expect(apiError.isNetworkError).toBe(true);
    expect(apiError.message).toBe(texts.errors.network);
  });

  it("meldet eine nicht auswertbare Erfolgsantwort als INVALID_RESPONSE", async () => {
    stubFetch(() => Promise.resolve(new Response("kein JSON", { status: 200 })));

    const apiError = (await request("/health").catch((cause: unknown) => cause)) as ApiError;

    expect(apiError.code).toBe("INVALID_RESPONSE");
  });

  it("verweigert Pfade ohne fuehrenden Schraegstrich", async () => {
    stubFetch(() => Promise.resolve(jsonResponse({})));

    await expect(request("health")).rejects.toThrow(/beginnen/);
  });
});

describe("getHealth", () => {
  it("liefert Status, Datenbank, Spoolman, CUPS und Version", async () => {
    const fetchMock = stubFetch(() =>
      Promise.resolve(
        jsonResponse({
          status: "ok",
          database: "ok",
          spoolman: "ok",
          cups: "degraded",
          version: "0.1.0",
        }),
      ),
    );

    const health = await getHealth();

    expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/health");
    expect(health).toEqual({
      status: "ok",
      database: { state: "ok" },
      spoolman: { state: "ok" },
      cups: { state: "degraded" },
      version: "0.1.0",
    });
  });

  it("reicht Fehler als ApiError durch", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({ error: { code: "CUPS_UNREACHABLE", message: "Kein CUPS" } }, 503),
      ),
    );

    const apiError = (await getHealth().catch((cause: unknown) => cause)) as ApiError;

    expect(apiError).toBeInstanceOf(ApiError);
    expect(apiError.code).toBe("CUPS_UNREACHABLE");
  });

  it("bricht ab, wenn das Signal ausgeloest wird", async () => {
    const controller = new AbortController();
    stubFetch(
      () =>
        new Promise<Response>((_resolve, reject) => {
          controller.signal.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          });
        }),
    );

    const pending = getHealth(controller.signal).catch((cause: unknown) => cause);
    controller.abort();
    const apiError = (await pending) as ApiError;

    expect(apiError.code).toBe("REQUEST_ABORTED");
  });
});

describe("normalizeHealth", () => {
  it("akzeptiert Objektform und Detailtext", () => {
    const health = normalizeHealth({
      status: "degraded",
      database: { status: "ok" },
      spoolman: { status: "unreachable", detail: "Zeitueberschreitung" },
      cups: true,
      version: "1.2.3",
    });

    expect(health.status).toBe("degraded");
    expect(health.spoolman).toEqual({ state: "error", detail: "Zeitueberschreitung" });
    expect(health.cups.state).toBe("ok");
    expect(health.database.state).toBe("ok");
  });

  it("faellt bei unbekannten Werten auf 'unknown' zurueck", () => {
    const health = normalizeHealth({ status: 42, spoolman: null, version: 7 });

    expect(health.status).toBe("unknown");
    expect(health.spoolman.state).toBe("unknown");
    expect(health.version).toBe("");
  });
});

describe("ApiError", () => {
  it("behaelt den Ursprungsfehler als cause", () => {
    const cause = new Error("original");
    const error = new ApiError({ code: "INTERNAL_ERROR", message: "kaputt", cause });

    expect(error.cause).toBe(cause);
    expect(error.name).toBe("ApiError");
  });
});
