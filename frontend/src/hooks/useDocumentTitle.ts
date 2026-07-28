import { useEffect } from "react";
import { texts } from "../texts/de";

/** Setzt den Dokumenttitel — wichtig fuer Screenreader und Verlauf. */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    if (typeof document === "undefined") {
      return;
    }
    document.title = `${title}${texts.app.titleSeparator}${texts.app.name}`;
  }, [title]);
}
