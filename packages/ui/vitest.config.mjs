import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// The screens are tested here, once, rather than once per shell. A sale
// behaving differently on a phone than on a desktop would be a bug, not a
// feature, so there is one suite and both shells inherit it.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./src/test/setup.js",
  },
});
