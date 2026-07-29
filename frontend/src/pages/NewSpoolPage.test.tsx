import { describe, expect, it } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { NewSpoolPage } from "./NewSpoolPage";
import { jsonResponse, renderWithProviders, setupUser, stubRoutedFetch } from "../test/utils";
import { texts } from "../texts/de";

const page = texts.pages.newSpool;

const TEMPLATE = {
  id: 1,
  name: "Standard 62x29 mm",
  description: null,
  html_content: "<p>{{ spool.id }}</p>",
  css_content: "",
  width_mm: 62,
  height_mm: 29,
  dpi: 300,
  output_format: "pdf",
  qr_content_mode: "spoolman_uri",
  is_default: true,
  is_builtin: true,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

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

const FILAMENT = {
  id: 10,
  name: "PLA Beispiel",
  material: "PLA",
  color_hex: "1E88E5",
  density: 1.24,
  diameter: 1.75,
  vendor: { id: 1, name: "ACME" },
};

async function goToLabelStep(user: ReturnType<typeof setupUser>): Promise<void> {
  // AntD's `Select` zeigt den Platzhalter als eigenes <span>, nicht als
  // `placeholder`-Attribut des zugrunde liegenden Suchfelds — deshalb hier
  // ueber die ARIA-Rolle statt ueber `getByPlaceholderText` angesprochen.
  const searchInput = screen.getByRole("combobox");
  await user.type(searchInput, "PLA");
  const option = await screen.findByText(/ACME.*PLA Beispiel/);
  await user.click(option);
  await waitFor(() => {
    expect(screen.getByRole("button", { name: page.submit.next })).toBeEnabled();
  });
  await user.click(screen.getByRole("button", { name: page.submit.next }));

  await screen.findByRole("button", { name: page.submit.next });
  await user.click(screen.getByRole("button", { name: page.submit.next }));

  await waitFor(() => {
    expect(screen.getByRole("button", { name: page.submit.next })).toBeEnabled();
  });
  await user.click(screen.getByRole("button", { name: page.submit.next }));
}

describe("NewSpoolPage", () => {
  it("legt eine bestehende Filament-Spule an und druckt erfolgreich", async () => {
    const user = setupUser();
    stubRoutedFetch([
      [/\/api\/templates$/, () => jsonResponse([TEMPLATE])],
      [/\/api\/printers$/, () => jsonResponse([PRINTER])],
      [/\/api\/spoolman\/filaments/, () => jsonResponse([FILAMENT])],
      [
        /\/api\/workflows\/create-and-print$/,
        () =>
          jsonResponse({
            workflow_id: 1,
            status: "completed",
            created_spool_ids: [101],
            print_job_ids: [1],
            error: null,
          }),
      ],
    ]);

    renderWithProviders(<NewSpoolPage />);
    await screen.findByRole("heading", { level: 1, name: page.title });

    await goToLabelStep(user);
    await user.click(screen.getByRole("button", { name: page.submit.action }));

    await screen.findByText(page.submit.statusLabel.completed);
    expect(screen.getByText("101")).toBeInTheDocument();
  });

  it("zeigt einen Teilerfolg, wenn der Druck fehlschlaegt, ohne die Spule zu verlieren", async () => {
    const user = setupUser();
    stubRoutedFetch([
      [/\/api\/templates$/, () => jsonResponse([TEMPLATE])],
      [/\/api\/printers$/, () => jsonResponse([PRINTER])],
      [/\/api\/spoolman\/filaments/, () => jsonResponse([FILAMENT])],
      [
        /\/api\/workflows\/create-and-print$/,
        () =>
          jsonResponse(
            {
              workflow_id: 2,
              status: "partial",
              created_spool_ids: [202],
              print_job_ids: [2],
              error: null,
            },
            207,
          ),
      ],
    ]);

    renderWithProviders(<NewSpoolPage />);
    await screen.findByRole("heading", { level: 1, name: page.title });

    await goToLabelStep(user);
    await user.click(screen.getByRole("button", { name: page.submit.action }));

    await screen.findByText(page.submit.statusLabel.partial);
    expect(screen.getByText("202")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: page.submit.goToHistory })).toBeInTheDocument();
  });
});
