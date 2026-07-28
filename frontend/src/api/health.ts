import { request } from "./client";

/** Zustand einer einzelnen Komponente. */
export type HealthState = "ok" | "degraded" | "error" | "unknown";

export interface HealthComponent {
  state: HealthState;
  /** Optionale technische Erlaeuterung, z. B. "Zeitueberschreitung". */
  detail?: string;
}

/** Normalisierte Antwort von `GET /api/health`. */
export interface Health {
  status: HealthState;
  database: HealthComponent;
  spoolman: HealthComponent;
  cups: HealthComponent;
  version: string;
}

const STATE_ALIASES: Readonly<Record<string, HealthState>> = {
  ok: "ok",
  up: "ok",
  healthy: "ok",
  online: "ok",
  reachable: "ok",
  connected: "ok",
  true: "ok",
  degraded: "degraded",
  warning: "degraded",
  warn: "degraded",
  partial: "degraded",
  error: "error",
  down: "error",
  unhealthy: "error",
  offline: "error",
  unreachable: "error",
  failed: "error",
  false: "error",
  unknown: "unknown",
};

function toState(value: unknown): HealthState {
  if (typeof value === "boolean") {
    return value ? "ok" : "error";
  }
  if (typeof value === "string") {
    return STATE_ALIASES[value.trim().toLowerCase()] ?? "unknown";
  }
  return "unknown";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Liest eine Komponente. Das Backend darf sowohl `"ok"` als auch
 * `{ "status": "ok", "detail": "..." }` liefern.
 */
function toComponent(value: unknown): HealthComponent {
  if (isRecord(value)) {
    const state = toState(value["status"] ?? value["state"]);
    const rawDetail = value["detail"] ?? value["message"] ?? value["error"];
    const detail = typeof rawDetail === "string" && rawDetail.length > 0 ? rawDetail : undefined;
    return detail === undefined ? { state } : { state, detail };
  }
  return { state: toState(value) };
}

export function normalizeHealth(payload: unknown): Health {
  const root = isRecord(payload) ? payload : {};
  const version = typeof root["version"] === "string" ? root["version"] : "";
  return {
    status: toState(root["status"]),
    database: toComponent(root["database"]),
    spoolman: toComponent(root["spoolman"]),
    cups: toComponent(root["cups"]),
    version,
  };
}

/**
 * Fragt `GET /api/health` ab.
 *
 * Wirft einen {@link import("./errors").ApiError}, wenn der Server nicht
 * erreichbar ist oder mit einem Fehler antwortet.
 */
export async function getHealth(signal?: AbortSignal): Promise<Health> {
  const payload = await request<unknown>("/health", signal ? { signal } : {});
  return normalizeHealth(payload);
}
