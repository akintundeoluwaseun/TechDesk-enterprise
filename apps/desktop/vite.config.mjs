import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";

// Stamped into the build so the app can say which version it is when it
// checks in for notifications (see packages/ui/src/lib/announcements.js).
const { version } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8"));

// ONE BUILD.
//
// This file used to compile the edition in, so that a Solo binary physically
// did not contain the paid code. That is airtight, and it is incompatible
// with the product: a shop is meant to pay and have the app they already have
// unlock, without a second download and without their records going anywhere.
// Code that is not in the binary cannot be switched on.
//
// So the tier is a licence now, read at runtime -- see
// apps/desktop/src/lib/tier.js. What defends the paid features is the server
// refusing to sync or connect a branch that has not paid, not the absence of
// code from a file on the customer's own disk.
export default defineConfig({
  plugins: [react()],
  define: { __TECHDESK_VERSION__: JSON.stringify(version) },
  base: "./",
  server: {
    port: 5173,
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
