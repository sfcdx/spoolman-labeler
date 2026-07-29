import { request } from "./client";

export type PrintJobStatus =
  "queued" | "submitted" | "processing" | "completed" | "failed" | "cancelled" | "unknown";

/** Spiegelt `app/schemas/print_job.py::PrintJobRead`. */
export interface PrintJob {
  id: number;
  spoolman_spool_id: number;
  printer_id: number | null;
  template_id: number | null;
  workflow_run_id: number | null;
  status: PrintJobStatus;
  copies: number;
  cups_job_id: number | null;
  cups_job_state: string | null;
  cups_job_state_reasons: string | null;
  error_code: string | null;
  error_message: string | null;
  attempt_count: number;
  submitted_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export function listPrintJobs(
  params: { status?: PrintJobStatus } = {},
  signal?: AbortSignal,
): Promise<PrintJob[]> {
  return request<PrintJob[]>("/print-jobs", {
    query: { status: params.status },
    ...(signal ? { signal } : {}),
  });
}

export function retryPrintJob(id: number): Promise<PrintJob> {
  return request<PrintJob>(`/print-jobs/${id}/retry`, { method: "POST" });
}
