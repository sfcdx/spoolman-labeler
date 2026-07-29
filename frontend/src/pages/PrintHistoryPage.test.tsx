import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { PrintHistoryPage } from "./PrintHistoryPage";
import { matchMediaController } from "../test/matchMedia";
import { jsonResponse, renderWithProviders, setupUser, stubRoutedFetch } from "../test/utils";
import { texts } from "../texts/de";

const page = texts.pages.history;

const FAILED_JOB = {
  id: 5,
  spoolman_spool_id: 42,
  printer_id: 1,
  template_id: 1,
  workflow_run_id: null,
  status: "failed",
  copies: 1,
  cups_job_id: null,
  cups_job_state: null,
  cups_job_state_reasons: null,
  error_code: "CUPS_UNREACHABLE",
  error_message: "Das Drucksystem ist nicht erreichbar.",
  attempt_count: 1,
  submitted_at: null,
  completed_at: "2026-01-01T00:00:00Z",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

const COMPLETED_JOB = {
  ...FAILED_JOB,
  id: 6,
  status: "completed",
  error_code: null,
  error_message: null,
};

describe("PrintHistoryPage", () => {
  it("zeigt Status und Fehlermeldung fehlgeschlagener Auftraege", async () => {
    stubRoutedFetch([[/\/api\/print-jobs/, () => jsonResponse([FAILED_JOB])]]);

    renderWithProviders(<PrintHistoryPage />);

    await screen.findByText(page.spoolLabel(42));
    expect(screen.getByText(page.status.failed)).toBeInTheDocument();
    expect(screen.getByText(FAILED_JOB.error_message)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: page.retry })).toBeInTheDocument();
  });

  it("bietet fuer abgeschlossene Auftraege keinen erneuten Druck an", async () => {
    stubRoutedFetch([[/\/api\/print-jobs/, () => jsonResponse([COMPLETED_JOB])]]);

    renderWithProviders(<PrintHistoryPage />);

    await screen.findByText(page.spoolLabel(42));
    expect(screen.queryByRole("button", { name: page.retry })).not.toBeInTheDocument();
  });

  it("loest bei Klick auf 'Erneut drucken' den Retry-Endpunkt aus", async () => {
    let retried = false;
    const user = setupUser();
    stubRoutedFetch([
      [
        /\/api\/print-jobs\/5\/retry$/,
        () => {
          retried = true;
          return jsonResponse({ ...FAILED_JOB, status: "submitted", error_message: null });
        },
      ],
      [/\/api\/print-jobs/, () => jsonResponse([FAILED_JOB])],
    ]);

    renderWithProviders(<PrintHistoryPage />);
    await screen.findByText(page.spoolLabel(42));

    await user.click(screen.getByRole("button", { name: page.retry }));

    await waitFor(() => {
      expect(retried).toBe(true);
    });
  });

  it("zeigt auf dem Handy eine Kartenliste statt der Tabelle", async () => {
    matchMediaController.setMobile(true);
    stubRoutedFetch([[/\/api\/print-jobs/, () => jsonResponse([FAILED_JOB])]]);

    renderWithProviders(<PrintHistoryPage />);

    await screen.findByText(page.spoolLabel(42));
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: page.retry })).toBeInTheDocument();
  });
});
