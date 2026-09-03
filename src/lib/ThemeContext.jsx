import React, { createContext, useContext, useEffect, useState } from "react";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [dark, setDark] = useState(() => {
    const saved = localStorage.getItem("techdesk_theme");
    return saved ? saved === "dark" : false;
  });

  useEffect(() => {
    localStorage.setItem("techdesk_theme", dark ? "dark" : "light");
    document.documentElement.classList.toggle("dark", dark);
  }, [dark]);

  return (
    <ThemeContext.Provider value={{ dark, toggleDark: () => setDark((d) => !d) }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}

// Shared token map so every page reads colors the same way — iOS-style liquid glass.
export function useThemeTokens() {
  const { dark } = useTheme();
  return {
    dark,
    bg: dark
      ? "bg-[radial-gradient(circle_at_20%_20%,#2b1055_0%,#0d0d1f_45%,#000000_100%)]"
      : "bg-[radial-gradient(circle_at_20%_20%,#b9cdEd_0%,#d9c6ec_45%,#c3d6ec_100%)]",
    sidebarBg: dark
      ? "bg-white/5 backdrop-blur-2xl border-r border-white/10"
      : "bg-white/25 backdrop-blur-2xl border-r border-white/40 backdrop-brightness-95",
    cardBg: dark
      ? "bg-white/[0.07] backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
      : "bg-white/30 backdrop-blur-xl backdrop-brightness-90 border border-white/50 shadow-[0_8px_32px_rgba(31,38,135,0.15)]",
    inputBg: dark
      ? "bg-white/[0.06] backdrop-blur-md border border-white/10 text-white placeholder:text-slate-500"
      : "bg-white/30 backdrop-blur-md backdrop-brightness-90 border border-white/50 text-slate-900 placeholder:text-slate-500",
    pillBg: dark ? "bg-white/10 backdrop-blur-md text-slate-200" : "bg-white/30 backdrop-blur-md backdrop-brightness-90 text-slate-700",
    textPrimary: dark ? "text-white" : "text-black",
    textSecondary: dark ? "text-slate-300" : "text-slate-800",
    textMuted: dark ? "text-slate-400" : "text-slate-700",
  };
}
