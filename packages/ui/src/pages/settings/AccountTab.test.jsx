import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import { ThemeProvider } from "../../lib/ThemeContext";
import { AuthProvider } from "../../lib/AuthContext";
import AccountTab from "./AccountTab";

vi.mock("../../lib/account", () => ({
  account: {
    status: vi.fn(),
    workerJoin: vi.fn(),
    signIn: vi.fn(),
    signUp: vi.fn(),
    signOut: vi.fn(),
    confirmSignUp: vi.fn(),
    requestPasswordReset: vi.fn(),
    confirmPasswordReset: vi.fn(),
    pull: vi.fn(async () => ({ ok: true, more: false })),
    push: vi.fn(async () => ({ ok: true, more: false })),
  },
  setAccountGateDecision: vi.fn(),
  getPushCursor: vi.fn(() => null),
  setPushCursor: vi.fn(),
  getPullCursor: vi.fn(() => null),
  setPullCursor: vi.fn(),
  getCachedAccountStatus: vi.fn(() => null),
}));

vi.mock("../../lib/db", () => ({
  db: { countUnsynced: vi.fn(() => 0), getSettings: vi.fn(() => ({})) },
  CHANGED_EVENT: "techdesk:changed",
}));

beforeEach(() => vi.clearAllMocks());

describe("a signed-in device", () => {
  it("shows sync status, with nothing to press -- syncing runs on its own", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);

    await screen.findByText("Signed in");
    expect(screen.getByText("shop@example.com")).toBeInTheDocument();
    expect(screen.getByText("Nothing sent yet")).toBeInTheDocument();
    expect(screen.getByText("Nothing waiting.")).toBeInTheDocument();
    expect(screen.queryByText("Sync now")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /sync/i })).not.toBeInTheDocument();
  });

  it("offers a way to sign in to a different business without a detour through the teaser card", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);
    await screen.findByText("Signed in");

    fireEvent.click(screen.getByText("Sign in to a different business"));

    // Straight to the Sign in form, not back to the teaser card first.
    expect(screen.getByPlaceholderText("Email")).toBeInTheDocument();
    // And NOT signed out first: backing out of this popup unfinished must
    // leave the device signed in exactly as it was, not stuck signed out.
    expect(account.signOut).not.toHaveBeenCalled();
    expect(screen.getByText("Signed in")).toBeInTheDocument();
    expect(screen.getByText("shop@example.com")).toBeInTheDocument();
  });
});

describe("signing in says so, plainly", () => {
  it("shows a clear, temporary confirmation once signed in", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });
    account.signIn.mockResolvedValue({ ok: true });

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);
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

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);
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

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);
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

describe("finishing a fresh signup with the code from the confirmation email", () => {
  it("moves from Set up your business straight to a code, not back to Sign in with a dead link to click", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });
    account.signUp.mockResolvedValue({ ok: true, needsConfirmation: true });
    account.confirmSignUp.mockResolvedValue({ ok: true });

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);
    await screen.findByText("Sign in to sync data");

    fireEvent.click(screen.getByText(/Set up your business/));
    const signupDialog = screen.getByRole("dialog");
    fireEvent.change(within(signupDialog).getByPlaceholderText("Email"), { target: { value: "shop@example.com" } });
    fireEvent.change(within(signupDialog).getByPlaceholderText("Password"), { target: { value: "hunter2" } });
    fireEvent.click(within(signupDialog).getByRole("button", { name: "Set up your business" }));

    await screen.findByText("Confirm your email");
    const codeDialog = screen.getByRole("dialog");
    expect(within(codeDialog).queryByPlaceholderText("Email")).not.toBeInTheDocument();
    fireEvent.change(within(codeDialog).getByPlaceholderText("Code from your email"), { target: { value: "482913" } });
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    fireEvent.click(within(codeDialog).getByRole("button", { name: "Confirm" }));

    await waitFor(() => expect(account.confirmSignUp).toHaveBeenCalledWith("shop@example.com", "482913"));
    await waitFor(() => expect(screen.getByText("You're signed in.")).toBeInTheDocument());
  });

  it("shows the owner's real message for a wrong or expired code", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });
    account.signUp.mockResolvedValue({ ok: true, needsConfirmation: true });
    account.confirmSignUp.mockResolvedValue({ ok: false, message: "That code isn't right, or it has expired. Ask for a new one." });

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);
    await screen.findByText("Sign in to sync data");
    fireEvent.click(screen.getByText(/Set up your business/));
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("Password"), { target: { value: "hunter2" } });
    fireEvent.click(screen.getByRole("button", { name: "Set up your business" }));

    await screen.findByText("Confirm your email");
    fireEvent.change(screen.getByPlaceholderText("Code from your email"), { target: { value: "000000" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm" }));

    await waitFor(() =>
      expect(screen.getByText("That code isn't right, or it has expired. Ask for a new one.")).toBeInTheDocument(),
    );
  });
});

