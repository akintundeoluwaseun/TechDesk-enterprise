import { describe, it, expect } from "vitest";
import { matchCustomer, nameLikeness, soundKey } from "./voiceOrder";

const customers = [
  { id: 1, name: "Bola Oluwatoyin" },
  { id: 2, name: "Chidi Okafor" },
  { id: 3, name: "Ngozi Eze" },
  { id: 4, name: "Oluwaseun Adebayo" },
  { id: 5, name: "Tunde Bakare" },
];

describe("Nigerian names the phone spelt the English way", () => {
  it("finds the customer from how the name sounds", () => {
    expect(matchCustomer("Bola Oluwa to in", "", customers).customer?.id).toBe(1);
    expect(matchCustomer("Chee dee", "", customers).customer?.id).toBe(2);
    expect(matchCustomer("in gozi", "", customers).customer?.id).toBe(3);
  });
  it("offers a choice when it's close but not sure", () => {
    const r = matchCustomer("Oluwa Shayun", "", customers);
    expect(r.customer).toBeNull();
    expect(r.candidates.map((c) => c.id)).toContain(4);
    expect(matchCustomer("tunday", "", customers).candidates.map((c) => c.id)).toContain(5);
  });
  it("doesn't invent a match for a name that isn't there", () => {
    const r = matchCustomer("John", "", customers);
    expect(r.customer).toBeNull();
    expect(r.candidates).toEqual([]);
  });
  it("reads tone marks as plain letters", () => {
    expect(soundKey("Olúwatóyìn")).toBe(soundKey("Oluwatoyin"));
    expect(nameLikeness("toyin", "Bola Olúwatóyìn")).toBeGreaterThanOrEqual(0.75);
  });
  it("still prefers the exact spelling", () => {
    expect(matchCustomer("chidi okafor", "", customers).customer?.id).toBe(2);
  });
});
