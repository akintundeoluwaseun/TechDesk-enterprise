import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../../lib/ThemeContext";
import { SettingsProvider } from "../../lib/SettingsContext";
import { db } from "../../lib/db";
import { setCurrentTier, currentStaffLimit, FREE_TIER } from "../../lib/tier";
import UsersTab from "./UsersTab";

vi.mock("../../lib/account", () => ({
  account: {
    status: vi.fn(async () => ({ signedIn: false })),
    inviteStart: vi.fn(),
    listWorkers: vi.fn(async () => ({ ok: true, workers: [] })),
    revokeWorker: vi.fn(),
  },
}));

function usersTab() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SettingsProvider>
          <UsersTab />
        </SettingsProvider>
      </ThemeProvider>
    </MemoryRouter>,
  );
}

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

// Local (this-device, PIN) users and online (cloud-account) workers are two
// different questions -- "who can sign in at this counter" and "who can
// reach this shop's records from somewhere else" -- so each gets its own
// summary row and its own popup here on Users, rather than either one being
// buried on a different tab or the two spilling into a single list.
describe("the Users tab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setCurrentTier(FREE_TIER);
    db.getUsers().forEach((u) => db.deleteUser(u.id));
  });

  it("keeps PIN recovery behind its own popup", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });

    usersTab();
    expect(screen.getByText("If you forget your PIN")).toBeInTheDocument();
    expect(screen.getByText("Nothing set yet")).toBeInTheDocument();
    expect(screen.queryByText("Save questions")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Manage"));
    expect(screen.getByText("Save questions")).toBeInTheDocument();
  });

  it("keeps local users behind their own popup, off the tab itself", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });

    usersTab();
    expect(screen.getByText("Local users")).toBeInTheDocument();
    expect(screen.queryByText("Add user")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Manage local users"));
    expect(screen.getByText("Add user")).toBeInTheDocument();
  });

  it("still shows the online workers row to a device that isn't signed in, with a hint why it's not usable yet", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });

    usersTab();
    const manage = await screen.findByText("Manage online workers");
    expect(screen.getByText("Sign in from Account first")).toBeInTheDocument();

    fireEvent.click(manage);
    expect(
      screen.getByText(/isn't signed into the shop's cloud account yet/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Invite a worker")).not.toBeInTheDocument();
  });

  it("tells a worker's own device it can't manage other workers, rather than hiding the option", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, role: "worker", workerName: "Ade" });

    usersTab();
    const manage = await screen.findByText("Manage online workers");
    expect(screen.getByText("Not on a worker's own device")).toBeInTheDocument();

    fireEvent.click(manage);
    expect(screen.getByText(/can't invite or manage another worker/)).toBeInTheDocument();
    expect(screen.queryByText("Invite a worker")).not.toBeInTheDocument();
  });

  it("lets the signed-in owner invite and see online workers, in their own popup", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    account.inviteStart.mockResolvedValue({ ok: true, code: "482913", expiresInMinutes: 15 });
    account.listWorkers.mockResolvedValue({
      ok: true,
      workers: [{ id: "w1", name: "Ade", pages: ["sales"], joinedAt: "2026-01-05T10:00:00Z" }],
    });

    usersTab();
    fireEvent.click(await screen.findByText("Manage online workers"));

    await screen.findByText("Invite a worker");
    expect(await screen.findByText("Ade")).toBeInTheDocument();
    expect(screen.getByText("Can open: Sales")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Generate a code"));
    await waitFor(() => expect(screen.getByText("482913")).toBeInTheDocument());
  });

  it("disconnects a worker after confirming, and drops them from the list", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    account.listWorkers.mockResolvedValue({
      ok: true,
      workers: [{ id: "w1", name: "Ade", pages: ["sales"], joinedAt: "2026-01-05T10:00:00Z" }],
    });
    account.revokeWorker.mockResolvedValue({ ok: true });
    vi.spyOn(window, "confirm").mockReturnValue(true);

    usersTab();
    fireEvent.click(await screen.findByText("Manage online workers"));
    await screen.findByText("Ade");

    fireEvent.click(screen.getByText("Disconnect"));

    await waitFor(() => expect(account.revokeWorker).toHaveBeenCalledWith("w1"));
    await waitFor(() => expect(screen.queryByText("Ade")).not.toBeInTheDocument());
  });
});
