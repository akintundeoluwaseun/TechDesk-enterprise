import { describe, it, expect, beforeEach } from "vitest";
import { shopSetupNeeds, wantsSaleSetup, markSaleSetupDone, ticketDownloaded, markTicketDownloaded, onTourRequest, requestTour } from "./setupTours";
import { saleSetupSteps, repairTicketSteps } from "./setupTourSteps";

beforeEach(() => localStorage.clear());

describe("before the first sale", () => {
  it("asks for both when neither the name nor the signature is set", () => {
    const needs = shopSetupNeeds({ shopName: "TechDesk" });
    expect(needs).toEqual({ name: true, signature: true });
    const targets = saleSetupSteps({ desktop: true, needs }).map((s) => s.target || (s.center ? "intro" : ""));
    expect(targets).toEqual(["intro", "shop-name", "owner-signature", "signature-pad"]);
  });

  it("goes straight to the signature when the name is already there", () => {
    const needs = shopSetupNeeds({ shopName: "Ade Gadgets" });
    expect(needs).toEqual({ name: false, signature: true });
    const steps = saleSetupSteps({ desktop: true, needs });
    expect(steps.map((s) => s.target || "intro")).toEqual(["intro", "owner-signature", "signature-pad"]);
    expect(steps[0].title).toBe("Sign your receipts once");
    // Closing the pad without signing goes back to the "Tap to sign" step.
    expect(steps[2].fallback).toBe(1);
  });

  it("says nothing once both are set", () => {
    expect(wantsSaleSetup({ shopName: "Ade Gadgets", ownerSignature: "data:image/png;base64,x" })).toBe(false);
  });

  it("asks only once, even if they wave it away", () => {
    expect(wantsSaleSetup({ shopName: "" })).toBe(true);
    markSaleSetupDone();
    expect(wantsSaleSetup({ shopName: "" })).toBe(false);
  });
});

describe("after the first repair", () => {
  it("shows until a ticket has ever been downloaded", () => {
    expect(ticketDownloaded()).toBe(false);
    markTicketDownloaded();
    expect(ticketDownloaded()).toBe(true);
  });

  it("covers the screen first, then points at that repair's ticket button", () => {
    const steps = repairTicketSteps({ desktop: false, repairId: "rep_1", ticketLabel: "repair ticket" });
    expect(steps[0].center).toBe(true);
    expect(steps[0].title).toMatch(/Print the repair ticket and give it to your customer/);
    expect(steps[1]).toMatchObject({ target: "ticket-rep_1", action: "click" });
  });

  it("rings the shell with what to show", () => {
    const heard = [];
    const off = onTourRequest((kind, o) => heard.push([kind, o]));
    requestTour("repair-ticket", { repairId: "r" });
    off();
    expect(heard).toEqual([["repair-ticket", { repairId: "r" }]]);
  });
});
