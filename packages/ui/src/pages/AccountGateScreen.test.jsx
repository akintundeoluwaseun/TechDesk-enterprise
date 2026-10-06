import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../lib/ThemeContext";
import { AuthProvider } from "../lib/AuthContext";
import AccountGateScreen from "./AccountGateScreen";

// "Single business" vs "connected to a larger business" is answered by which
// button a shop taps here, not by a separate question -- Set up your
// business is signUp (a brand new shop, empty), Sign in to your business is
// signIn (an existing shop's cloud copy, which useAccountSync then pulls
// down onto this device). The copy has to say that plainly, in the shop's
// own words, not "create an account" / "sign in", which reads as though it's
// asking about a login for the app itself rather than about the shop.
describe("the choice a new device is actually asked", () => {
  it("offers set up vs connect, not a generic sign in / sign up", () => {
    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={vi.fn()} /></AuthProvider></ThemeProvider>);
    expect(screen.getByText("Set up a new business")).toBeInTheDocument();
    expect(screen.getByText("Sign in to an existing one")).toBeInTheDocument();
    expect(screen.getByText("Use this device only")).toBeInTheDocument();
  });

  it("Set up a new business opens the sign-up form", () => {
    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={vi.fn()} /></AuthProvider></ThemeProvider>);
    fireEvent.click(screen.getByText("Set up a new business"));
    expect(screen.getByRole("heading", { name: "Set up your business" })).toBeInTheDocument();
  });

  it("Sign in to an existing one opens the sign-in form", () => {
    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={vi.fn()} /></AuthProvider></ThemeProvider>);
    fireEvent.click(screen.getByText("Sign in to an existing one"));
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
  });

  it("offers a third door for a worker joining with a code, distinct from the owner's sign-in", () => {
    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={vi.fn()} /></AuthProvider></ThemeProvider>);
    fireEvent.click(screen.getByText("Join a shop as a worker"));
    expect(screen.getByRole("heading", { name: "Join as a worker" })).toBeInTheDocument();
    // A code and a name, never a password -- that is the entire point of
    // this door existing separately from the owner's sign-in above.
    expect(screen.getByLabelText("Code from the owner")).toBeInTheDocument();
    expect(screen.getByLabelText("Your name")).toBeInTheDocument();
    expect(screen.queryByLabelText("Password")).not.toBeInTheDocument();
  });
});

describe("a worker joining with a code", () => {
  it("submits the shop email, the code and their name to account.workerJoin", async () => {
    const { account } = await import("../lib/account");
    const spy = vi
      .spyOn(account, "workerJoin")
      .mockResolvedValue({ ok: true, workerName: "Ade" });
    const onDone = vi.fn();

    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={onDone} /></AuthProvider></ThemeProvider>);
    fireEvent.click(screen.getByText("Join a shop as a worker"));

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByLabelText("Code from the owner"), { target: { value: "123456" } });
    fireEvent.change(screen.getByLabelText("Your name"), { target: { value: "Ade" } });
    fireEvent.click(screen.getByText("Join this shop"));

    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledWith("shop@example.com", "123456", "Ade");
    expect(onDone).toHaveBeenCalled();
    spy.mockRestore();
  });
});

// Three things a shop ran into on a real phone: signing up with an email that
// already had an account said a code was coming and none ever did; there was
// no way to check what you had typed as a password; and the keyboard's Done
// key submitted a form that wasn't filled in yet.
describe("signing up", () => {
  it("says when the email already has an account, and offers to sign in with it", async () => {
    const { account } = await import("../lib/account");
    const spy = vi.spyOn(account, "signUp").mockResolvedValue({
      ok: false, exists: true, message: "This email already has a TechDesk account.",
    });
    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={vi.fn()} /></AuthProvider></ThemeProvider>);
    fireEvent.click(screen.getByText("Set up a new business"));
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "password1" } });
    fireEvent.click(screen.getByText("Create account"));
    await new Promise((r) => setTimeout(r, 0));

    expect(screen.getByText(/already has a TechDesk account/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Sign in with this email instead"));
    expect(screen.getByRole("heading", { name: "Welcome back" })).toBeInTheDocument();
    // The email it just refused is kept, so it needn't be typed twice.
    expect(screen.getByLabelText("Email").value).toBe("shop@example.com");
    spy.mockRestore();
  });

  it("can show the password it is hiding", () => {
    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={vi.fn()} /></AuthProvider></ThemeProvider>);
    fireEvent.click(screen.getByText("Set up a new business"));
    expect(screen.getByLabelText("Password").type).toBe("password");
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(screen.getByLabelText("Password").type).toBe("text");
    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(screen.getByLabelText("Password").type).toBe("password");
  });

  it("will not submit until there is an email and a long enough password", async () => {
    const { account } = await import("../lib/account");
    const spy = vi.spyOn(account, "signUp").mockResolvedValue({ ok: true });
    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={vi.fn()} /></AuthProvider></ThemeProvider>);
    fireEvent.click(screen.getByText("Set up a new business"));
    const button = screen.getByText("Create account");
    expect(button.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "short" } });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "longenough" } });
    expect(button.disabled).toBe(false);
    spy.mockRestore();
  });
});
