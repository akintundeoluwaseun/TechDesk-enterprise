import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative asset paths, not absolute.
//
// The app routes with a hash, so every URL a shop ever visits is the same
// document -- which means it can be served as plain files from anywhere,
// with no rewrite rules and no server that has to understand the routes.
// "./" keeps that true whether it is served from a domain root, a subpath,
// or a preview URL; "/" would quietly break the middle one.
export default defineConfig({
  plugins: [react()],
  base: "./",
  server: { port: 5174 },
  build: { outDir: "dist", emptyOutDir: true },
});
