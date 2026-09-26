import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth, canAccess } from "./AuthContext";

vi.mock("./account", () => ({
  account: { status: vi.fn() },
}));

function Probe() {
  const { user, isAdmin } = useAuth();
  return (
    <div>
      <span data-testid="name">{user?.name ?? "none"}</span>
      <span data-testid="role">{user?.role ?? "none"}</span>
      <span data-testid="isAdmin">{String(isAdmin)}</span>
    </div>
  );
}

describe("a worker's device signs itself in", () => {
  it("lands as 'both' -- sales, repairs, inventory, never the dashboard -- once account.status() says it's a worker", async () => {
    const { account } = await import("./account");
    account.status.mockResolvedValue({ signedIn: true, role: "worker", workerName: "Ade" });

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("both"));
    expect(screen.getByTestId("name").textContent).toBe("Ade");
    expect(screen.getByTestId("isAdmin").textContent).toBe("false");
    // The exact restriction the shop asked for: sales, inventory, repairs,
    // and nothing else -- no dashboard, no settings, no customer list.
    expect(canAccess("both", "/sales")).toBe(true);
    expect(canAccess("both", "/repairs")).toBe(true);
    expect(canAccess("both", "/inventory")).toBe(true);
    expect(canAccess("both", "/")).toBe(false);
    expect(canAccess("both", "/settings")).toBe(false);
    expect(canAccess("both", "/customers")).toBe(false);
  });

  it("never overrides a normal admin/local session when there is no worker account signed in", async () => {
    const { account } = await import("./account");
    account.status.mockResolvedValue({ signedIn: false });

    render(<AuthProvider><Probe /></AuthProvider>);

    // Give the status check a tick to resolve, then confirm it changed nothing.
    await waitFor(() => expect(account.status).toHaveBeenCalled());
    expect(screen.getByTestId("role").textContent).toBe("admin");
  });
});
