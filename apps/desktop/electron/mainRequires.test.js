import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { builtinModules } from "node:module";

// Everything the main process requires has to be IN the installed app.
//
// It was not, and the app would not start at all on Windows:
//
//     A JavaScript error occurred in the main process
//     Error: Cannot find module 'qrcode'
//     ...app.asar\electron\main.js:8:16
//
// main.js requires qrcode. apps/desktop never declared it. It resolved
// anyway in development, because npm workspaces hoist every package to the
// repository root and node walks up until it finds one -- so `npm run
// electron:dev` worked perfectly, every time, for everyone.
//
// electron-builder does not walk up. It packs THIS package's production
// dependencies, and qrcode was a transitive dependency of @techdesk/ui,
// which is a devDependency here -- correct in itself, because Vite bundles
// the UI into dist/ and it never ships as a module. But Vite never touches
// the main process. A module the main process requires at runtime has to be
// a production dependency of this package, whatever the renderer does.
//
// Nothing caught it because nothing ever launched a packaged build. The
// build went green: bundling does not resolve main.js's requires. So this
// test reads them instead.
const here = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(here, "..", "package.json"), "utf-8"));

/** Bare specifiers only -- "./foo" ships with the source and needs nothing. */
function requiresIn(file) {
  const src = readFileSync(join(here, file), "utf-8");
  const found = new Set();
  for (const m of src.matchAll(/require\(\s*["']([^"']+)["']\s*\)/g)) {
    const name = m[1];
    if (name.startsWith(".") || name.startsWith("/")) continue;
    // "foo/bar" is still the foo package.
    found.add(name.startsWith("@") ? name.split("/").slice(0, 2).join("/") : name.split("/")[0]);
  }
  return [...found];
}

const PROVIDED = new Set([
  ...builtinModules,
  ...builtinModules.map((m) => `node:${m}`),
  "electron", // the runtime itself
]);

const files = readdirSync(here).filter((f) => f.endsWith(".js") && !f.endsWith(".test.js"));

describe("what the main process requires is what the installer ships", () => {
  it("has main-process files to check", () => {
    expect(files).toContain("main.js");
    expect(files.length).toBeGreaterThan(0);
  });

  for (const file of files) {
    it(`${file} requires nothing that is missing from dependencies`, () => {
      const declared = new Set(Object.keys(pkg.dependencies || {}));
      const missing = requiresIn(file).filter((n) => !PROVIDED.has(n) && !declared.has(n));
      expect(missing, `${file} requires ${missing.join(", ")} at runtime, but apps/desktop does not depend on ${missing.length === 1 ? "it" : "them"}. It will resolve in development through workspace hoisting and be absent from app.asar.`).toEqual([]);
    });
  }

  it("does not count a devDependency as shipped", () => {
    // The exact trap: @techdesk/ui is a devDependency (Vite bundles it into
    // dist/), and qrcode came in under it. Anything the main process needs
    // has to stand on its own in `dependencies`.
    const dev = Object.keys(pkg.devDependencies || {});
    expect(dev).toContain("@techdesk/ui");
    expect(Object.keys(pkg.dependencies || {})).toContain("qrcode");
  });
});