describe("forgot password", () => {
  it("offers it only on the Sign in form, not Set up your business or Connect to a business", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);
    await screen.findByText("Sign in to sync data");

    fireEvent.click(screen.getByText("Sign in"));
    expect(within(screen.getByRole("dialog")).getByText("Forgot password?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close Sign in" }));

    fireEvent.click(screen.getByText(/Set up your business/));
    expect(within(screen.getByRole("dialog")).queryByText("Forgot password?")).not.toBeInTheDocument();
  });

  it("goes from a code request to setting a new password, and lands signed in", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });
    account.requestPasswordReset.mockResolvedValue({ ok: true });
    account.confirmPasswordReset.mockResolvedValue({ ok: true });

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);
    await screen.findByText("Sign in to sync data");
    fireEvent.click(screen.getByText("Sign in"));
    fireEvent.click(screen.getByText("Forgot password?"));

    await screen.findByText("Reset your password");
    const requestDialog = screen.getByRole("dialog");
    fireEvent.change(within(requestDialog).getByPlaceholderText("Email"), { target: { value: "shop@example.com" } });
    fireEvent.click(within(requestDialog).getByRole("button", { name: "Send code" }));

    await waitFor(() => expect(account.requestPasswordReset).toHaveBeenCalledWith("shop@example.com"));
    await screen.findByText("Choose a new password");
    const confirmDialog = screen.getByRole("dialog");
    fireEvent.change(within(confirmDialog).getByPlaceholderText("Code from your email"), { target: { value: "112233" } });
    fireEvent.change(within(confirmDialog).getByPlaceholderText("New password"), { target: { value: "newhunter3" } });
    account.status.mockResolvedValue({ signedIn: true, email: "shop@example.com" });
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Set new password" }));

    await waitFor(() =>
      expect(account.confirmPasswordReset).toHaveBeenCalledWith("shop@example.com", "112233", "newhunter3"),
    );
    await waitFor(() => expect(screen.getByText("Password changed. You're signed in.")).toBeInTheDocument());
  });

  it("never says whether the email has an account -- the same message either way", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });
    account.requestPasswordReset.mockResolvedValue({ ok: true });

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);
    await screen.findByText("Sign in to sync data");
    fireEvent.click(screen.getByText("Sign in"));
    fireEvent.click(screen.getByText("Forgot password?"));
    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "anyone@example.com" } });
    fireEvent.click(screen.getByRole("button", { name: "Send code" }));

    await screen.findByText("Choose a new password");
    // No "no account found" branch exists to accidentally reach -- the same
    // next screen follows every request, whatever the email turns out to be.
  });
});

describe("a worker's own device signed in here", () => {
  it("shows who it is connected as, not an email or password", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: true, role: "worker", workerName: "Ade" });

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);

    await screen.findByText("Connected as Ade");
    expect(screen.getByText("Working on this shop's sales, repairs and inventory.")).toBeInTheDocument();
  });
});

describe("not signed in yet", () => {
  it("offers a third door for a worker joining with a code here too", async () => {
    const { account } = await import("../../lib/account");
    account.status.mockResolvedValue({ signedIn: false });
    account.workerJoin.mockResolvedValue({ ok: true, workerName: "Ade" });

    render(<ThemeProvider><AuthProvider><AccountTab /></AuthProvider></ThemeProvider>);
    await screen.findByText("Sign in to sync data");

    fireEvent.click(screen.getByText(/Joining a shop that already has an account/));
    fireEvent.change(screen.getByPlaceholderText("Shop's email"), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("6-digit code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Ade" } });
    fireEvent.click(screen.getByRole("button", { name: "Connect to a business" }));

    await waitFor(() => expect(account.workerJoin).toHaveBeenCalledWith("shop@example.com", "123456", "Ade"));
  });
});
