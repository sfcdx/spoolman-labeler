import { texts } from "../texts/de";
import { ApiError, parseErrorPayload } from "./errors";

/**
 * Basispfad der eigenen API.
 *
 * Bewusst relativ: kein Hostname, kein Port, keine Build-Zeit-Variable.
 * In der Entwicklung leitet der Vite-Proxy `/api` weiter, in der Produktion
 * liefert dasselbe Backend Oberflaeche und API unter einer Origin aus.
 */
export const API_BASE_PATH = "/api";

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Wird als JSON serialisiert. */
  body?: unknown;
  /** Query-Parameter; `undefined`/`null` werden ausgelassen. */
  query?: Record<string, string | number | boolean | undefined | null>;
  signal?: AbortSignal;
  headers?: Record<string, string>;
}

function buildUrl(path: string, query: RequestOptions["query"]): string {
  if (!path.startsWith("/")) {
    throw new Error(`API-Pfad muss mit "/" beginnen: ${path}`);
  }
  const url = `${API_BASE_PATH}${path}`;
  if (!query) {
    return url;
  }
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null) {
      params.append(key, String(value));
    }
  }
  const serialized = params.toString();
  return serialized.length > 0 ? `${url}?${serialized}` : url;
}

/** Liest den Body defensiv: JSON, sonst Klartext, sonst `undefined`. */
async function readPayload(response: Response): Promise<unknown> {
  let raw: string;
  try {
    raw = await response.text();
  } catch {
    return undefined;
  }
  if (raw.trim().length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/**
 * Schlanker `fetch`-Wrapper gegen `/api`.
 *
 * Jeder Fehlerfall — Netzwerk, HTTP-Status, unlesbarer Body — verlaesst diese
 * Funktion als {@link ApiError} mit maschinenlesbarem `code`.
 */
export async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, query, signal, headers } = options;

  const requestHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };
  if (body !== undefined) {
    requestHeaders["Content-Type"] = "application/json";
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers: requestHeaders,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
      credentials: "same-origin",
    });
  } catch (cause) {
    if (cause instanceof DOMException && cause.name === "AbortError") {
      throw new ApiError({
        code: "REQUEST_ABORTED",
        message: texts.errors.aborted,
        cause,
      });
    }
    throw new ApiError({
      code: "NETWORK_ERROR",
      message: texts.errors.network,
      cause,
    });
  }

  if (!response.ok) {
    const payload = await readPayload(response);
    const parsed = parseErrorPayload(response.status, payload);
    throw new ApiError({
      code: parsed.code,
      message: parsed.message,
      status: response.status,
      details: parsed.details,
    });
  }

  if (response.status === 204) {
    return undefined as T;
  }

  const payload = await readPayload(response);
  if (payload === undefined || typeof payload === "string") {
    throw new ApiError({
      code: "INVALID_RESPONSE",
      message: texts.errors.invalidResponse,
      status: response.status,
      details: payload,
    });
  }
  return payload as T;
}

/** Normalisiert einen beliebigen `catch`-Wert zu einem {@link ApiError}. */
export function toApiError(error: unknown): ApiError {
  if (error instanceof ApiError) {
    return error;
  }
  if (error instanceof DOMException && error.name === "AbortError") {
    return new ApiError({ code: "REQUEST_ABORTED", message: texts.errors.aborted, cause: error });
  }
  return new ApiError({
    code: "INTERNAL_ERROR",
    message: error instanceof Error ? error.message : texts.errors.unknown,
    cause: error,
  });
}
