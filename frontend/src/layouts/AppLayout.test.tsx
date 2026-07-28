import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { App } from "../App";
import { matchMediaController } from "../test/matchMedia";
import {
  jsonResponse,
  renderWithProviders,
  setupUser,
  stubFetch,
  stubHealthyFetch,
} from "../test/utils";
import { texts } from "../texts/de";

const healthyLine = `${texts.health.spoolman}: ${texts.health.state.ok}`;

describe("Grundlayout", () => {
  it("rendert Navigation, Hauptbereich, Themenumschalter und Systemstatus", async () => {
    stubHealthyFetch();
    renderWithProviders(<App />);
    await screen.findByText(healthyLine);

    expect(screen.getByRole("navigation", { name: texts.nav.landmark })).toBeInTheDocument();
    expect(screen.getByRole("main")).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: texts.theme.system })).toBeInTheDocument();

    for (const label of [
      texts.nav.newSpool,
      texts.nav.history,
      texts.nav.templates,
      texts.nav.settings,
    ]) {
      expect(screen.getByRole("link", { name: label })).toBeInTheDocument();
    }
  });

  it("bietet einen Skip-Link auf den Hauptinhalt", async () => {
    stubHealthyFetch();
    renderWithProviders(<App />);
    await screen.findByText(healthyLine);

    const skipLink = screen.getByRole("link", { name: texts.nav.skipToContent });
    expect(skipLink).toHaveAttribute("href", "#hauptinhalt");
    expect(screen.getByRole("main")).toHaveAttribute("id", "hauptinhalt");
  });

  it("hebt den aktiven Menuepunkt hervor", async () => {
    stubHealthyFetch();
    renderWithProviders(<App />, { initialEntries: ["/templates"] });
    await screen.findByText(healthyLine);

    const active = screen.getByRole("link", { name: texts.nav.templates }).closest("li");
    expect(active).toHaveClass("ant-menu-item-selected");

    const inactive = screen.getByRole("link", { name: texts.nav.history }).closest("li");
    expect(inactive).not.toHaveClass("ant-menu-item-selected");
  });

  it("klappt die Seitenleiste auf dem Desktop ein und aus", async () => {
    stubHealthyFetch();
    const user = setupUser();
    renderWithProviders(<App />);
    await screen.findByText(healthyLine);

    const collapse = screen.getByRole("button", { name: texts.nav.collapse });
    expect(collapse).toHaveAttribute("aria-expanded", "true");

    await user.click(collapse);

    const expand = await screen.findByRole("button", { name: texts.nav.expand });
    expect(expand).toHaveAttribute("aria-expanded", "false");
  });

  it("zeigt auf Mobilgeraeten einen Drawer statt der Seitenleiste", async () => {
    matchMediaController.setMobile(true);
    stubHealthyFetch();
    const user = setupUser();
    renderWithProviders(<App />);
    await screen.findByText(healthyLine);

    // Ohne geoeffneten Drawer ist keine Navigation im Dokument.
    expect(screen.queryByRole("navigation", { name: texts.nav.landmark })).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: texts.nav.openMenu }));

    await screen.findByRole("navigation", { name: texts.nav.landmark });
    expect(screen.getByRole("link", { name: texts.nav.history })).toBeInTheDocument();
  });

  it("zeigt den Systemstatus mit Text, nicht nur mit Farbe", async () => {
    stubFetch(() =>
      Promise.resolve(
        jsonResponse({
          status: "degraded",
          database: "ok",
          spoolman: "ok",
          cups: "error",
          version: "0.1.0",
        }),
      ),
    );
    renderWithProviders(<App />);

    await screen.findByText(healthyLine);
    expect(
      screen.getByText(`${texts.health.cups}: ${texts.health.state.error}`),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("meldet einen nicht erreichbaren Server als Fehlerzustand", async () => {
    stubFetch(() => Promise.reject(new TypeError("Failed to fetch")));
    renderWithProviders(<App />);

    await screen.findByText(texts.health.checkFailed);
    expect(
      screen.getByText(`${texts.health.spoolman}: ${texts.health.state.error}`),
    ).toBeInTheDocument();
  });
});
