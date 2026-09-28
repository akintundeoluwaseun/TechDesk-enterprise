import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ThemeProvider } from "../../lib/ThemeContext";
import AccountTab from "./AccountTab";

vi.mock("../../lib/account", () => ({
  account: {
    status: vi.fn(),
    inviteStart: vi.fn(),
    workerJoin: vi.fn(),
    listWorkers: vi.fn(async () => ({ ok: true, workers: [] })),
    revokeWorker: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    pull: vi.fn(async () => ({ ok: true, more: false })),
    push: vi.fn(async () => ({ ok: true, more: false })),
  },
  setAccountGateDecision: vi.fn(),
  getPushCursor: vi.fn(() => null),
  setPushCursor: vi.fn(),
  getPullCursor: vi.fn(() => null),
  setPullCursor: vi.fn(),
}));

vi.mock("../../lib/db", () => ({
  db: { countUnsynced: vi.fn(() => 0) },
}));

beforeEach(() => vi.clearAllMocks());

describe("the owner's own device can invite a worker", () => {
  it("shows a way to generate a code, and displays the code once generated", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    account.inviteStart.mockResolvedValue({ ok: true, code: "482913", expiresInMinutes: 15 });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);

    const generate = await screen.findByText("Generate a code");
    fireEvent.click(generate);

    await waitFor(() => expect(screen.getByText("482913")).toBeInTheDocument());
    expect(screen.getByText(/Expires in/)).toBeInTheDocument();
  });

  it("shows the owner's real message when generating a code fails", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    account.inviteStart.mockResolvedValue({ ok: false, message: "Too many attempts. Try again shortly." });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    fireEvent.click(await screen.findByText("Generate a code"));

    await waitFor(() => expect(screen.getByText("Too many attempts. Try again shortly.")).toBeInTheDocument());
  });

  it("defaults to all three pages, and generates a code for exactly what is ticked", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    account.inviteStart.mockResolvedValue({ ok: true, code: "482913", expiresInMinutes: 15, pages: ["sales", "repairs"] });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    await screen.findByText("Invite a worker");

    // All three start ticked -- the same access every worker used to get.
    expect(screen.getByRole("checkbox", { name: "Sales" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Repairs" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Inventory" })).toBeChecked();

    // The admin narrows it to two before reading the code out.
    fireEvent.click(screen.getByRole("checkbox", { name: "Inventory" }));
    fireEvent.click(screen.getByText("Generate a code"));

    await waitFor(() => expect(account.inviteStart).toHaveBeenCalledWith(["sales", "repairs"]));
    await waitFor(() => expect(screen.getByText(/This code gives access to: Sales, Repairs/)).toBeInTheDocument());
  });

  it("refuses to generate a code with no page ticked", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    await screen.findByText("Invite a worker");

    fireEvent.click(screen.getByRole("checkbox", { name: "Sales" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Repairs" }));
    fireEvent.click(screen.getByRole("checkbox", { name: "Inventory" }));

    expect(screen.getByText("Generate a code")).toBeDisabled();
    expect(account.inviteStart).not.toHaveBeenCalled();
  });
});

describe("a worker's own device signed in here", () => {
  it("never sees the invite panel -- a worker cannot invite another worker", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, role: "worker", workerName: "Ade" });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);

    await screen.findByText("Connected as Ade");
    expect(screen.queryByText("Invite a worker")).not.toBeInTheDocument();
    expect(screen.queryByText("Generate a code")).not.toBeInTheDocument();
  });

  it("never sees a way to see or disconnect workers either", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, role: "worker", workerName: "Ade" });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);

    await screen.findByText("Connected as Ade");
    expect(screen.queryByText("See your workers")).not.toBeInTheDocument();
  });
});

describe("the owner can see and disconnect the workers connected to this shop", () => {
  it("lists every worker, with what they can open and when they joined", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    account.listWorkers.mockResolvedValue({
      ok: true,
      workers: [
        { id: "w1", name: "Ade", pages: ["sales"], joinedAt: "2026-01-05T10:00:00Z" },
        { id: "w2", name: "Bola", pages: ["repairs", "inventory"], joinedAt: "2026-02-01T10:00:00Z" },
      ],
    });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    fireEvent.click(await screen.findByText("See your workers"));

    await waitFor(() => expect(screen.getByText("Ade")).toBeInTheDocument());
    expect(screen.getByText("Bola")).toBeInTheDocument();
    expect(screen.getByText("Can open: Sales")).toBeInTheDocument();
    expect(screen.getByText("Can open: Repairs, Inventory")).toBeInTheDocument();
  });

  it("says plainly when nobody has joined yet", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    account.listWorkers.mockResolvedValue({ ok: true, workers: [] });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    fireEvent.click(await screen.findByText("See your workers"));

    await waitFor(() => expect(screen.getByText("No workers connected yet.")).toBeInTheDocument());
  });

  it("shows the owner's real message when the list can't be loaded", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    account.listWorkers.mockResolvedValue({ ok: false, message: "Couldn't reach TechDesk. Check your internet." });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    fireEvent.click(await screen.findByText("See your workers"));

    await waitFor(() =>
      expect(screen.getByText("Couldn't reach TechDesk. Check your internet.")).toBeInTheDocument()
    );
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

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    fireEvent.click(await screen.findByText("See your workers"));
    await screen.findByText("Ade");

    fireEvent.click(screen.getByText("Disconnect"));

    await waitFor(() => expect(account.revokeWorker).toHaveBeenCalledWith("w1"));
    await waitFor(() => expect(screen.queryByText("Ade")).not.toBeInTheDocument());
  });

  it("never calls revokeWorker when the admin backs out of the confirm", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    account.listWorkers.mockResolvedValue({
      ok: true,
      workers: [{ id: "w1", name: "Ade", pages: ["sales"], joinedAt: "2026-01-05T10:00:00Z" }],
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    fireEvent.click(await screen.findByText("See your workers"));
    await screen.findByText("Ade");

    fireEvent.click(screen.getByText("Disconnect"));

    expect(account.revokeWorker).not.toHaveBeenCalled();
    expect(screen.getByText("Ade")).toBeInTheDocument();
  });
});

describe("not signed in yet", () => {
  it("offers a third door for a worker joining with a code here too", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });
    account.workerJoin.mockResolvedValue({ ok: true, workerName: "Ade" });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    await screen.findByText("Sign in to sync data");

    fireEvent.click(screen.getByText(/Joining a shop that already has an account/));
    fireEvent.change(screen.getByPlaceholderText("Shop's email"), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("6-digit code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Ade" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect to a business" }));

    await waitFor(() => expect(account.workerJoin).toHaveBeenCalledWith("shop@example.com", "123456", "Ade"));
  });
});
