import React, { useState } from "react";
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MoneyInput from "./MoneyInput";

function Controlled({ initial = "" }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <MoneyInput value={value} onChange={setValue} aria-label="amount" />
      <div data-testid="raw">{value}</div>
    </>
  );
}

describe("MoneyInput", () => {
  it("accepts a comma typed mid-amount instead of dropping the digits after it", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText("amount");
    // A shop's own habit: typing the thousands comma themselves. A plain
    // <input type="number"> refuses this keystroke outright.
    await user.type(input, "150,000");
    expect(screen.getByTestId("raw").textContent).toBe("150000");
  });

  it("shows the thousands commas live as digits are typed, with no comma typed at all", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText("amount");
    await user.type(input, "1500000");
    expect(input.value).toBe("1,500,000");
    expect(screen.getByTestId("raw").textContent).toBe("1500000");
  });

  it("keeps the cursor after the digit just typed, not thrown to the end", async () => {
    const user = userEvent.setup();
    render(<Controlled initial="150000" />);
    const input = screen.getByLabelText("amount");
    // Click right after the "150" in the displayed "150,000", then type a
    // digit there. The naive fix re-renders the formatted value and leaves
    // the cursor at the end, so the next character typed would land after
    // "150,0009" instead of in the middle.
    input.setSelectionRange(3, 3);
    input.focus();
    await user.keyboard("9");
    expect(screen.getByTestId("raw").textContent).toBe("1509000");
    expect(input.value).toBe("1,509,000");
    // The caret should sit right after the "9" that was just typed --
    // between it and the following ",000".
    expect(input.selectionStart).toBe(5);
  });

  it("allows a decimal point and keeps it while formatting", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText("amount");
    await user.type(input, "1500.5");
    expect(screen.getByTestId("raw").textContent).toBe("1500.5");
    expect(input.value).toBe("1,500.5");
  });

  it("drops any other stray character rather than rejecting the keystroke silently", async () => {
    const user = userEvent.setup();
    render(<Controlled />);
    const input = screen.getByLabelText("amount");
    await user.type(input, "15a0,,b000");
    expect(screen.getByTestId("raw").textContent).toBe("150000");
  });

  it("renders an empty value as an empty field, not NaN or a stray comma", () => {
    render(<Controlled initial="" />);
    expect(screen.getByLabelText("amount").value).toBe("");
  });
});
