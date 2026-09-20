import { describe, it, expect } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { normalizeCode, hashPreimage, HASH_HEX } from "./activationCode";
import { loadTable } from "./activationTable";

// The end-to-end check, against the codes that will actually be sold.
//
// Everything else in this suite mints its own codes, which proves the logic
// but not the data. This one reads the private CSV -- the list you sell from
// -- and checks that a code off it really does open the row it is printed
// against, using the same digest the app computes when a shop types it in.
//
// It is the only test that can catch the generator and the app drifting on
// real output, and the one failure that would otherwise be discovered by a
// customer on the phone.
//
// The CSV is not in the repository and never will be, so this skips
// everywhere except the machine that minted it.
const CSV = resolve(__dirname, "../../../../secrets/activation-codes.csv");
const present = existsSync(CSV);

async function sha256Prefix(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, HASH_HEX);
}

describe.skipIf(!present)("the codes you will actually sell", () => {
  const lines = present ? readFileSync(CSV, "utf8").trim().split("\n") : [];
  const header = present ? lines[0].split(",") : [];
  const rows = lines.slice(1).map((l) => l.split(","));

  it("has a column per tier and a row per PIN", async () => {
    const table = await loadTable();
    expect(header.slice(1)).toEqual(table.tiers);
    expect(rows).toHaveLength(table.entries.length);
  });

  it("opens the row it is printed against", async () => {
    const table = await loadTable();
    // A spread of rows rather than all twenty thousand: enough to catch a
    // format drift, fast enough to run on every commit.
    for (const i of [0, 1, 7, 999, 5000, 12345, table.entries.length - 1]) {
      const [pin, ...codes] = rows[i];
      expect(pin).toBe(table.entries[i][0]);
      for (let t = 0; t < table.tiers.length; t += 1) {
        const digest = await sha256Prefix(hashPreimage(pin, table.tiers[t], codes[t]));
        expect(digest).toBe(table.entries[i][t + 1]);
      }
    }
  });

  it("does not open any other row", async () => {
    const table = await loadTable();
    const [, businessCode] = rows[0];
    const otherPin = table.entries[1][0];
    const digest = await sha256Prefix(hashPreimage(otherPin, "business", businessCode));
    expect(digest).not.toBe(table.entries[1][1]);
  });

  it("does not open a tier it was not sold for", async () => {
    const table = await loadTable();
    const [pin, businessCode] = rows[0];
    // The Business code, checked against the Enterprise column of its own
    // PIN. This is the one that would quietly give the product away.
    const digest = await sha256Prefix(hashPreimage(pin, "enterprise", businessCode));
    expect(digest).not.toBe(table.entries[0][2]);
  });

  it("is printed in the form the app accepts", async () => {
    for (const [, ...codes] of rows.slice(0, 50)) {
      for (const code of codes) {
        expect(code).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}-[0-9A-Z]{4}$/);
        // Printed with dashes, accepted with or without.
        expect(normalizeCode(code)).toHaveLength(12);
      }
    }
  });
});
