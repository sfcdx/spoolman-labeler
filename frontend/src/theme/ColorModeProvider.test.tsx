import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { setupUser } from "../test/utils";
import { act } from "react";
import { ColorModeProvider } from "./ColorModeProvider";
import { COLOR_MODE_STORAGE_KEY } from "./colorMode";
import { useColorMode } from "./useColorMode";
import { ThemeSwitcher } from "../components/ThemeSwitcher";
import { matchMediaController } from "../test/matchMedia";
import { texts } from "../texts/de";

function ModeProbe(): React.JSX.Element {
  const { mode, preference } = useColorMode();
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="preference">{preference}</span>
    </div>
  );
}

function renderThemeHarness(): void {
  render(
    <ColorModeProvider>
      <ThemeSwitcher />
      <ModeProbe />
    </ColorModeProvider>,
  );
}

describe("Farbschema", () => {
  it("startet ohne gespeicherte Einstellung im Systemmodus", () => {
    renderThemeHarness();

    expect(screen.getByTestId("preference")).toHaveTextContent("system");
    expect(screen.getByTestId("mode")).toHaveTextContent("light");
  });

  it("uebernimmt eine gespeicherte Einstellung aus localStorage", () => {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, "dark");

    renderThemeHarness();

    expect(screen.getByTestId("preference")).toHaveTextContent("dark");
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
  });

  it("ignoriert einen ungueltigen gespeicherten Wert", () => {
    window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, "neon");

    renderThemeHarness();

    expect(screen.getByTestId("preference")).toHaveTextContent("system");
  });

  it("schaltet ueber den Umschalter um und speichert unter dem Schluessel colorMode", async () => {
    const user = setupUser();
    renderThemeHarness();

    await user.click(screen.getByRole("radio", { name: texts.theme.dark }));

    expect(screen.getByTestId("preference")).toHaveTextContent("dark");
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
    expect(window.localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe("dark");

    await user.click(screen.getByRole("radio", { name: texts.theme.light }));

    expect(screen.getByTestId("mode")).toHaveTextContent("light");
    expect(window.localStorage.getItem(COLOR_MODE_STORAGE_KEY)).toBe("light");
  });

  it("folgt im Systemmodus live einer Aenderung von prefers-color-scheme", () => {
    renderThemeHarness();

    expect(screen.getByTestId("mode")).toHaveTextContent("light");

    act(() => {
      matchMediaController.setPrefersDark(true);
    });
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");

    act(() => {
      matchMediaController.setPrefersDark(false);
    });
    expect(screen.getByTestId("mode")).toHaveTextContent("light");
  });

  it("ignoriert Systemaenderungen bei fester Auswahl", async () => {
    const user = setupUser();
    renderThemeHarness();

    await user.click(screen.getByRole("radio", { name: texts.theme.light }));

    act(() => {
      matchMediaController.setPrefersDark(true);
    });

    expect(screen.getByTestId("mode")).toHaveTextContent("light");

    // Zurueck auf System: die zwischenzeitliche Systemaenderung greift sofort.
    await user.click(screen.getByRole("radio", { name: texts.theme.system }));
    expect(screen.getByTestId("mode")).toHaveTextContent("dark");
  });

  it("stellt den Umschalter mit zugaenglichem Namen bereit", () => {
    renderThemeHarness();

    const group = screen.getByRole("radiogroup", { name: texts.theme.label });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: texts.theme.system })).toBeInTheDocument();
  });
});
