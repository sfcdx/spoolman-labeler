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

const APP_SETTINGS = {
  spoolman_public_url: "http://localhost:7912",
  spoolman_public_url_overridden: false,
  cups_server: "cups",
  cups_server_overridden: false,
  cups_port: 631,
  cups_port_overridden: false,
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

  it("speichert die Spoolman-URL und zeigt einen Öffnen-Link", async () => {
    const user = setupUser();
    let saved: unknown;
    stubRoutedFetch([
      [/\/api\/printers$/, () => jsonResponse([])],
      [
        /\/api\/settings$/,
        (_url, init) => {
          if (init?.method === "PUT") {
            saved = JSON.parse(init.body as string);
            return jsonResponse({
              ...APP_SETTINGS,
              spoolman_public_url: "http://spoolman.local:7912",
              spoolman_public_url_overridden: true,
            });
          }
          return jsonResponse(APP_SETTINGS);
        },
      ],
    ]);

    renderWithProviders(<SettingsPage />);
    const input = await screen.findByPlaceholderText(page.fields.spoolmanUrl);
    await user.clear(input);
    await user.type(input, "http://spoolman.local:7912");
    const [saveButton] = screen.getAllByRole("button", { name: page.connection.save });
    if (!saveButton) {
      throw new Error("Speichern-Schaltfläche nicht gefunden");
    }
    await user.click(saveButton);

    await waitFor(() => {
      expect(saved).toEqual({ spoolman_public_url: "http://spoolman.local:7912" });
    });
    await screen.findByRole("link", { name: page.connection.openSpoolman });
    expect(screen.getByText(page.connection.overridden)).toBeInTheDocument();
  });

  it("sucht Drucker auf dem CUPS-Server und uebernimmt eine gefundene Warteschlange", async () => {
    const user = setupUser();
    stubRoutedFetch([
      [
        /\/api\/printers\/discover$/,
        () =>
          jsonResponse([
            { queue_name: "M110S", model: "Phomemo M110S", location: null, supported: true },
          ]),
      ],
      [/\/api\/printers$/, () => jsonResponse([])],
      [/\/api\/settings$/, () => jsonResponse(APP_SETTINGS)],
    ]);

    renderWithProviders(<SettingsPage />);
    await user.click(screen.getByRole("button", { name: page.discover.button }));

    await screen.findByText("M110S");
    await user.click(screen.getByRole("button", { name: page.discover.use }));

    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByPlaceholderText(page.fields.queueName)).toHaveValue("M110S");
    expect(within(dialog).getByPlaceholderText(page.fields.name)).toHaveValue("Phomemo M110S");
  });
});
