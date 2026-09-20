import { defineConfig } from "vitest/config";

// node, not jsdom, and that is the point of this package: if a test in here
// ever needs a browser, something platform-specific has leaked into core and
// the test failing is the alarm.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
  },
});
