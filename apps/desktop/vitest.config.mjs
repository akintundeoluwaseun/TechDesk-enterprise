import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { defineFlags } from "@techdesk/editions";

// The same build constants the real build gets. Without them every
// __CAN_*__ is an undefined global and anything that reads one throws.
// TECHDESK_EDITION picks which edition the suite runs as, so an
// edition-specific test can assert against a build that is not this one.
const edition = process.env.TECHDESK_EDITION || "enterprise";

export default defineConfig({
  define: defineFlags(edition),
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
  },
});
