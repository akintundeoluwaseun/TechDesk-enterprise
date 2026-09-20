import { describe, it, expect } from "vitest";
import { TIERS } from "@techdesk/editions";
import { HASH_HEX } from "./activationCode";
import { TABLE_TIERS, TABLE_SIZE, isValidIndex, pinAt, hashesAt, loadTable } from "./activationTable";
import meta from "../data/activationMeta.json";
import table from "../data/activationHashes.json";

const PAID = TIERS.filter((t) => t !== "free");

describe("the table that ships inside the app", () => {
  it("has a column for every tier that can be bought", () => {
    expect(TABLE_TIERS).toEqual(PAID);
  });

  it("gives every PIN a code for each of them", () => {
    for (const row of table.entries) expect(row).toHaveLength(PAID.length + 1);
  });

  it("never repeats a PIN", () => {
    // A PIN in two rows is a PIN with two different sets of codes, and no way
    // to tell which row the shop on the phone is reading from.
    expect(new Set(table.entries.map((r) => r[0])).size).toBe(TABLE_SIZE);
  });

  it("uses six digits that never start with a zero", () => {
    for (const row of table.entries) expect(row[0]).toMatch(/^[1-9][0-9]{5}$/);
  });

  it("stores hashes, never codes", () => {
    for (const row of table.entries) {
      for (const hash of row.slice(1)) {
        expect(hash).toMatch(new RegExp(`^[0-9a-f]{${HASH_HEX}}$`));
      }
    }
  });

  it("is big enough that two unrelated shops rarely draw the same PIN", () => {
    // A device picks its row at random, so collisions follow the birthday
    // rule: about n^2/2N pairs for n installs. This keeps that rare for a
    // customer base far larger than the one it was written for.
    expect(TABLE_SIZE).toBeGreaterThanOrEqual(20000);
  });
});

describe("the small file the app loads at startup", () => {
  it("agrees with the table it describes", () => {
    // If these drift, the app draws PINs from a range the table does not
    // have, and a shop gets a blank where their PIN should be.
    expect(meta.size).toBe(table.entries.length);
    expect(meta.tiers).toEqual(table.tiers);
  });

  it("is what answers the startup questions, so the table stays unloaded", () => {
    expect(TABLE_SIZE).toBe(meta.size);
    expect(TABLE_TIERS).toEqual(meta.tiers);
    expect(isValidIndex(0)).toBe(true);
    expect(isValidIndex(meta.size)).toBe(false);
  });
});

describe("reading a row", () => {
  it("labels the hashes instead of making callers count columns", async () => {
    const row = await hashesAt(0);
    expect(row.map((h) => h.tier)).toEqual(PAID);
    expect(row[0].hash).toBe(table.entries[0][1]);
  });

  it("returns a PIN that matches the row it came from", async () => {
    expect(await pinAt(7)).toBe(table.entries[7][0]);
  });

  it("loads the table once and keeps it", async () => {
    expect(await loadTable()).toBe(await loadTable());
  });

  it("refuses a row that is not there rather than inventing a PIN", async () => {
    for (const bad of [-1, TABLE_SIZE, 1.5, NaN, null, undefined, "3"]) {
      expect(isValidIndex(bad)).toBe(false);
      expect(await pinAt(bad)).toBeNull();
      expect(await hashesAt(bad)).toEqual([]);
    }
  });
});
