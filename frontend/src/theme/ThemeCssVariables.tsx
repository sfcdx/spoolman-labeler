import { useEffect } from "react";
import { theme } from "antd";

/**
 * Spiegelt einige Ant-Design-Tokens als CSS-Custom-Properties.
 *
 * Das ist kein Token-Override, sondern nur ein Leseweg: Damit koennen die
 * wenigen eigenen CSS-Regeln (Fokusring, Skip-Link) dieselben Farben nutzen —
 * inklusive der im Dark Mode abgeleiteten Primaerfarbe `#be682f`.
 */
export function ThemeCssVariables(): null {
  const { token } = theme.useToken();

  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty("--sl-color-primary", token.colorPrimary);
    root.style.setProperty("--sl-color-bg-elevated", token.colorBgElevated);
    root.style.setProperty("--sl-color-bg-container", token.colorBgContainer);
    root.style.setProperty("--sl-color-text", token.colorText);
    root.style.setProperty("--sl-border-radius", `${String(token.borderRadius)}px`);
  }, [token]);

  return null;
}
