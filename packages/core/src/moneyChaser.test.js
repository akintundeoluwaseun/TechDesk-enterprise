import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import { storage } from "./storage";
import { debtors, chaseMessage, markChased, setPromise, recordPayment, runChaseUndo, toneFor } from "./moneyChaser";

const NOW = new Date(2026, 9, 7, 10, 0, 0);
const ago = (d) => { const x = new Date(NOW); x.setDate(x.getDate() - d); return x.toISOString(); };
const money = (n) => `₦${n.toLocaleString("en")}`;

function seed() {
  const chidi = db.findOrCreateCustomer({ name: "Chidi Okafor", phone: "08031234567" });
  const s1 = db.createSale({ customerId: chidi.id, customerName: "Chidi Okafor", total: 15000, amountPaid: 5000, paymentStatus: "Pending", items: [{ name: "20W charger", qty: 2, price: 7500 }], createdAt: ago(20) });
  const s2 = db.createSale({ customerId: chidi.id, customerName: "Chidi Okafor", total: 8000, amountPaid: 0, paymentStatus: "Pending", items: [{ name: "Screen guard", qty: 1, price: 8000 }], createdAt: ago(5) });
  const r1 = db.createRepair({ customerName: "Aisha Bello", customerPhone: "0812 765 4321", device: "Samsung A54", status: "delivered", repairCost: 20000, paymentStatus: "Unpaid", createdAt: ago(9), readyAt: ago(8) });
  db.createRepair({ customerName: "Tunde", device: "HP laptop", status: "in progress", repairCost: 30000, paymentStatus: "Unpaid", createdAt: ago(10) });
  db.createSale({ customerName: "Bayo", customerPhone: "08051112222", total: 3000, amountPaid: 0, paymentStatus: "Pending", items: [{ name: "Cable", qty: 1, price: 3000 }], createdAt: ago(1) });
  db.createSale({ customerName: "Walk-in", total: 9000, amountPaid: 0, paymentStatus: "Pending", items: [], createdAt: ago(4) });
  return { chidi, s1, s2, r1 };
}

describe("the money chaser", () => {
  beforeEach(() => storage.clear());

  it("gathers each customer's debts, skips jobs still on the bench and nameless walk-ins", () => {
    seed();
    const list = debtors({}, NOW);
    expect(list.map((d) => [d.name, d.total, d.status])).toEqual([
      ["Chidi Okafor", 18000, "due"],
      ["Aisha Bello", 20000, "due"],
      ["Bayo", 3000, "recent"],
    ].sort((a, b) => b[1] - a[1]));
    const chidi = list.find((d) => d.name === "Chidi Okafor");
    expect(chidi.items.map((i) => i.owed)).toEqual([10000, 8000]); // oldest first
    expect(chidi.days).toBe(20);
    expect(list.find((d) => d.name === "Aisha Bello").days).toBe(8); // from when the job was done
  });

  it("gets firmer with each reminder, and holds a promise to its date", () => {
    seed();
    let chidi = debtors({}, NOW).find((d) => d.name === "Chidi Okafor");
    expect(chidi.tone).toBe("reminder"); // 20 days owed
    expect(toneFor({ days: 4, chase: { count: 0 } })).toBe("friendly");
    markChased(chidi.key, "reminder", NOW);
    chidi = debtors({}, NOW).find((d) => d.name === "Chidi Okafor");
    expect(chidi.status).toBe("asked");
    expect(chidi.chase.count).toBe(1);
    const tomorrow = new Date(NOW.getTime() + 86400000);
    markChased(chidi.key, "reminder", tomorrow);
    expect(debtors({}, new Date(tomorrow.getTime() + 86400000)).find((d) => d.name === "Chidi Okafor").tone).toBe("firm");

    setPromise(chidi.key, "2026-10-09");
    expect(debtors({}, new Date(2026, 9, 9, 9)).find((d) => d.name === "Chidi Okafor").status).toBe("promised");
    const late = debtors({}, new Date(2026, 9, 10, 9)).find((d) => d.name === "Chidi Okafor");
    expect(late.status).toBe("due");
    expect(late.chase.broken).toBe(true);
    expect(late.tone).toBe("promise");
  });

  it("writes the message in English or Pidgin, with how to pay", () => {
    seed();
    const chidi = debtors({}, NOW).find((d) => d.name === "Chidi Okafor");
    const en = chaseMessage(chidi, { tone: "friendly", shop: "Ade Gadgets", payTo: "GTBank 0123456789 (Ade Gadgets)", money });
    expect(en).toMatch(/^Hello Chidi, hope you're well\. A quick reminder from Ade Gadgets: ₦18,000 is still outstanding for 2 unpaid purchases \(INV-\d+, INV-\d+\)\./);
    expect(en).toMatch(/You can pay by transfer to: GTBank 0123456789 \(Ade Gadgets\)/);
    const pcm = chaseMessage(chidi, { tone: "reminder", lang: "pcm", shop: "Ade Gadgets", money });
    expect(pcm).toMatch(/Chidi, na Ade Gadgets again o\. The ₦18,000 .* don stay 20 days\. Abeg try pay am this week\./);
    expect(pcm).not.toMatch(/transfer/);
    const aisha = debtors({}, NOW).find((d) => d.name === "Aisha Bello");
    expect(chaseMessage(aisha, { tone: "firm", money })).toMatch(/₦20,000 for [A-Z]+-\d+ · Samsung A54 repair has now been outstanding for 8 days\. Please pay today/);
  });

  it("records a payment oldest debt first, part-paying a repair, and undoes it", () => {
    const s = seed();
    const chidi = debtors({}, NOW).find((d) => d.name === "Chidi Okafor");
    const out = recordPayment(chidi, 12000, { method: "Bank Transfer", actor: "Admin" });
    expect(out.applied).toBe(12000);
    const sales = db.getSales();
    expect(sales.find((x) => x.id === s.s1.id)).toMatchObject({ amountPaid: 15000, paymentStatus: "Paid" });
    expect(sales.find((x) => x.id === s.s2.id)).toMatchObject({ amountPaid: 2000, paymentStatus: "Pending" });
    runChaseUndo(out.undo);
    expect(db.getSales().find((x) => x.id === s.s1.id).amountPaid).toBe(5000);

    const aisha = debtors({}, NOW).find((d) => d.name === "Aisha Bello");
    recordPayment(aisha, 5000);
    const after = debtors({}, NOW).find((d) => d.name === "Aisha Bello");
    expect(after.total).toBe(15000);
    expect(db.getRepairs().find((r) => r.id === s.r1.id).paymentStatus).toBe("Partial");
  });

  it("paying in full clears the chasing history", () => {
    seed();
    let chidi = debtors({}, NOW).find((d) => d.name === "Chidi Okafor");
    markChased(chidi.key, "friendly", NOW);
    recordPayment(chidi, 999999);
    expect(debtors({}, NOW).find((d) => d.name === "Chidi Okafor")).toBeUndefined();
    db.createSale({ customerId: chidi.customerId, customerName: "Chidi Okafor", total: 1000, amountPaid: 0, paymentStatus: "Pending", items: [], createdAt: ago(10) });
    chidi = debtors({}, NOW).find((d) => d.name === "Chidi Okafor");
    expect(chidi.chase.count).toBe(0);
  });
});
