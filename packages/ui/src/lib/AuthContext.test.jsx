import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AuthProvider, useAuth, canAccess } from "./AuthContext";

vi.mock("./account", () => ({
  account: { status: vi.fn() },
  getCachedAccountStatus: vi.fn(),
}));

beforeEach(async () => {
  const { getCachedAccountStatus } = await import("./account");
  // No prior cache by default -- the existing tests below start a device
  // that has never confirmed a worker status before.
  getCachedAccountStatus.mockReset().mockReturnValue(null);
});

function Probe() {
  const { user, isAdmin } = useAuth();
  return (
    <div>
      <span data-testid="name">{user?.name ?? "none"}</span>
      <span data-testid="role">{user?.role ?? "none"}</span>
      <span data-testid="pages">{(user?.pages || []).join(",")}</span>
      <span data-testid="isAdmin">{String(isAdmin)}</span>
    </div>
  );
}

describe("a worker's device signs itself in", () => {
  it("lands as 'worker', sales/repairs/inventory by default, never the dashboard -- once account.status() says it's a worker", async () => {
    const { account } = await import("./account");
    account.status.mockResolvedValue({ signedIn: true, role: "worker", workerName: "Ade" });

    render(<AuthProvider><Probe /></AuthProvider>);

    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("worker"));
    expect(screen.getByTestId("name").textContent).toBe("Ade");
    expect(screen.getByTestId("isAdmin").textContent).toBe("false");
    // No pages came back from the server (an invite that predates per-worker
    // pages) -- the old fixed behavior, all three, is what this device gets.
    expect(screen.getByTestId("pages").textContent).toBe("sales,repairs,inventory");
  });

  it("only opens the pages the admin actually granted this worker", async () => {
    const { account } = await import("./account");
    account.status.mockResolvedValue({ signedIn: true, role: "worker", workerName: "Ade", pages: ["sales"] });

    render(<AuthProvider><Probe /></AuthProvider>);
    await waitFor(() => expect(screen.getByTestId("pages").textContent).toBe("sales"));

    const worker = { id: "worker", role: "worker", pages: ["sales"] };
    expect(canAccess(worker, "/sales")).toBe(true);
    expect(canAccess(worker, "/repairs")).toBe(false);
    expect(canAccess(worker, "/inventory")).toBe(false);
    expect(canAccess(worker, "/")).toBe(false);
    expect(canAccess(worker, "/settings")).toBe(false);
    expect(canAccess(worker, "/customers")).toBe(false);
  });

  it("a worker granted every page gets exactly what the old fixed role gave everyone", async () => {
    const worker = { id: "worker", role: "worker", pages: ["sales", "repairs", "inventory"] };
    expect(canAccess(worker, "/sales")).toBe(true);
    expect(canAccess(worker, "/repairs")).toBe(true);
    expect(canAccess(worker, "/inventory")).toBe(true);
    expect(canAccess(worker, "/")).toBe(false);
    expect(canAccess(worker, "/settings")).toBe(false);
    expect(canAccess(worker, "/customers")).toBe(false);
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

describe("a returning worker's device, before this launch's own check comes back", () => {
  // The bug this guards: a worker's role only ever arrived once
  // account.status() resolved, which is a real round trip on the desktop
  // build (the token lives in the main process). Every single app open, a
  // worker's own device rendered as admin -- dashboard, settings, cost
  // prices and all -- for however long that took. The cache is this
  // device's own last CONFIRMED answer, so it does not have to wait to know
  // what it already knows.

  it("renders as 'worker', with its cached pages, on the very first paint, from the cache, with no wait", async () => {
    const { account, getCachedAccountStatus } = await import("./account");
    getCachedAccountStatus.mockReturnValue({ signedIn: true, role: "worker", workerName: "Ade", pages: ["repairs"] });
    // Deliberately never resolved -- if the first render depended on this,
    // the test would hang or still show admin.
    account.status.mockReturnValue(new Promise(() => {}));

    render(<AuthProvider><Probe /></AuthProvider>);

    expect(screen.getByTestId("role").textContent).toBe("worker");
    expect(screen.getByTestId("pages").textContent).toBe("repairs");
    expect(screen.getByTestId("isAdmin").textContent).toBe("false");
  });

  it("falls back to admin once a stale cached worker status is contradicted by the real one", async () => {
    const { account, getCachedAccountStatus } = await import("./account");
    getCachedAccountStatus.mockReturnValue({ signedIn: true, role: "worker", workerName: "Ade" });
    // The owner revoked this worker since the cache was last written.
    account.status.mockResolvedValue({ signedIn: false });

    render(<AuthProvider><Probe /></AuthProvider>);
    expect(screen.getByTestId("role").textContent).toBe("worker");

    await waitFor(() => expect(screen.getByTestId("role").textContent).toBe("admin"));
  });
});
