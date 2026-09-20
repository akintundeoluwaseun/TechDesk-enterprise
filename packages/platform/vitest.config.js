import { defineConfig } from "vitest/config";

// jsdom, unlike core's node. This package is the part that is allowed to know
// about documents and windows -- that is its whole job -- so its tests need
// one. If a test in packages/core ever needs this, something leaked.
export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
  },
});
