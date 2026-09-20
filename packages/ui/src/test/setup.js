import "@testing-library/jest-dom/vitest";
// The app binds core at its entry point; tests are an entry point too.
import "../lib/bindCore";
import { afterEach } from "vitest";

afterEach(() => {
  localStorage.clear();
});
