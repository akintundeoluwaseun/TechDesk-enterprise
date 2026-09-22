import React from "react";
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { ThemeProvider } from "../../lib/ThemeContext";
import SyncTab from "./SyncTab";

// A device can only see the links it made. Everything else arrives through
// them -- so a shop linked to one bench can be reading a third shop's stock
// with nothing on screen to say where it came from.
//
// This pins the half that is easy to lose: the people who reach you are a
// longer list than the people you linked to, and the screen has to say which
// is which.

const STATE = {
  ok: true,
  registered: true,
  phone: "+2348011111111",
  label: "My bench",
  maySync: true,
  links: [
    {
      id: "11111111-1111-1111-1111-111111111111",
      phone: "+2348022222222",
      label: "B's bench",
      iSend: ["product"],
      theySend: ["product", "repair"],
      deviceId: "dev-b",
    },
  ],
  reaching: [
    { id: "dev-b", label: "B's bench", kinds: ["product", "repair"], direct: true },
    { id: "dev-c", label: "C's bench", kinds: ["product"], direct: false },
    { id: "dev-d", label: "D's bench", kinds: ["product"], direct: false },
  ],
  reachable: ["dev-b", "dev-c", "dev-d"],
  kinds: ["product", "repair", "customer"],
};

function syncTab() {
  return render(
    <MemoryRouter>
      <ThemeProvider>
        <SyncTab />
      </ThemeProvider>
    </MemoryRouter>,
  );
}

describe("the chain is visible from inside it", () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem("techdesk_web_hq", JSON.stringify({ token: "devtok-1" }));
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => STATE }),
    );
  });
  afterEach(() => vi.restoreAllMocks());

  it("names everybody whose records reach this device, not only the links", async () => {
    syncTab();
    // B is a link. C and D are not -- they arrive through B, and the old
    // screen would have shown no trace of them.
    await waitFor(() => expect(screen.getByText("C's bench")).toBeInTheDocument());
    expect(screen.getByText("D's bench")).toBeInTheDocument();
  });

  it("says which are yours to cut and which come down the chain", async () => {
    syncTab();
    await waitFor(() => expect(screen.getAllByText("Down the chain")).toHaveLength(2));
    expect(screen.getAllByText("Your link")).toHaveLength(1);
    expect(screen.getByText(/2 of these reach you through somebody/i)).toBeInTheDocument();
  });
});
