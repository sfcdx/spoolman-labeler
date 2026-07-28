/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

/**
 * Ziel des Entwicklungs-Proxys.
 *
 * Im Browser spricht die Anwendung ausschliesslich den relativen Pfad `/api`
 * an — niemals einen Hostnamen oder Port. In der Entwicklung leitet Vite
 * diesen Pfad an das lokal laufende Backend weiter; in der Produktion
 * liefert dasselbe Backend `dist/` und `/api` unter derselben Origin aus.
 */
const DEV_API_TARGET = "http://127.0.0.1:7913";

export default defineConfig({
  plugins: [react()],

  // Absolute Asset-Pfade: Die Anwendung wird unter "/" ausgeliefert, und
  // Deep Links wie /templates/edit/1 duerfen die Asset-Aufloesung nicht
  // verschieben (das waere bei relativen Pfaden der Fall).
  base: "/",

  build: {
    outDir: "dist",
    emptyOutDir: true,
    // Keine Sourcemaps im Produktions-Bundle — sie waeren groesser als die
    // Anwendung selbst und landen sonst im Docker-Image.
    sourcemap: false,
  },

  server: {
    host: "127.0.0.1",
    port: 5173,
    proxy: {
      "/api": {
        target: DEV_API_TARGET,
        changeOrigin: false,
      },
    },
  },

  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    coverage: {
      provider: "v8",
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: ["src/**/*.{test,spec}.{ts,tsx}", "src/test/**", "src/main.tsx"],
    },
  },
});
