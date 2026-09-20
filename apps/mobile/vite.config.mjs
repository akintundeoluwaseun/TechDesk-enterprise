import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Capacitor serves the build from the app's own bundle, so asset paths are
// relative. Same renderer as the desktop; only the shell differs.
export default defineConfig({
  plugins: [react()],
  base: "./",
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
