import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { EDITION, PRODUCT_NAME, STAFF_LIMIT, can } from "./edition";
import { CAPABILITIES, EDITION_META } from "@techdesk/editions";

// The suite runs as whichever edition TECHDESK_EDITION names, enterprise by
// default -- the same constant the real build gets, from the same generator.
const expected = EDITION;

describe("the build knows which edition it is", () => {
  it("has an edition, a name and a staff limit", () => {
    expect(CAPABILITIES).toHaveProperty(expected);
    expect(PRODUCT_NAME).toBe(EDITION_META[expected].productName);
    expect(STAFF_LIMIT).toBe(EDITION_META[expected].staffLimit);
  });

  it("agrees with the capability list for this edition", () => {
    for (const f of CAPABILITIES[expected]) expect(can(f)).toBe(true);
    // Anything not on the list is a no, including near-misses -- a typo in a
    // call site must fail closed, never grant.
    for (const f of ["notAFeature", "", "hq "]) expect(can(f)).toBe(false);
  });

  it("does not grant what this edition did not buy", () => {
    if (expected !== "enterprise") expect(can("lan")).toBe(false);
    if (expected === "solo") expect(can("hq")).toBe(false);
    if (expected === "enterprise") expect(STAFF_LIMIT).toBe(Infinity);
  });
});

describe("the edition cannot be changed by the person running it", () => {
  it("is a build constant, not a setting", () => {
    // The whole point. An edition read from storage is an edition a customer
    // can edit in devtools, and a Solo licence becomes Enterprise in ten
    // seconds. Nothing in this module may read from storage.
    const src = readFileSync(resolve(__dirname, "edition.js"), "utf-8");
    expect(src).not.toMatch(/localStorage|sessionStorage|storage\.getItem/);
    expect(src).toMatch(/__TECHDESK_EDITION__/);
  });

  it("offers no way to set it", () => {
    const src = readFileSync(resolve(__dirname, "edition.js"), "utf-8");
    expect(src).not.toMatch(/export function set|export let |export var /);
  });
});
