import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  // Relative, because the built files are loaded from the app's own bundle
  // rather than served from a web root.
  base: "./",
  build: { outDir: "dist" },
  test: { environment: "jsdom", globals: true },
});
