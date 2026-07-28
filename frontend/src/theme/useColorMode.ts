import { useContext } from "react";
import { ColorModeContext, type ColorModeContextValue } from "./ColorModeContext";

export function useColorMode(): ColorModeContextValue {
  const value = useContext(ColorModeContext);
  if (!value) {
    throw new Error("useColorMode muss innerhalb von <ColorModeProvider> verwendet werden.");
  }
  return value;
}
