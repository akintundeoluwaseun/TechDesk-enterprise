import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom";
import { ThemeProvider } from "../lib/ThemeContext";
import Field from "./Field";
import { KeyRound } from "lucide-react";

const show = (props) => render(<ThemeProvider><Field {...props} /></ThemeProvider>);

describe("a form field", () => {
  it("is found by its label, not by a placeholder that vanishes when you type", () => {
    show({ id: "f1", label: "Email", icon: KeyRound, placeholder: "you@yourshop.com" });
    expect(screen.getByLabelText("Email")).toBeInTheDocument();
  });

  // The hint used to live inside the <label>, which made it part of the
  // field's name: a screen reader read the whole sentence as the name of the
  // box, and getByLabelText could not find the field at all.
  it("keeps a hint out of the field's name and ties it on as a description", () => {
    show({ id: "f2", label: "Code from your email", hint: "It can take a minute to arrive." });
    const input = screen.getByLabelText("Code from your email");
    expect(input).toBeInTheDocument();
    expect(input.getAttribute("aria-describedby")).toBe("f2-hint");
    expect(document.getElementById("f2-hint")).toHaveTextContent("It can take a minute");
  });

  it("shows and hides what was typed, and says which it will do", () => {
    const onReveal = vi.fn();
    const { rerender } = show({ id: "f3", label: "Password", type: "password", reveal: true, revealed: false, onReveal });
    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(onReveal).toHaveBeenCalled();
    rerender(<ThemeProvider><Field id="f3" label="Password" type="text" reveal revealed onReveal={onReveal} /></ThemeProvider>);
    expect(screen.getByRole("button", { name: "Hide password" })).toBeInTheDocument();
  });

  it("has no reveal button when it is not a secret", () => {
    show({ id: "f4", label: "Your name" });
    expect(screen.queryByRole("button")).toBeNull();
  });
});
