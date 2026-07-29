import { describe, expect, it } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import { TemplatesPage } from "./TemplatesPage";
import { jsonResponse, renderWithProviders, setupUser, stubRoutedFetch } from "../test/utils";
import { texts } from "../texts/de";

const page = texts.pages.templates;

const BUILTIN_TEMPLATE = {
  id: 1,
  name: "Standard 62x29 mm",
  description: "Mitgeliefert",
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

describe("TemplatesPage", () => {
  it("zeigt geladene Vorlagen und schuetzt die eingebaute Vorlage", async () => {
    stubRoutedFetch([[/\/api\/templates$/, () => jsonResponse([BUILTIN_TEMPLATE])]]);

    renderWithProviders(<TemplatesPage />);

    await screen.findByText(BUILTIN_TEMPLATE.name);
    expect(screen.getByText(page.builtin)).toBeInTheDocument();

    const editButton = screen.getByRole("button", { name: page.actions.edit });
    const deleteButton = screen.getByRole("button", { name: page.actions.delete });
    expect(editButton).toBeDisabled();
    expect(deleteButton).toBeDisabled();
  });

  it("legt eine neue Vorlage an und laedt die Liste danach neu", async () => {
    let created = false;
    const user = setupUser();
    stubRoutedFetch([
      [
        /\/api\/templates$/,
        (_url, init) => {
          if (init?.method === "POST") {
            created = true;
            return jsonResponse(
              { ...BUILTIN_TEMPLATE, id: 2, name: "Eigene Vorlage", is_builtin: false },
              201,
            );
          }
          return jsonResponse(
            created
              ? [
                  BUILTIN_TEMPLATE,
                  { ...BUILTIN_TEMPLATE, id: 2, name: "Eigene Vorlage", is_builtin: false },
                ]
              : [BUILTIN_TEMPLATE],
          );
        },
      ],
    ]);

    renderWithProviders(<TemplatesPage />);
    await screen.findByText(BUILTIN_TEMPLATE.name);

    await user.click(screen.getByRole("button", { name: page.create }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByPlaceholderText(page.fields.name), "Eigene Vorlage");
    await user.type(within(dialog).getByPlaceholderText(page.fields.html), "<p>x</p>");
    await user.click(within(dialog).getByRole("button", { name: page.actions.save }));

    await waitFor(() => {
      expect(created).toBe(true);
    });
    await screen.findByText("Eigene Vorlage");
  });
});
