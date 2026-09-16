import { describe, expect, it } from "vitest";
import { ago, firstName, greeting, time } from "./format";

describe("how times are worded", () => {
  it("says just now, not 0 minutes ago", () => {
    expect(ago(new Date().toISOString())).toBe("just now");
  });

  it("counts minutes, then hours, then days", () => {
    const back = (ms) => new Date(Date.now() - ms).toISOString();
    expect(ago(back(5 * 60_000))).toBe("5 min ago");
    expect(ago(back(3 * 3600_000))).toBe("3 hours ago");
    expect(ago(back(1 * 3600_000))).toBe("1 hour ago");
    expect(ago(back(2 * 86_400_000))).toBe("2 days ago");
    expect(ago(back(1 * 86_400_000))).toBe("1 day ago");
  });

  it("says never rather than NaN for a device that has not reported", () => {
    // A branch that connected but has never synced has no lastSeenAt at all.
    expect(ago(null)).toBe("never");
    expect(ago(undefined)).toBe("never");
    expect(ago("not a date")).toBe("never");
  });

  it("returns nothing for a missing timestamp instead of Invalid Date", () => {
    expect(time(null)).toBe("");
    expect(time("rubbish")).toBe("");
  });
});

describe("the greeting", () => {
  it("changes through the day", () => {
    const at = (h) => new Date(2026, 0, 1, h, 0, 0);
    expect(greeting(at(7))).toBe("Good morning");
    expect(greeting(at(11))).toBe("Good morning");
    expect(greeting(at(12))).toBe("Good afternoon");
    expect(greeting(at(16))).toBe("Good afternoon");
    expect(greeting(at(17))).toBe("Good evening");
    expect(greeting(at(23))).toBe("Good evening");
  });

  it("uses the first name only, so it reads like a person said it", () => {
    expect(firstName("Joshua Akintunde")).toBe("Joshua");
    expect(firstName("  Ada  ")).toBe("Ada");
  });

  it("falls back to no name rather than to undefined", () => {
    // An owner who signed up without giving a name gets "Good morning", not
    // "Good morning, undefined".
    expect(firstName(null)).toBe("");
    expect(firstName("")).toBe("");
    expect(firstName("   ")).toBe("");
  });
});
