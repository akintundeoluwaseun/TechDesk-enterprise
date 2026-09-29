import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Stamped into the build so the app can say which version it is when it
// checks in for notifications (see packages/ui/src/lib/announcements.js).
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// Capacitor serves the build from the app's own bundle, so asset paths are
// relative. Same renderer as the desktop; only the shell differs.
export default defineConfig({
  plugins: [react()],
  define: { __TECHDESK_VERSION__: JSON.stringify(version) },
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
