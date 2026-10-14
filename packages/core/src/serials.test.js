import { describe, it, expect } from "vitest";
import { serialSlots, cleanSerials, joinSerials, readSerials } from "./serials";

describe("a sale line carries one serial per unit", () => {
  it("gives a box per unit", () => {
    expect(serialSlots([], 2)).toEqual(["", ""]);
    expect(serialSlots(["A"], 3)).toEqual(["A", "", ""]);
  });

  it("keeps what was typed when the count drops", () => {
    // Taking one laptop back off a sale of three must not clear the two
    // serials already scanned.
    expect(serialSlots(["A", "B", "C"], 2)).toEqual(["A", "B"]);
  });

  it("never gives fewer than one box", () => {
    expect(serialSlots([], 0)).toEqual([""]);
    expect(serialSlots(undefined, undefined)).toEqual([""]);
  });

  it("stores them trimmed, and joined for everything already reading imei", () => {
    expect(cleanSerials([" A ", "B"], 2)).toEqual(["A", "B"]);
    expect(joinSerials([" A ", "B"], 2)).toBe("A, B");
    // A blank slot is not a serial.
    expect(joinSerials(["A", ""], 2)).toBe("A");
  });

  it("reads a sale saved before serials were per-unit", () => {
    expect(readSerials({ imei: "SN-OLD999" })).toEqual(["SN-OLD999"]);
    expect(readSerials({ imei: "SN-A, SN-B" })).toEqual(["SN-A", "SN-B"]);
    expect(readSerials({ imeis: ["SN-A", "SN-B"] })).toEqual(["SN-A", "SN-B"]);
    expect(readSerials({})).toEqual([]);
  });

  it("prefers the list when a sale has both", () => {
    expect(readSerials({ imeis: ["SN-A", "SN-B"], imei: "SN-A, SN-B" })).toEqual(["SN-A", "SN-B"]);
  });
});
