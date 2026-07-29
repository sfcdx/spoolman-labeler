import { API_BASE_PATH, request } from "./client";
import { ApiError, parseErrorPayload } from "./errors";
import type { PrintJob } from "./printJobs";

export interface WorkflowError {
  code: string;
  message: string;
}

/** Spiegelt die Antwort von `POST /api/workflows/create-and-print`. */
export interface WorkflowRunResult {
  workflow_id: number;
  status: "pending" | "creating" | "printing" | "completed" | "partial" | "failed";
  created_spool_ids: number[];
  print_job_ids: number[];
  error: WorkflowError | null;
}

export interface NewFilamentInput {
  density: number;
  diameter: number;
  name?: string | null;
  vendor_id?: number | null;
  material?: string | null;
  color_hex?: string | null;
}

export interface SpoolFieldsInput {
  initial_weight?: number | null;
  spool_weight?: number | null;
  used_weight?: number | null;
  location?: string | null;
  lot_nr?: string | null;
  comment?: string | null;
}

export interface CreateAndPrintInput {
  idempotency_key: string;
  filament_id?: number | null;
  new_filament?: NewFilamentInput | null;
  spool: SpoolFieldsInput;
  quantity: number;
  /** `null`/weggelassen löst serverseitig die Standardvorlage auf. */
  template_id?: number | null;
  /** `null`/weggelassen löst serverseitig den Standarddrucker auf. */
  printer_id?: number | null;
  copies?: number | null;
}

export interface PrintExistingInput {
  spool_id: number;
  /** `null`/weggelassen löst serverseitig die Standardvorlage auf. */
  template_id?: number | null;
  /** `null`/weggelassen löst serverseitig den Standarddrucker auf. */
  printer_id?: number | null;
  copies?: number | null;
}

function isWorkflowRunResult(value: unknown): value is WorkflowRunResult {
  return (
    typeof value === "object" &&
    value !== null &&
    "workflow_id" in value &&
    "created_spool_ids" in value
  );
}

/**
 * Legt Spulen an und druckt im selben Vorgang.
 *
 * Der Server antwortet je nach Ergebnis mit HTTP 200 (`completed`), 207
 * (`partial`) oder 502 (`failed`) — in allen drei Fällen mit demselben,
 * vollständig auswertbaren Body (siehe workflows.py `_serialize`). Der
 * generische `request()`-Wrapper würde den Body bei 207/502 verwerfen und
 * nur einen {@link ApiError} werfen — hier bewusst nicht verwendet, weil
 * damit `created_spool_ids` verloren ginge: genau die Information, die eine
 * bereits angelegte, aber nicht gedruckte Spule sichtbar macht (ADR-012).
 * Ein echter Transport- oder Validierungsfehler (kein Vorlagen-/Drucker-Body)
 * wird weiterhin als {@link ApiError} geworfen.
 */
export async function createAndPrint(data: CreateAndPrintInput): Promise<WorkflowRunResult> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_PATH}/workflows/create-and-print`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data),
      credentials: "same-origin",
    });
  } catch (cause) {
    throw new ApiError({ code: "NETWORK_ERROR", message: "Netzwerkfehler", cause });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiError({
      code: "INVALID_RESPONSE",
      message: "Der Server hat eine unerwartete Antwort geliefert.",
      status: response.status,
      cause,
    });
  }

  if (isWorkflowRunResult(payload)) {
    return payload;
  }

  const parsed = parseErrorPayload(response.status, payload);
  throw new ApiError({
    code: parsed.code,
    message: parsed.message,
    status: response.status,
    details: parsed.details,
  });
}

export function getWorkflow(id: number): Promise<WorkflowRunResult> {
  return request<WorkflowRunResult>(`/workflows/${id}`);
}

function isPrintJob(value: unknown): value is PrintJob {
  return typeof value === "object" && value !== null && "id" in value && "status" in value;
}

/**
 * Druckt eine bereits in Spoolman vorhandene Spule, ohne etwas anzulegen.
 *
 * Wie `create-and-print` antwortet der Server bei `status === "failed"` mit
 * HTTP 502, aber demselben, vollständig auswertbaren `PrintJobRead`-Body
 * (siehe `backend/app/api/routes/workflows.py::print_existing`) — der
 * generische `request()`-Wrapper würde diesen Body bei 502 verwerfen. Daher
 * bewusst derselbe Fetch-Trick wie bei {@link createAndPrint}.
 */
export async function printExisting(data: PrintExistingInput): Promise<PrintJob> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_PATH}/workflows/print-existing`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(data),
      credentials: "same-origin",
    });
  } catch (cause) {
    throw new ApiError({ code: "NETWORK_ERROR", message: "Netzwerkfehler", cause });
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch (cause) {
    throw new ApiError({
      code: "INVALID_RESPONSE",
      message: "Der Server hat eine unerwartete Antwort geliefert.",
      status: response.status,
      cause,
    });
  }

  if (isPrintJob(payload)) {
    return payload;
  }

  const parsed = parseErrorPayload(response.status, payload);
  throw new ApiError({
    code: parsed.code,
    message: parsed.message,
    status: response.status,
    details: parsed.details,
  });
}
