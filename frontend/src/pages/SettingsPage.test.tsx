import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { SettingsPage } from "./SettingsPage";
import { matchMediaController } from "../test/matchMedia";
import { jsonResponse, renderWithProviders, setupUser, stubRoutedFetch } from "../test/utils";
import { texts } from "../texts/de";

const page = texts.pages.settings;

const PRINTER = {
  id: 1,
  name: "Werkstattdrucker",
  queue_name: "M110S",
  backend_type: "cups",
  cups_server: null,
  cups_port: null,
  use_tls: false,
  location: null,
  model: null,
  default_template_id: null,
  label_width_mm: 40,
  label_height_mm: 30,
  dpi: 300,
  horizontal_offset_mm: 0,
  vertical_offset_mm: 0,
  scale_percent: 100,
  copies: 1,
  is_default: true,
  is_enabled: true,
  last_seen_at: null,
  last_status: null,
  last_error: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("SettingsPage", () => {
  it("zeigt geladene Drucker mit Standard-Kennzeichnung", async () => {
    stubRoutedFetch([[/\/api\/printers$/, () => jsonResponse([PRINTER])]]);

    renderWithProviders(<SettingsPage />);

    await screen.findByText(PRINTER.name);
    expect(screen.getByText("Standard")).toBeInTheDocument();
  });

  it("legt einen neuen Drucker an", async () => {
    let created = false;
    const user = setupUser();
    stubRoutedFetch([
      [
        /\/api\/printers$/,
        (_url, init) => {
          if (init?.method === "POST") {
            created = true;
            return jsonResponse({ ...PRINTER, id: 2, name: "Zweitdrucker" }, 201);
          }
          return jsonResponse(
            created ? [PRINTER, { ...PRINTER, id: 2, name: "Zweitdrucker" }] : [PRINTER],
          );
        },
      ],
    ]);

    renderWithProviders(<SettingsPage />);
    await screen.findByText(PRINTER.name);

    await user.click(screen.getByRole("button", { name: page.printers.add }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText(page.fields.name), "Zweitdrucker");
    await user.type(within(dialog).getByPlaceholderText(page.fields.queueName), "Q2");
    await user.click(within(dialog).getByRole("button", { name: page.printers.save }));

    await waitFor(() => {
      expect(created).toBe(true);
    });
    await screen.findByText("Zweitdrucker");
  });

  it("zeigt das Ergebnis einer Testverbindung", async () => {
    const user = setupUser();
    stubRoutedFetch([
      [/\/api\/printers\/1\/test$/, () => jsonResponse({ status: "ok", detail: null })],
      [/\/api\/printers$/, () => jsonResponse([PRINTER])],
    ]);

    renderWithProviders(<SettingsPage />);
    await screen.findByText(PRINTER.name);

    await user.click(screen.getByRole("button", { name: page.printers.test }));

    await screen.findByText("ok");
  });

  it("stapelt Listeneintraege auf dem Handy statt sie nebeneinander zu zeigen", async () => {
    matchMediaController.setMobile(true);
    stubRoutedFetch([[/\/api\/printers$/, () => jsonResponse([PRINTER])]]);

    renderWithProviders(<SettingsPage />);

    await screen.findByText(PRINTER.name);
    expect(document.querySelector(".ant-list-vertical")).toBeInTheDocument();
  });
});
