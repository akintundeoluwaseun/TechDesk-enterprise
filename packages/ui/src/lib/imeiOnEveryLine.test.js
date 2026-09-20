import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A shop sells a device that was never in their stock list -- bought in that
// morning, a swap, a trade-in. The IMEI field only rendered for items that
// came from inventory, so there was nowhere to put the serial and the receipt
// went out without it. That is the one number a customer comes back with, and
// the one the shop needs if it is stolen.
const src = readFileSync(resolve(__dirname, "../components/NewSaleModal.jsx"), "utf-8");

describe("IMEI can be recorded on any line of a sale", () => {
  it("the field is not gated on the item coming from inventory", () => {
    expect(src).not.toMatch(/\{item\.fromInventory\s*&&\s*\(/);
    expect(src).toMatch(/IMEI \/ Serial number/);
  });

  it("a manually added item carries an imei key", () => {
    // Without it the input is uncontrolled until the first keystroke, and
    // React swaps it mid-edit -- which loses what was typed.
    const manual = src.slice(src.indexOf("function addManualItem"), src.indexOf("function updateQty"));
    expect(manual).toMatch(/fromInventory:\s*false/);
    expect(manual).toMatch(/imei:\s*""/);
  });

  it("the input never goes uncontrolled on an older cart", () => {
    // A sale being edited was saved before manual items had the key.
    expect(src).toMatch(/value=\{item\.imei \|\| ""\}/);
  });

  it("whatever is typed is saved with the sale", () => {
    const payload = src.slice(src.indexOf("const payload = {"));
    expect(payload).toMatch(/imei:\s*i\.imei \|\| ""/);
  });
});
