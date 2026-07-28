// Muss der erste Import bleiben: macht Ant Design 5 mit React 19 kompatibel
// (siehe docs/ui-analysis.md, Abschnitt 1 — Spoolman haelt es genauso).
import "@ant-design/v5-patch-for-react-19";

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router";
import { App } from "./App";
import { ColorModeProvider } from "./theme/ColorModeProvider";
import "./styles/global.css";

const container = document.getElementById("root");
if (!container) {
  throw new Error('Wurzelelement "#root" wurde nicht gefunden.');
}

createRoot(container).render(
  <StrictMode>
    <ColorModeProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ColorModeProvider>
  </StrictMode>,
);
