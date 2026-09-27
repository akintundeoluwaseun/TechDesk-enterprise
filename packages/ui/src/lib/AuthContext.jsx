import React, { createContext, useContext, useState, useEffect } from "react";
import { db } from "./db";
import { account, getCachedAccountStatus } from "./account";

const AuthContext = createContext(null);

const ADMIN_USER = { id: "admin", name: "Admin", role: "admin" };

/** A cloud-invited worker's device, from whatever the last CONFIRMED
 * status() call said -- never a guess, and never admin's own view even
 * for the one render before this launch's own status() check comes back. */
function workerFromCache() {
  const cached = getCachedAccountStatus();
  if (cached?.signedIn && cached?.role === "worker") {
    return { id: "worker", name: cached.workerName || "Worker", role: "both" };
  }
  return null;
}

// which routes each role may see
export const ROLE_ROUTES = {
  admin: ["/", "/sales", "/repairs", "/inventory", "/customers", "/reports", "/activity", "/settings"],
  seller: ["/sales", "/inventory"],
  repairer: ["/repairs", "/inventory"],
  both: ["/sales", "/repairs", "/inventory"],
};

export function canAccess(role, path) {
  const allowed = ROLE_ROUTES[role] || [];
  return allowed.includes(path);
}

export function homeFor(role) {
  if (role === "admin") return "/";
  if (role === "seller") return "/sales";
  if (role === "repairer") return "/repairs";
  return "/sales";
}

export function AuthProvider({ children }) {
  // if PIN sign-in isn't required, auto-sign-in as Admin on first load only —
  // an explicit "switch user" afterwards should still show the picker. Except
  // on a device this app itself already confirmed, in an earlier session, is
  // a cloud-invited worker's -- that one starts as the worker straight away,
  // from the cache below, rather than flashing admin for a render or two
  // while this launch's own status() check is still in flight.
  const [user, setUser] = useState(() => {
    if (db.getSettings().requirePin) return null;
    return workerFromCache() || ADMIN_USER;
  });

  // A worker's device already proved itself, once, by redeeming an invite
  // code -- it does not also need a local PIN on top of that, and it must
  // never land on the PIN picker as if it were a fresh, unclaimed device.
  // "both" is the exact same role a locally-added seller+repairer staff
  // account gets: sales, repairs and inventory, no dashboard, no settings,
  // and (InventoryPage's own isAdmin check) no total stock value.
  //
  // Still run every time, even when the cache above already set "both": the
  // cache is this device's OWN last answer, not a live one, and only this
  // check catches an owner revoking a worker (or the desktop build's own
  // main-process session, which the cache above can never see -- it is
  // populated by status() resolving, and the very first call on that
  // platform is exactly the one still in flight).
  useEffect(() => {
    let cancelled = false;
    account.status().then((s) => {
      if (cancelled) return;
      if (s?.signedIn && s?.role === "worker") {
        setUser({ id: "worker", name: s.workerName || "Worker", role: "both" });
      } else if (!db.getSettings().requirePin) {
        // The cache said worker and the real answer disagrees -- back to
        // admin, the same as any other device that was never a worker's.
        setUser((current) => (current?.id === "worker" ? ADMIN_USER : current));
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  function getAdminPin() {
    return db.getSettings().adminPin || "0000";
  }

  function signIn(pin) {
    if (pin === getAdminPin()) {
      setUser(ADMIN_USER);
      return ADMIN_USER;
    }
    const match = db.getUsers().find((u) => u.pin === pin);
    if (match) {
      setUser(match);
      return match;
    }
    return null;
  }

  function signOut() {
    // switching user always goes through the picker, regardless of the requirePin setting
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, signIn, signOut, isAdmin: user?.role === "admin" }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
