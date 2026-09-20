import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import {
  ALPHABET, CODE_LENGTH, GROUP_SIZE, HASH_HEX,
  normalizeCode, formatCode, hashPreimage,
} from "./activationCode";

describe("reading a code down a phone line", () => {
  it("does not care about case, dashes or spaces", () => {
    expect(normalizeCode("k4m9-xb7t-9q2r")).toBe("K4M9XB7T9Q2R");
    expect(normalizeCode("  K4M9 XB7T 9Q2R  ")).toBe("K4M9XB7T9Q2R");
    expect(normalizeCode("K4M9XB7T9Q2R")).toBe("K4M9XB7T9Q2R");
  });

  it("forgives the three letters nobody can tell from digits", () => {
    // The alphabet has no I, L or O, so anyone typing one meant 1, 1 and 0.
    expect(normalizeCode("I234")).toBe("1234");
    expect(normalizeCode("L234")).toBe("1234");
    expect(normalizeCode("O234")).toBe("0234");
  });

  it("leaves a genuinely wrong character in, so the code fails instead of shifting", () => {
    // Dropping the U would turn a typo into a different, possibly valid code.
    expect(normalizeCode("K4M9U")).toBe("K4M9U");
  });

  it("survives nothing at all", () => {
    expect(normalizeCode("")).toBe("");
    expect(normalizeCode(null)).toBe("");
    expect(normalizeCode(undefined)).toBe("");
  });

  it("prints in groups a person can keep their place in", () => {
    expect(formatCode("K4M9XB7T9Q2R")).toBe("K4M9-XB7T-9Q2R");
    expect(formatCode("k4m9xb7t9q2r")).toBe("K4M9-XB7T-9Q2R");
    // Round trip: what is printed is what is accepted.
    expect(normalizeCode(formatCode("K4M9XB7T9Q2R"))).toBe("K4M9XB7T9Q2R");
  });
});

describe("the alphabet", () => {
  it("is exactly 32 long, so a random byte indexes it without bias", () => {
    expect(ALPHABET).toHaveLength(32);
    expect(new Set(ALPHABET).size).toBe(32);
  });

  it("excludes the characters that get misread", () => {
    for (const c of "ILOU") expect(ALPHABET).not.toContain(c);
  });

  it("only produces codes the normalizer leaves alone", () => {
    for (const c of ALPHABET) expect(normalizeCode(c)).toBe(c);
  });
});

describe("what gets hashed", () => {
  it("includes the tier, so a Business code can never make an Enterprise hash", () => {
    expect(hashPreimage("123456", "business", "K4M9-XB7T-9Q2R")).not.toBe(
      hashPreimage("123456", "enterprise", "K4M9-XB7T-9Q2R")
    );
  });

  it("includes the PIN, so a code is worthless on another device", () => {
    expect(hashPreimage("123456", "business", "K4M9XB7T9Q2R")).not.toBe(
      hashPreimage("654321", "business", "K4M9XB7T9Q2R")
    );
  });

  it("normalizes first, so a dashed code and a bare one hash the same", () => {
    expect(hashPreimage("123456", "business", "k4m9-xb7t-9q2r")).toBe(
      hashPreimage("123456", "business", "K4M9XB7T9Q2R")
    );
  });
});

describe("the generator and the app agree", () => {
  // This is the failure that would only ever show up at a customer's counter:
  // a code that is right on the paper and refused on the screen. Both sides
  // import this module, so the check is that the module says one thing.
  it("computes the same truncated digest on both sides", async () => {
    const pin = "123456";
    const code = "K4M9-XB7T-9Q2R";

    // What scripts/generate-activation-table.mjs writes into the table.
    const minted = createHash("sha256")
      .update(hashPreimage(pin, "business", code))
      .digest("hex")
      .slice(0, HASH_HEX);

    // What the app computes when the shop types it in.
    const data = new TextEncoder().encode(hashPreimage(pin, "business", code));
    const digest = await crypto.subtle.digest("SHA-256", data);
    const typed = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("")
      .slice(0, HASH_HEX);

    expect(typed).toBe(minted);
    expect(minted).toHaveLength(HASH_HEX);
  });

  it("agrees on the shape too", () => {
    expect(CODE_LENGTH % GROUP_SIZE).toBe(0);
  });
});
