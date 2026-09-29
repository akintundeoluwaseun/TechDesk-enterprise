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
    expect(screen.getByText("Set up your business")).toBeInTheDocument();
    expect(screen.getByText("Sign in to your business")).toBeInTheDocument();
    expect(screen.getByText("Continue locally, no account")).toBeInTheDocument();
  });

  it("Set up your business opens the sign-up form", () => {
    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={vi.fn()} /></AuthProvider></ThemeProvider>);
    fireEvent.click(screen.getByText("Set up your business"));
    expect(screen.getByRole("heading", { name: "Set up your business" })).toBeInTheDocument();
  });

  it("Sign in to your business opens the sign-in form", () => {
    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={vi.fn()} /></AuthProvider></ThemeProvider>);
    fireEvent.click(screen.getByText("Sign in to your business"));
    expect(screen.getByRole("heading", { name: "Sign in to your business" })).toBeInTheDocument();
  });

  it("offers a third door for a worker joining with a code, distinct from the owner's sign-in", () => {
    render(<ThemeProvider><AuthProvider><AccountGateScreen onDone={vi.fn()} /></AuthProvider></ThemeProvider>);
    fireEvent.click(screen.getByText("Joining as a worker, with a code"));
    expect(screen.getByRole("heading", { name: "Joining as a worker" })).toBeInTheDocument();
    // A code and a name, never a password -- that is the entire point of
    // this door existing separately from "Sign in to your business" above.
    expect(screen.getByPlaceholderText("6-digit code")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Your name")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Password")).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByText("Joining as a worker, with a code"));

    fireEvent.change(screen.getByPlaceholderText("Email"), { target: { value: "shop@example.com" } });
    fireEvent.change(screen.getByPlaceholderText("6-digit code"), { target: { value: "123456" } });
    fireEvent.change(screen.getByPlaceholderText("Your name"), { target: { value: "Ade" } });
    fireEvent.click(screen.getByText("Join"));

    await new Promise((r) => setTimeout(r, 0));
    expect(spy).toHaveBeenCalledWith("shop@example.com", "123456", "Ade");
    expect(onDone).toHaveBeenCalled();
    spy.mockRestore();
  });
});
