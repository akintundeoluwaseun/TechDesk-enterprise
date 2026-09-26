import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../lib/ThemeContext";
import SignaturePad from "./SignaturePad";

function renderPad(props) {
  return render(
    <ThemeProvider>
      <SignaturePad {...props} />
    </ThemeProvider>
  );
}

// jsdom draws nothing -- there is no real Canvas 2D implementation -- so the
// context this pad asks for is stubbed with the handful of calls it makes.
// What is under test is the POINTER logic (when a stroke counts as
// "something was drawn", where a mouse's clientX/Y land on the canvas, the
// flatten-to-white step before saving), not pixels no test runner can see.
function stubCanvas() {
  const ctx = {
    scale: vi.fn(),
    beginPath: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    stroke: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    drawImage: vi.fn(),
  };
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(ctx);
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, width: 300, height: 160, right: 300, bottom: 160, x: 0, y: 0, toJSON() {},
  });
  vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue("data:image/png;base64,FAKE");
  return ctx;
}

async function draw(canvas) {
  fireEvent.pointerDown(canvas, { clientX: 10, clientY: 10, pointerId: 1 });
  fireEvent.pointerMove(canvas, { clientX: 40, clientY: 30, pointerId: 1 });
  fireEvent.pointerUp(canvas, { clientX: 40, clientY: 30, pointerId: 1 });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("SignaturePad", () => {
  it("starts with Save disabled -- a blank signature is not consent", () => {
    stubCanvas();
    renderPad({ onSave: () => {}, onCancel: () => {} });
    expect(screen.getByRole("button", { name: /save signature/i })).toBeDisabled();
  });

  it("enables Save once a stroke has actually been drawn", async () => {
    stubCanvas();
    renderPad({ onSave: () => {}, onCancel: () => {} });
    await draw(screen.getByRole("img", { name: /signature area/i }));
    expect(screen.getByRole("button", { name: /save signature/i })).not.toBeDisabled();
  });

  it("clearing puts Save back to disabled", async () => {
    stubCanvas();
    const user = userEvent.setup();
    renderPad({ onSave: () => {}, onCancel: () => {} });
    await draw(screen.getByRole("img", { name: /signature area/i }));
    await user.click(screen.getByRole("button", { name: /clear/i }));
    expect(screen.getByRole("button", { name: /save signature/i })).toBeDisabled();
  });

  it("saves a flattened PNG data URI, not the pad's own transparent canvas", async () => {
    const ctx = stubCanvas();
    const onSave = vi.fn();
    const user = userEvent.setup();
    renderPad({ onSave, onCancel: () => {} });
    await draw(screen.getByRole("img", { name: /signature area/i }));
    await user.click(screen.getByRole("button", { name: /save signature/i }));

    expect(ctx.fillRect).toHaveBeenCalled(); // flattened onto white first
    expect(ctx.drawImage).toHaveBeenCalled(); // ...then the strokes on top
    expect(onSave).toHaveBeenCalledWith("data:image/png;base64,FAKE");
  });

  it("calls onCancel without saving anything", async () => {
    stubCanvas();
    const onSave = vi.fn();
    const onCancel = vi.fn();
    const user = userEvent.setup();
    renderPad({ onSave, onCancel });
    await user.click(screen.getByRole("button", { name: /cancel/i }));
    expect(onCancel).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("a mouse drag draws exactly like a touch would -- one pointer path, no separate handling", async () => {
    const ctx = stubCanvas();
    renderPad({ onSave: () => {}, onCancel: () => {} });
    const canvas = screen.getByRole("img", { name: /signature area/i });
    fireEvent.pointerDown(canvas, { clientX: 5, clientY: 5, pointerId: 1, pointerType: "mouse" });
    fireEvent.pointerMove(canvas, { clientX: 20, clientY: 20, pointerId: 1, pointerType: "mouse" });
    expect(ctx.lineTo).toHaveBeenCalledWith(20, 20);
    expect(screen.getByRole("button", { name: /save signature/i })).not.toBeDisabled();
  });
});
