import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ThemeProvider } from "../../lib/ThemeContext";
import AccountTab from "./AccountTab";

vi.mock("../../lib/account", () => ({
  account: {
    status: vi.fn(),
    workerJoin: vi.fn(),
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

describe("a signed-in device", () => {
  it("shows sync status and a way to sync now", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);

    await screen.findByText("Signed in");
    expect(screen.getByText("shop@example.com")).toBeInTheDocument();
    expect(screen.getByText("Sync now")).toBeInTheDocument();
  });

  it("offers a way to sign in to a different business without a detour through the teaser card", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    account.signOut.mockResolvedValue({ ok: true });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    await screen.findByText("Signed in");

    account.status.mockResolvedValue({ signedIn: false });
    fireEvent.click(screen.getByText("Sign in to a different business"));

    await waitFor(() => expect(account.signOut).toHaveBeenCalled());
    // Straight to the Sign in form, not back to the teaser card first.
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
  });
});

describe("signing in says so, plainly", () => {
  it("shows a clear, temporary confirmation once signed in", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });
    account.signIn.mockResolvedValue({ ok: true });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    await screen.findByText("Sign in to sync data");

    fireEvent.click(screen.getByText("Sign in"));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByPlaceholderText("Email"), { target: { value: "shop@example.com" } });
    fireEvent.change(within(dialog).getByPlaceholderText("Password"), { target: { value: "hunter2" } });
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Sign in" }));

    await waitFor(() => expect(screen.getByText("You're signed in.")).toBeInTheDocument());
  });

  it("shows the same confirmation when a worker connects with a code", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });
    account.workerJoin.mockResolvedValue({ ok: true, workerName: "Ade" });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    await screen.findByText("Sign in to sync data");

    fireEvent.click(screen.getByText(/Joining a shop that already has an account/));
    fireEvent.change(screen.getByPlaceholderText("Shop's email"), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("6-digit code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Ade" } });
    account.status.mockResolvedValue({ signedIn: true, role: "worker", workerName: "Ade" });
    fireEvent.click(screen.getByRole("button", { name: "Connect to a business" }));

    await waitFor(() => expect(screen.getByText("You're connected as Ade.")).toBeInTheDocument());
  });
});

describe("each door shows only its own form", () => {
  it("the Sign in popup offers nothing but signing in", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    await screen.findByText("Sign in to sync data");

    fireEvent.click(screen.getByText("Sign in"));
    const dialog = screen.getByRole("dialog");

    expect(within(dialog).getByPlaceholderText("Email")).toBeInTheDocument();
    expect(within(dialog).getByPlaceholderText("Password")).toBeInTheDocument();
    // No cross-links to the other two doors inside the popup itself -- close
    // it and open a different one from the teaser card instead. (The teaser
    // card's own buttons are still in the DOM behind the popup; what matters
    // is that the popup does not repeat them.)
    expect(within(dialog).queryByText(/Set up your business/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText(/Connect to a business/)).not.toBeInTheDocument();
  });
});

describe("a worker's own device signed in here", () => {
  it("shows who it is connected as, not an email or password", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, role: "worker", workerName: "Ade" });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);

    await screen.findByText("Connected as Ade");
    expect(screen.getByText("Working on this shop's sales, repairs and inventory.")).toBeInTheDocument();
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
