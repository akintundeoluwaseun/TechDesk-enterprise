import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Served from the root of a domain, so absolute asset paths -- unlike the
// desktop and Capacitor builds, which load their files off disk.
export default defineConfig({
  plugins: [react()],
  base: "/",
  server: { port: 5174 },
  build: { outDir: "dist", emptyOutDir: true },
});
