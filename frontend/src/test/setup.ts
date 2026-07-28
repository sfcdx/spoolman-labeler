// Wie in der Anwendung: der React-19-Patch fuer Ant Design 5 zuerst.
import "@ant-design/v5-patch-for-react-19";

import "@testing-library/jest-dom/vitest";
import { afterEach, beforeEach, vi } from "vitest";
import { cleanup } from "@testing-library/react";
import { installMatchMedia, matchMediaController } from "./matchMedia";

// jsdom kennt weder ResizeObserver noch matchMedia — Ant Design braucht beides.
class ResizeObserverStub {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}

if (!("ResizeObserver" in globalThis)) {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = ResizeObserverStub;
}

// jsdom kennt `getComputedStyle` mit Pseudo-Element nicht und gibt bei jedem
// Aufruf eine seitenlange Fehlermeldung aus. Das Argument wird verworfen —
// fuer die Tests ist es ohne Bedeutung.
const nativeGetComputedStyle = window.getComputedStyle.bind(window);
window.getComputedStyle = ((element: Element) =>
  nativeGetComputedStyle(element)) as typeof window.getComputedStyle;

beforeEach(() => {
  matchMediaController.reset();
  installMatchMedia();
  window.localStorage.clear();
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
