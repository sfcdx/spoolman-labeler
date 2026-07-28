import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { App as AntdApp, ConfigProvider, theme } from "antd";
import deDE from "antd/locale/de_DE";
import { ColorModeContext, type ColorModeContextValue } from "./ColorModeContext";
import {
  COLOR_PRIMARY,
  PREFERS_DARK_QUERY,
  readStoredPreference,
  resolveColorMode,
  writeStoredPreference,
  type ColorModePreference,
  type ResolvedColorMode,
} from "./colorMode";
import { ThemeCssVariables } from "./ThemeCssVariables";
import { useMediaQuery } from "../hooks/useMediaQuery";

export interface ColorModeProviderProps {
  children: ReactNode;
  /** Nur fuer Tests: erzwingt eine Startpraeferenz statt `localStorage`. */
  initialPreference?: ColorModePreference;
}

/**
 * Stellt Farbschema-Kontext und den einzigen `ConfigProvider` der Anwendung
 * bereit (ADR-004: genau ein Token-Override, `colorPrimary`).
 */
export function ColorModeProvider({
  children,
  initialPreference,
}: ColorModeProviderProps): React.JSX.Element {
  const [preference, setPreferenceState] = useState<ColorModePreference>(
    () => initialPreference ?? readStoredPreference(),
  );

  // Der Systemwunsch wird live beobachtet, nicht nur einmal beim Laden
  // gelesen — ein Wechsel des Betriebssystem-Themes schlaegt sofort durch.
  const prefersDark = useMediaQuery(PREFERS_DARK_QUERY);
  const systemMode: ResolvedColorMode = prefersDark ? "dark" : "light";

  const mode = resolveColorMode(preference, systemMode);

  // Native Bedienelemente (Scrollbars, Datumsfelder) mitziehen.
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.documentElement.style.colorScheme = mode;
    document.documentElement.dataset["colorMode"] = mode;
  }, [mode]);

  const setPreference = useCallback((next: ColorModePreference): void => {
    setPreferenceState(next);
    writeStoredPreference(next);
  }, []);

  const contextValue = useMemo<ColorModeContextValue>(
    () => ({ preference, mode, setPreference }),
    [preference, mode, setPreference],
  );

  return (
    <ColorModeContext.Provider value={contextValue}>
      <ConfigProvider
        locale={deDE}
        theme={{
          algorithm: mode === "dark" ? theme.darkAlgorithm : theme.defaultAlgorithm,
          token: {
            colorPrimary: COLOR_PRIMARY,
          },
        }}
      >
        <AntdApp>
          <ThemeCssVariables />
          {children}
        </AntdApp>
      </ConfigProvider>
    </ColorModeContext.Provider>
  );
}
