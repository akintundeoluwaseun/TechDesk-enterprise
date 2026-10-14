import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

// A shop sells a device that was never in their stock list -- bought in that
// morning, a swap, a trade-in. The IMEI field only rendered for items that
// came from inventory, so there was nowhere to put the serial and the receipt
// went out without it. That is the one number a customer comes back with, and
// the one the shop needs if it is stolen.
//
// This file reads the source rather than the rendered page, and that is worth
// doing for exactly one thing: proving a condition is ABSENT. A render test
// can show the field appearing for the cases it thought to set up; only this
// can say it is not gated at all.
//
// It used to assert the spellings of three other lines as well -- `imei: ""`,
// `value={item.imei || ""}`, `imei: i.imei || ""` -- and all three broke the
// day serials became one per unit, while every behaviour they stood for still
// held. What they were really guarding (a hand-typed line can take a serial,
// the inputs are never uncontrolled, what is typed is saved) is now covered by
// rendering the modal and typing into it, in components/serialPerUnit.test.jsx.
// Asserting on source text is for what cannot be rendered.
const src = readFileSync(resolve(__dirname, "../components/NewSaleModal.jsx"), "utf-8");

describe("IMEI can be recorded on any line of a sale", () => {
  it("the field is not gated on the item coming from inventory", () => {
    expect(src).not.toMatch(/\{item\.fromInventory\s*&&\s*\(/);
    expect(src).toMatch(/IMEI \/ Serial number/);
  });

  it("a line's serial boxes come from its quantity, not from one shared field", () => {
    // Two of the same laptop are two machines with two serials. If this ever
    // collapses back to a single `item.imei` input, the second machine goes
    // on the receipt as nothing at all, which is how this started.
    expect(src).toMatch(/serialSlots\(item\.imeis, item\.qty\)\.map\(/);
    expect(src).not.toMatch(/value=\{item\.imei\b/);
  });
});
