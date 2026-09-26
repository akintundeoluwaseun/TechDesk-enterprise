import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ThemeProvider } from "../lib/ThemeContext";
import AccountGateScreen from "./AccountGateScreen";

// "Single business" vs "connected to a larger business" is answered by which
// button a shop taps here, not by a separate question -- Set up your
// business is signUp (a brand new shop, empty), Connect to a business is
// signIn (an existing shop's cloud copy, which useAccountSync then pulls
// down onto this device). The copy has to say that plainly, in the shop's
// own words, not "create an account" / "sign in", which reads as though it's
// asking about a login for the app itself rather than about the shop.
describe("the choice a new device is actually asked", () => {
  it("offers set up vs connect, not a generic sign in / sign up", () => {
    render(<ThemeProvider><AccountGateScreen onDone={vi.fn()} /></ThemeProvider>);
    expect(screen.getByText("Set up your business")).toBeInTheDocument();
    expect(screen.getByText("Connect to a business -- sign in")).toBeInTheDocument();
    expect(screen.getByText("Continue locally, no account")).toBeInTheDocument();
  });

  it("Set up your business opens the sign-up form", () => {
    render(<ThemeProvider><AccountGateScreen onDone={vi.fn()} /></ThemeProvider>);
    fireEvent.click(screen.getByText("Set up your business"));
    expect(screen.getByRole("heading", { name: "Set up your business" })).toBeInTheDocument();
  });

  it("Connect to a business opens the sign-in form", () => {
    render(<ThemeProvider><AccountGateScreen onDone={vi.fn()} /></ThemeProvider>);
    fireEvent.click(screen.getByText("Connect to a business -- sign in"));
    expect(screen.getByRole("heading", { name: "Connect to a business" })).toBeInTheDocument();
  });
});
