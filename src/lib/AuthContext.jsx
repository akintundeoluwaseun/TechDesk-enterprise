import React, { createContext, useContext, useState } from "react";
import { db } from "./db";

const AuthContext = createContext(null);

const ADMIN_USER = { id: "admin", name: "Admin", role: "admin" };

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
  // an explicit "switch user" afterwards should still show the picker.
  const [user, setUser] = useState(() => (db.getSettings().requirePin ? null : ADMIN_USER));

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
