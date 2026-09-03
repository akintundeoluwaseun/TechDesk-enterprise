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
    bg: dark ? "bg-[#0f1115]" : "bg-slate-100",
    // blur radii kept small on purpose: backdrop-filter is one of the more
    // expensive things a browser composites, and with a dozen-plus blurred
    // elements on screen at once (every card/pill/input), a large radius
    // measurably slows down page switches. Smaller radius reads almost
    // identically frosted but costs far less to paint.
    sidebarBg: dark
      ? "bg-white/5 backdrop-blur-lg border-r border-white/10"
      : "bg-white/25 backdrop-blur-lg border-r border-white/40 backdrop-brightness-95",
    cardBg: dark
      ? "bg-white/[0.07] backdrop-blur-md border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
      : "bg-white/30 backdrop-blur-md backdrop-brightness-90 border border-white/50 shadow-[0_8px_32px_rgba(31,38,135,0.15)]",
    inputBg: dark
      ? "bg-white/[0.06] backdrop-blur-sm border border-white/10 text-white placeholder:text-slate-500"
      : "bg-white/30 backdrop-blur-sm backdrop-brightness-90 border border-white/50 text-slate-900 placeholder:text-slate-500",
    pillBg: dark ? "bg-white/10 backdrop-blur-sm text-slate-200" : "bg-white/30 backdrop-blur-sm backdrop-brightness-90 text-slate-700",
    textPrimary: dark ? "text-white" : "text-black",
    textSecondary: dark ? "text-slate-300" : "text-slate-800",
    textMuted: dark ? "text-slate-400" : "text-slate-700",
  };
}
