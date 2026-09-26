import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeProvider } from "../lib/ThemeContext";
import SignatureField from "./SignatureField";

function renderField(props) {
  return render(
    <ThemeProvider>
      <SignatureField {...props} />
    </ThemeProvider>
  );
}

// jsdom has no real Canvas 2D implementation. Opening the pad (which this
// field does) needs a context object to exist; SignaturePad.test.jsx is
// where the pad's own drawing logic is actually exercised.
beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue({
    scale: vi.fn(), beginPath: vi.fn(), moveTo: vi.fn(), lineTo: vi.fn(), stroke: vi.fn(),
    clearRect: vi.fn(), fillRect: vi.fn(), drawImage: vi.fn(),
  });
  vi.spyOn(HTMLCanvasElement.prototype, "getBoundingClientRect").mockReturnValue({
    left: 0, top: 0, width: 300, height: 160, right: 300, bottom: 160, x: 0, y: 0, toJSON() {},
  });
});

describe("SignatureField", () => {
  it("offers to sign when there is no signature yet", () => {
    renderField({ value: null, onChange: () => {} });
    expect(screen.getByRole("button", { name: /tap to sign/i })).toBeInTheDocument();
  });

  it("shows the signature and a way to change or remove it once there is one", () => {
    renderField({ value: "data:image/png;base64,FAKE", onChange: () => {} });
    expect(screen.getByAltText("Customer signature")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /change/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /remove signature/i })).toBeInTheDocument();
  });

  it("removing clears the value without opening the pad", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    renderField({ value: "data:image/png;base64,FAKE", onChange });
    await user.click(screen.getByRole("button", { name: /remove signature/i }));
    expect(onChange).toHaveBeenCalledWith(null);
    expect(screen.queryByText(/sign here/i)).not.toBeInTheDocument();
  });

  it("opens the signature pad when asked to sign", async () => {
    const user = userEvent.setup();
    renderField({ value: null, onChange: () => {} });
    await user.click(screen.getByRole("button", { name: /tap to sign/i }));
    expect(screen.getByText(/sign here/i)).toBeInTheDocument();
  });
});
