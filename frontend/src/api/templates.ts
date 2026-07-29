import { API_BASE_PATH, request } from "./client";
import { ApiError, parseErrorPayload } from "./errors";

/** Spiegelt `app/schemas/template.py::TemplateRead`. */
export interface LabelTemplate {
  id: number;
  name: string;
  description: string | null;
  html_content: string;
  css_content: string;
  width_mm: number;
  height_mm: number;
  dpi: number;
  output_format: string;
  qr_content_mode: string;
  is_default: boolean;
  is_builtin: boolean;
  created_at: string;
  updated_at: string;
}

export interface TemplateInput {
  name: string;
  description?: string | null;
  html_content: string;
  css_content?: string;
  width_mm: number;
  height_mm: number;
  is_default?: boolean;
}

export interface TemplateImportResult {
  template: LabelTemplate;
  unknown_tags: string[];
}

export function listTemplates(signal?: AbortSignal): Promise<LabelTemplate[]> {
  return request<LabelTemplate[]>("/templates", signal ? { signal } : {});
}

export function createTemplate(data: TemplateInput): Promise<LabelTemplate> {
  return request<LabelTemplate>("/templates", { method: "POST", body: data });
}

export function updateTemplate(id: number, data: Partial<TemplateInput>): Promise<LabelTemplate> {
  return request<LabelTemplate>(`/templates/${id}`, { method: "PATCH", body: data });
}

export function deleteTemplate(id: number): Promise<void> {
  return request<void>(`/templates/${id}`, { method: "DELETE" });
}

export function duplicateTemplate(id: number, name: string): Promise<LabelTemplate> {
  return request<LabelTemplate>(`/templates/${id}/duplicate`, {
    method: "POST",
    body: { name },
  });
}

export function importSpoolmanTemplate(
  preset: Record<string, unknown>,
  name?: string,
): Promise<TemplateImportResult> {
  return request<TemplateImportResult>("/templates/import-spoolman", {
    method: "POST",
    body: name ? { preset, name } : { preset },
  });
}

/**
 * Lädt eine PDF-Vorschau. Anders als {@link request}, das ausschließlich JSON
 * verarbeitet — die Vorschau liefert `application/pdf`.
 */
async function fetchPdf(path: string, body: unknown): Promise<Blob> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_PATH}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/pdf" },
      body: JSON.stringify(body),
      credentials: "same-origin",
    });
  } catch (cause) {
    throw new ApiError({ code: "NETWORK_ERROR", message: "Netzwerkfehler", cause });
  }
  if (!response.ok) {
    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      payload = undefined;
    }
    const parsed = parseErrorPayload(response.status, payload);
    throw new ApiError({
      code: parsed.code,
      message: parsed.message,
      status: response.status,
      details: parsed.details,
    });
  }
  return response.blob();
}

export function previewTemplate(data: {
  html_content: string;
  css_content: string;
  width_mm: number;
  height_mm: number;
}): Promise<Blob> {
  return fetchPdf("/templates/preview", data);
}

export async function previewSavedTemplate(id: number): Promise<Blob> {
  const response = await fetch(`${API_BASE_PATH}/templates/${id}/preview`, {
    credentials: "same-origin",
  });
  if (!response.ok) {
    throw new ApiError({
      code: "HTTP_ERROR",
      message: "Vorschau fehlgeschlagen",
      status: response.status,
    });
  }
  return response.blob();
}
