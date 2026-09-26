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
});

describe("not signed in yet", () => {
  it("offers a third door for a worker joining with a code here too", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });
    account.workerJoin.mockResolvedValue({ ok: true, workerName: "Ade" });

    render(<ThemeProvider><AccountTab /></ThemeProvider>);
    await screen.findByText("Sign in to sync data");

    fireEvent.click(screen.getByText(/Joining a shop that already has an account/));
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("6-digit code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Ade" } });
    fireEvent.click(screen.getByText("Connect to a business"));

    await waitFor(() => expect(account.workerJoin).toHaveBeenCalledWith("shop@example.com", "123456", "Ade"));
  });
});
