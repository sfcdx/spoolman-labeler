import { Route, Routes } from "react-router";
import { AppLayout } from "./layouts/AppLayout";
import { NewSpoolPage } from "./pages/NewSpoolPage";
import { NotFoundPage } from "./pages/NotFoundPage";
import { PrintHistoryPage } from "./pages/PrintHistoryPage";
import { SettingsPage } from "./pages/SettingsPage";
import { TemplatesPage } from "./pages/TemplatesPage";

/**
 * Routen der Anwendung.
 *
 * Kein Hash-Router: Der `BrowserRouter` sitzt in `main.tsx`, damit Tests die
 * Routen mit einem `MemoryRouter` umschliessen koennen. Das Backend liefert
 * fuer unbekannte Pfade `index.html` aus (SPA-Fallback).
 */
export function App(): React.JSX.Element {
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<NewSpoolPage />} />
        <Route path="history" element={<PrintHistoryPage />} />
        <Route path="templates" element={<TemplatesPage />} />
        <Route path="settings" element={<SettingsPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
