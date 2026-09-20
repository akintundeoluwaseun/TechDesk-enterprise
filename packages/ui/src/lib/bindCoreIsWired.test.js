import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { db } from "./db";
import { buildInvoicePdf } from "@techdesk/core";

// Guards a bug this refactor actually caused: core's storage was bound as a
// side effect of importing db.js, so anything that reached core another way --
// the receipt builders -- silently got the in-memory store instead. Nothing
// threw. The receipts simply came out without the shop's logo on them, which
// looks like working software right up until a customer is handed one.
describe("core is bound at the app's entry points", () => {
  // Every shell, not just the one that happened to exist when this was
  // written. The renderer is shared now; the entry points are not, and a new
  // shell that forgets to bind core reads an empty in-memory store and shows
  // a shop with no settings while throwing nothing at all.
  const SHELLS = ["desktop", "mobile"];

  it.each(SHELLS)("%s binds core at its entry point", (shell) => {
    const main = readFileSync(
      resolve(__dirname, "../../../../apps", shell, "src/main.jsx"), "utf-8");
    expect(main).toMatch(/@techdesk\/ui\/bindCore/);
  });

  it("the mobile shell registers its platform adapter before binding", () => {
    // Order matters here and nowhere else: saveFile asks platform() for the
    // adapter, and on Android the browser one does nothing whatsoever --
    // the shop taps save and gets silence, which is the original bug.
    const main = readFileSync(
      resolve(__dirname, "../../../../apps/mobile/src/main.jsx"), "utf-8");
    expect(main).toMatch(/setPlatform\(capacitorAdapter\)/);
    expect(main.indexOf("setPlatform(capacitorAdapter)"))
      .toBeLessThan(main.indexOf("@techdesk/ui/bindCore"));
  });

  it("the test runner binds too", () => {
    const setup = readFileSync(resolve(__dirname, "../test/setup.js"), "utf-8");
    expect(setup).toMatch(/bindCore/);
  });

  // The real check: reach core WITHOUT going through db.js, and see the
  // shop's own settings. If the binding is missing this reads an empty
  // in-memory store and the name comes out as the default.
  it("core sees this app's records from any entry, not just db.js", () => {
    db.saveSettings({ ...db.getSettings(), shopName: "Ade Phones" });
    const doc = buildInvoicePdf({
      id: "s1", invoice: "INV-1", customerName: "Bola",
      items: [{ name: "Screen", qty: 1, price: 100 }], total: 100,
    });
    expect(JSON.stringify(doc.internal.pages)).toContain("Ade Phones");
  });
});
