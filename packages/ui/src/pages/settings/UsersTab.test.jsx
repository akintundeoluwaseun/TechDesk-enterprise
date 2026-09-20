import { describe, it, expect, beforeEach } from "vitest";
import { db } from "../../lib/db";
import { setCurrentTier, currentStaffLimit, FREE_TIER } from "../../lib/tier";

// The staff limit is the difference a shop cannot see in a feature list, and
// the one they hit on the day they hire someone. It has to be exact, and the
// admin has to count -- a shop that pays for three people and can only add
// two has been shortchanged, and a shop that gets four has not paid for one.
function atLimit(existingStaff) {
  return existingStaff + 1 >= currentStaffLimit();
}

describe("how many people fit behind the counter", () => {
  beforeEach(() => {
    setCurrentTier(FREE_TIER);
    db.getUsers().forEach((u) => db.deleteUser(u.id));
  });

  it("free is the owner, alone", () => {
    expect(currentStaffLimit()).toBe(1);
    expect(atLimit(0)).toBe(true);
  });

  it("business is three people including the owner", () => {
    setCurrentTier("business");
    expect(currentStaffLimit()).toBe(3);
    expect(atLimit(0)).toBe(false); // owner + room for two
    expect(atLimit(1)).toBe(false);
    expect(atLimit(2)).toBe(true);  // owner + two = three
  });

  it("enterprise does not run out", () => {
    setCurrentTier("enterprise");
    expect(currentStaffLimit()).toBe(Infinity);
    expect(atLimit(0)).toBe(false);
    expect(atLimit(50)).toBe(false);
    // The bug this guards: Infinity through JSON is "null", and
    // `count < null` is false -- unlimited becomes a limit of zero.
    expect(atLimit(999)).toBe(false);
  });

  it("upgrading makes room without touching the accounts already there", () => {
    setCurrentTier("business");
    db.addUser({ name: "Ada", pin: "1234", role: "seller" });
    db.addUser({ name: "Bola", pin: "2345", role: "repairer" });
    expect(atLimit(db.getUsers().length)).toBe(true);
    setCurrentTier("enterprise");
    expect(atLimit(db.getUsers().length)).toBe(false);
    expect(db.getUsers().map((u) => u.name)).toEqual(["Ada", "Bola"]);
  });

  it("downgrading never deletes anyone", () => {
    // Whatever a lapsed licence does, it must not take a shop's staff list
    // away -- those accounts are how people sign in tomorrow morning.
    setCurrentTier("enterprise");
    for (const n of ["Ada", "Bola", "Chidi", "Dayo"]) {
      db.addUser({ name: n, pin: "1234", role: "seller" });
    }
    setCurrentTier("business");
    expect(db.getUsers()).toHaveLength(4);
    expect(atLimit(db.getUsers().length)).toBe(true);
  });
});
