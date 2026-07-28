import { texts } from "../texts/de";

/**
 * Fehlerklassen der eigenen API (docs/architecture.md, Abschnitt 6).
 * Die Liste ist bewusst vollstaendig, damit die Oberflaeche gezielt auf
 * einzelne Faelle reagieren kann.
 */
export type KnownApiErrorCode =
  | "SPOOLMAN_UNREACHABLE"
  | "SPOOLMAN_AUTH_FAILED"
  | "SPOOLMAN_VALIDATION_FAILED"
  | "VENDOR_CREATE_FAILED"
  | "FILAMENT_CREATE_FAILED"
  | "SPOOL_CREATE_FAILED"
  | "SPOOL_FETCH_FAILED"
  | "TEMPLATE_NOT_FOUND"
  | "TEMPLATE_INVALID"
  | "TEMPLATE_RENDER_FAILED"
  | "QR_RENDER_FAILED"
  | "DATABASE_ERROR"
  | "CONFIGURATION_ERROR"
  | "IDEMPOTENCY_CONFLICT"
  | "INTERNAL_ERROR"
  | "CUPS_UNREACHABLE"
  | "PRINTER_NOT_FOUND"
  | "PRINTER_OFFLINE"
  | "PRINT_SUBMISSION_FAILED"
  | "PRINT_STATUS_UNKNOWN"
  | "PRINT_CANCEL_FAILED";

/** Zusaetzliche Codes, die ausschliesslich im Client entstehen. */
export type ClientErrorCode =
  "NETWORK_ERROR" | "INVALID_RESPONSE" | "REQUEST_ABORTED" | "HTTP_ERROR";

/** Beliebiger String, ohne die Autovervollstaendigung der Union zu verlieren. */
type OpenString = string & Record<never, never>;

/**
 * Unbekannte Codes einer neueren Backend-Version duerfen nicht zu einem
 * Typfehler fuehren — deshalb der offene String-Anteil.
 */
export type ApiErrorCode = KnownApiErrorCode | ClientErrorCode | OpenString;

export interface ApiErrorOptions {
  code: ApiErrorCode;
  message: string;
  /** HTTP-Status, 0 wenn die Anfrage den Server nie erreicht hat. */
  status?: number;
  /** Strukturierte Zusatzinformationen aus dem Fehler-Body. Nie Geheimnisse. */
  details?: unknown;
  cause?: unknown;
}

/** Typisierter Fehler fuer alle Aufrufe gegen `/api`. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: unknown;

  constructor(options: ApiErrorOptions) {
    super(options.message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "ApiError";
    this.code = options.code;
    this.status = options.status ?? 0;
    this.details = options.details;
  }

  /** True, wenn der Server gar nicht erreicht wurde. */
  get isNetworkError(): boolean {
    return this.code === "NETWORK_ERROR" || this.status === 0;
  }
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function asNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

/**
 * Uebersetzt FastAPIs Validierungs-Body (`{"detail": [...]}`) in einen Satz.
 * Spoolman und FastAPI benutzen dieses Format bei 422.
 */
function formatValidationDetail(detail: unknown): string | undefined {
  if (!Array.isArray(detail)) {
    return undefined;
  }
  const parts: string[] = [];
  for (const entry of detail) {
    const record = asRecord(entry);
    if (!record) {
      continue;
    }
    const msg = asNonEmptyString(record["msg"]);
    if (!msg) {
      continue;
    }
    const loc = Array.isArray(record["loc"])
      ? record["loc"]
          .filter((part) => typeof part === "string" || typeof part === "number")
          .join(".")
      : undefined;
    parts.push(loc ? `${loc}: ${msg}` : msg);
  }
  return parts.length > 0 ? parts.join("; ") : undefined;
}

/**
 * Uebersetzt einen Fehler-Body in Code, Meldung und Details.
 *
 * Akzeptiert werden — in dieser Reihenfolge:
 *  1. `{"error": {"code": ..., "message": ..., "details": ...}}` (eigene API)
 *  2. `{"code": ..., "message": ...}` (flache Variante)
 *  3. `{"detail": "..."}` bzw. `{"detail": [...]}` (FastAPI)
 *  4. `{"message": "..."}` (Spoolman bei 400/403/404/500)
 *  5. Klartext oder leerer Body
 */
export function parseErrorPayload(
  status: number,
  payload: unknown,
): { code: ApiErrorCode; message: string; details: unknown } {
  const fallbackCode: ApiErrorCode = "HTTP_ERROR";

  if (typeof payload === "string") {
    const message = asNonEmptyString(payload);
    return {
      code: fallbackCode,
      message: message ?? `${texts.errors.http} (HTTP ${status})`,
      details: undefined,
    };
  }

  const root = asRecord(payload);
  if (!root) {
    return {
      code: fallbackCode,
      message: `${texts.errors.http} (HTTP ${status})`,
      details: undefined,
    };
  }

  const nested = asRecord(root["error"]);
  const source = nested ?? root;

  const code = asNonEmptyString(source["code"]) ?? fallbackCode;
  const message =
    asNonEmptyString(source["message"]) ??
    asNonEmptyString(root["detail"]) ??
    formatValidationDetail(root["detail"]) ??
    `${texts.errors.http} (HTTP ${status})`;

  const details = source["details"] ?? root["detail"] ?? undefined;

  return { code, message, details };
}
