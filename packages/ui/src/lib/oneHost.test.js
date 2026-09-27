import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative } from "node:path";
import { SITE_ORIGIN } from "@techdesk/editions";

// Nothing writes the product's address down except the one file that owns it.
//
// The previous version of this test asserted the opposite and was wrong: it
// enforced techdesk.ng, a domain nobody had registered, because that is what
// the app had been changed to say. It passed the whole time. A guard can only
// check that the code agrees with itself, so if the thing it agrees on is
// wrong, it protects the mistake -- which is what happened here, and the
// people who found out were shops trying to pay.
//
// So this checks two different things. One: the address appears in exactly
// one place, so it cannot rot in some screens and not others. Two: hosts the
// product has actually moved off never come back.
const ABANDONED = /techdesk\.ng|techdesk[a-z-]*\.github\.io/;

// A product URL typed out by hand rather than imported.
const HARDCODED = /https?:\/\/[a-z0-9.-]*(techdesk|vercel\.app)[a-z0-9./-]*/i;

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

const root = (() => {
  let dir = process.cwd();
  for (let i = 0; i < 6; i += 1) {
    if (existsSync(join(dir, "packages")) && existsSync(join(dir, "apps"))) return dir;
    dir = join(dir, "..");
  }
  throw new Error("Could not find the repo root from " + process.cwd());
})();

// Every shell. The link that stayed wrong longest was Monitor's, which
// nothing in packages/ui would have covered.
const OWNER = join(root, "packages", "editions", "src", "site.js");
const files = [
  ...sourceFiles(join(root, "packages", "ui", "src")),
  ...sourceFiles(join(root, "packages", "core", "src")),
  ...sourceFiles(join(root, "packages", "editions", "src")),
  ...sourceFiles(join(root, "apps", "monitor", "src")),
  ...sourceFiles(join(root, "apps", "desktop", "electron")),
].filter((f) => f !== OWNER);

describe("the product has one address", () => {
  it("walks something -- a guard over no files reports green forever", () => {
    expect(files.length).toBeGreaterThan(20);
  });

  it("is the site that actually resolves", () => {
    expect(SITE_ORIGIN).toBe("https://techdesk-one.vercel.app");
  });

  it("is written down in exactly one file", () => {
    const offenders = files
      .filter((f) => HARDCODED.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it("never points at a host the product has moved off", () => {
    const offenders = files
      .filter((f) => ABANDONED.test(readFileSync(f, "utf8")))
      .map((f) => relative(root, f));
    expect(offenders).toEqual([]);
  });

  it("does not put our address on a shop's own receipts", () => {
    // The shop used to have its own "website" field, which shipped defaulted
    // to ours -- so a shop that never opened Settings printed a stranger's
    // domain on every receipt they handed a customer. The field was later
    // removed outright (nothing ever read it back), which closes this class
    // of bug for good: there is no longer a website default to get wrong.
    const db = readFileSync(join(root, "packages", "core", "src", "db.js"), "utf8");
    expect(db).not.toMatch(/website:/);
  });
});
