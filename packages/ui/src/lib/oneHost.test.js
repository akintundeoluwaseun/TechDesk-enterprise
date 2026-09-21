import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";

// The product has one address, and it is techdesk.ng.
//
// It used to live on a Vercel preview URL, and that URL stayed behind in the
// places nobody rereads: the Connect to HQ tab told shops to sign up at
// techdesk-one.vercel.app, and the Monitor login screen linked to it twice.
// A shop that follows one of those is a shop that gives up on head office,
// and nothing fails when it happens -- the link simply goes somewhere else.
//
// So it is a test. Adding a screen with the old host in it breaks the build
// instead of reaching a customer.
const OLD_HOSTS = /techdesk-one\.vercel\.app|techdesk[a-z-]*\.vercel\.app|techdesk[a-z-]*\.github\.io/;

function sourceFiles(dir, found = []) {
  if (!existsSync(dir)) return found;
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry === "dist" || entry === "build") continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) sourceFiles(full, found);
    else if (/\.(jsx?|tsx?|html)$/.test(entry) && !/\.test\./.test(entry)) found.push(full);
  }
  return found;
}

describe("everything the shop is told to visit is techdesk.ng", () => {
  // Every shell, not just this one. The link that was wrong longest was in
  // Monitor, which has its own screens and would not be covered by walking
  // packages/ui alone.
  //
  // Found by walking up rather than by counting "..", because the working
  // directory depends on how the suite was started -- the package's own
  // `npm test` and a run from the repo root disagree, and a hardcoded hop
  // lands outside the tree in one of them. That is not a theory: the first
  // version of this file walked nothing at all, and only the count below
  // said so.
  const root = (() => {
    let dir = process.cwd();
    for (let i = 0; i < 6; i += 1) {
      if (existsSync(join(dir, "packages")) && existsSync(join(dir, "apps"))) return dir;
      dir = join(dir, "..");
    }
    throw new Error("Could not find the repo root from " + process.cwd());
  })();
  const files = [
    ...sourceFiles(join(root, "packages", "ui", "src")),
    ...sourceFiles(join(root, "packages", "core", "src")),
    ...sourceFiles(join(root, "apps", "monitor", "src")),
    ...sourceFiles(join(root, "apps", "desktop", "electron")),
  ];

  it("walks something -- a guard over no files reports green forever", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("points at no host the product has moved off", () => {
    const offenders = files
      .filter((f) => OLD_HOSTS.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });
});
