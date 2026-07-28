import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { App } from "./App";
import { renderWithProviders, setupUser, stubHealthyFetch } from "./test/utils";
import { texts } from "./texts/de";

const healthyLine = `${texts.health.spoolman}: ${texts.health.state.ok}`;

describe("Navigation", () => {
  it("zeigt 'Neue Spule' als Startseite", async () => {
    stubHealthyFetch();
    renderWithProviders(<App />);
    await screen.findByText(healthyLine);

    expect(
      screen.getByRole("heading", { level: 1, name: texts.pages.newSpool.title }),
    ).toBeInTheDocument();
  });

  it("wechselt per Klick zwischen den vier Bereichen", async () => {
    stubHealthyFetch();
    const user = setupUser();
    renderWithProviders(<App />);
    await screen.findByText(healthyLine);

    await user.click(screen.getByRole("link", { name: texts.nav.history }));
    expect(
      await screen.findByRole("heading", { level: 1, name: texts.pages.history.title }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: texts.nav.templates }));
    expect(
      await screen.findByRole("heading", { level: 1, name: texts.pages.templates.title }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: texts.nav.settings }));
    expect(
      await screen.findByRole("heading", { level: 1, name: texts.pages.settings.title }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: texts.nav.newSpool }));
    expect(
      await screen.findByRole("heading", { level: 1, name: texts.pages.newSpool.title }),
    ).toBeInTheDocument();
  });

  it("kann eine Route direkt oeffnen (Deep Link, kein Hash-Router)", async () => {
    stubHealthyFetch();
    renderWithProviders(<App />, { initialEntries: ["/settings"] });
    await screen.findByText(healthyLine);

    expect(
      screen.getByRole("heading", { level: 1, name: texts.pages.settings.title }),
    ).toBeInTheDocument();
  });

  it("zeigt fuer unbekannte Pfade die 404-Seite mit Rueckweg", async () => {
    stubHealthyFetch();
    const user = setupUser();
    renderWithProviders(<App />, { initialEntries: ["/gibt-es-nicht"] });
    await screen.findByText(healthyLine);

    expect(screen.getByText(texts.pages.notFound.title)).toBeInTheDocument();

    await user.click(screen.getByRole("link", { name: texts.pages.notFound.backHome }));
    expect(
      await screen.findByRole("heading", { level: 1, name: texts.pages.newSpool.title }),
    ).toBeInTheDocument();
  });

  it("setzt den Dokumenttitel je Bereich", async () => {
    stubHealthyFetch();
    renderWithProviders(<App />, { initialEntries: ["/history"] });
    await screen.findByText(healthyLine);

    expect(document.title).toBe(
      `${texts.pages.history.title}${texts.app.titleSeparator}${texts.app.name}`,
    );
  });
});
