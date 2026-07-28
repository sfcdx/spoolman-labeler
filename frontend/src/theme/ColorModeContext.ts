import { createContext } from "react";
import type { ColorModePreference, ResolvedColorMode } from "./colorMode";

export interface ColorModeContextValue {
  /** Vom Nutzer gewaehlte Einstellung: `system`, `light` oder `dark`. */
  preference: ColorModePreference;
  /** Tatsaechlich aktives Schema — `system` ist hier bereits aufgeloest. */
  mode: ResolvedColorMode;
  setPreference: (preference: ColorModePreference) => void;
}

export const ColorModeContext = createContext<ColorModeContextValue | undefined>(undefined);
