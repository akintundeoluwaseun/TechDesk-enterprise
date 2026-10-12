import { describe, it, expect } from "vitest";
import { salePaymentStatus, repairPaymentStatus, saleOwed, repairOwed } from "./summary";

describe("a sale's payment badge is worked out from the money", () => {
  it("is Paid once the amount covers the total", () => {
    expect(salePaymentStatus({ total: 20000, amountPaid: 20000 })).toBe("Paid");
  });

  it("is Paid when more was handed over than the bill", () => {
    expect(salePaymentStatus({ total: 20000, amountPaid: 25000 })).toBe("Paid");
  });

  it("is Partial when some of it came in", () => {
    expect(salePaymentStatus({ total: 20000, amountPaid: 15000 })).toBe("Partial");
  });

  it("is Pending when none of it did", () => {
    expect(salePaymentStatus({ total: 20000, amountPaid: 0 })).toBe("Pending");
  });

  it("does not care what was written next to it", () => {
    // The reported bug: the sale was paid in full and the list still said
    // Pending, because the word was stored once and the amount changed after.
    expect(salePaymentStatus({ total: 20000, amountPaid: 20000, paymentStatus: "Pending" })).toBe("Paid");
  });

  it("keeps a sale marked Paid by hand with nothing recorded against it", () => {
    // A swap, a debt forgiven, a favour: the shop is stating something this
    // cannot work out from the numbers, so the numbers do not overrule it.
    expect(salePaymentStatus({ total: 20000, amountPaid: 0, paymentStatus: "Paid" })).toBe("Paid");
  });

  it("settles a bill that floating point left a fraction above the amount", () => {
    // A 1.10 item and a 2.20 one come to 3.3000000000000003 in binary, and
    // the customer hands over the 3.30 the screen is showing them. Compared
    // as typed, that sale owes a ten-thousand-billionth of a naira for as
    // long as it exists, and no amount anyone can enter will ever clear it.
    const total = 1.1 + 2.2;
    expect(total > 3.3).toBe(true);           // the trap this exists for
    expect(salePaymentStatus({ total, amountPaid: 3.3 })).toBe("Paid");
    expect(saleOwed({ total, amountPaid: 3.3 })).toBe(0);
  });

  it("does not leave a sale discounted to nothing owing forever", () => {
    expect(salePaymentStatus({ total: 0, amountPaid: 0 })).toBe("Paid");
  });

  it("keeps an old Partial that never recorded an amount", () => {
    expect(salePaymentStatus({ total: 20000, amountPaid: 0, paymentStatus: "Partial" })).toBe("Partial");
  });
});

describe("a repair's badge works the same way, in its own words", () => {
  const job = (over) => ({ repairCost: 10000, parts: [{ price: 2000, qty: 2 }], ...over });

  it("counts parts into the bill before deciding", () => {
    expect(repairPaymentStatus(job({ amountPaid: 10000 }))).toBe("Partial");
    expect(repairPaymentStatus(job({ amountPaid: 14000 }))).toBe("Paid");
  });

  it("says Unpaid, not Pending -- the repairs dropdown only offers Unpaid", () => {
    expect(repairPaymentStatus(job({ amountPaid: 0 }))).toBe("Unpaid");
  });

  it("is Paid on a job done as a favour", () => {
    expect(repairPaymentStatus({ repairCost: 0, parts: [] })).toBe("Paid");
    expect(repairOwed({ repairCost: 0, parts: [] })).toBe(0);
  });
});
