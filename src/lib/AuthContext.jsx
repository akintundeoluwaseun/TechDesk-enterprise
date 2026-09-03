import React, { createContext, useContext } from "react";

const AuthContext = createContext(null);
const ADMIN_USER = { id: "local-admin", name: "Administrator", role: "admin" };

export const ROLE_ROUTES = {
  admin: ["/", "/sales", "/repairs", "/inventory", "/customers", "/reports", "/activity", "/settings"],
};

export function canAccess() {
  return true;
}

export function homeFor() {
  return "/";
}

export function AuthProvider({ children }) {
  const value = {
    user: ADMIN_USER,
    isAdmin: true,
    signIn: () => ADMIN_USER,
    signOut: () => undefined,
  };
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
