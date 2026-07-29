import { request } from "./client";

/** Spiegelt `app/schemas/settings.py::AppSettingsRead`. */
export interface AppSettings {
  spoolman_public_url: string;
  spoolman_public_url_overridden: boolean;
  cups_server: string;
  cups_server_overridden: boolean;
  cups_port: number;
  cups_port_overridden: boolean;
}

export interface AppSettingsInput {
  spoolman_public_url?: string;
  cups_server?: string;
  cups_port?: number;
}

export type AppSettingKey = "spoolman_public_url" | "cups_server" | "cups_port";

export function getAppSettings(signal?: AbortSignal): Promise<AppSettings> {
  return request<AppSettings>("/settings", signal ? { signal } : {});
}

export function updateAppSettings(data: AppSettingsInput): Promise<AppSettings> {
  return request<AppSettings>("/settings", { method: "PUT", body: data });
}

export function clearAppSetting(key: AppSettingKey): Promise<AppSettings> {
  return request<AppSettings>(`/settings/${key}`, { method: "DELETE" });
}
