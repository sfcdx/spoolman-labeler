import { request } from "./client";

/** Spiegelt `app/schemas/printer.py::PrinterRead`. */
export interface Printer {
  id: number;
  name: string;
  queue_name: string;
  backend_type: string;
  cups_server: string | null;
  cups_port: number | null;
  use_tls: boolean;
  location: string | null;
  model: string | null;
  default_template_id: number | null;
  label_width_mm: number;
  label_height_mm: number;
  dpi: number;
  horizontal_offset_mm: number;
  vertical_offset_mm: number;
  scale_percent: number;
  copies: number;
  is_default: boolean;
  is_enabled: boolean;
  last_seen_at: string | null;
  last_status: string | null;
  last_error: string | null;
  created_at: string;
  updated_at: string;
}

export interface PrinterInput {
  name: string;
  queue_name: string;
  cups_server?: string | null;
  cups_port?: number | null;
  location?: string | null;
  model?: string | null;
  label_width_mm?: number;
  label_height_mm?: number;
  copies?: number;
  is_default?: boolean;
  is_enabled?: boolean;
}

export interface PrinterTestResult {
  status: string;
  detail: string | null;
}

export function listPrinters(signal?: AbortSignal): Promise<Printer[]> {
  return request<Printer[]>("/printers", signal ? { signal } : {});
}

export function createPrinter(data: PrinterInput): Promise<Printer> {
  return request<Printer>("/printers", { method: "POST", body: data });
}

export function updatePrinter(id: number, data: Partial<PrinterInput>): Promise<Printer> {
  return request<Printer>(`/printers/${id}`, { method: "PATCH", body: data });
}

export function deletePrinter(id: number): Promise<void> {
  return request<void>(`/printers/${id}`, { method: "DELETE" });
}

export function testPrinter(id: number): Promise<PrinterTestResult> {
  return request<PrinterTestResult>(`/printers/${id}/test`, { method: "POST" });
}
