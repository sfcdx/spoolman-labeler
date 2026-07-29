export { API_BASE_PATH, request, toApiError } from "./client";
export type { RequestOptions } from "./client";
export { ApiError, parseErrorPayload } from "./errors";
export type { ApiErrorCode, ClientErrorCode, KnownApiErrorCode } from "./errors";
export { getHealth, normalizeHealth } from "./health";
export type { Health, HealthComponent, HealthState } from "./health";
export {
  createPrinter,
  deletePrinter,
  discoverPrinters,
  listPrinters,
  testPrinter,
  updatePrinter,
} from "./printers";
export type { DiscoveredPrinter, Printer, PrinterInput, PrinterTestResult } from "./printers";
export { clearAppSetting, getAppSettings, updateAppSettings } from "./settings";
export type { AppSettings, AppSettingKey, AppSettingsInput } from "./settings";
export {
  createTemplate,
  deleteTemplate,
  duplicateTemplate,
  importSpoolmanTemplate,
  listTemplates,
  previewSavedTemplate,
  previewTemplate,
  updateTemplate,
} from "./templates";
export type { LabelTemplate, TemplateImportResult, TemplateInput } from "./templates";
export { createAndPrint, getWorkflow } from "./workflows";
export type {
  CreateAndPrintInput,
  NewFilamentInput,
  SpoolFieldsInput,
  WorkflowError,
  WorkflowRunResult,
} from "./workflows";
export { listPrintJobs, retryPrintJob } from "./printJobs";
export type { PrintJob, PrintJobStatus } from "./printJobs";
export { createVendor, listPrintPresets, searchFilaments, searchVendors } from "./spoolman";
export type { SpoolmanFilament, SpoolmanVendor } from "./spoolman";
