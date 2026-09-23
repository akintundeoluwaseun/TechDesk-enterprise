import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    // No setupFiles: it pointed at ./src/test/setup.js, which does not
    // exist, so this config could never actually run. There was no test
    // script either -- which is how the main process came to require a
    // module nobody had declared.
    include: ["electron/**/*.test.js", "src/**/*.test.{js,jsx}"],
  },
});
