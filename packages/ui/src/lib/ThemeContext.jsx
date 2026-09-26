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

// Shared token map so every page reads colors the same way -- a plain,
// solid look. Every surface is one flat color and a hairline border; nothing
// here is translucent, blurred or gradient, and none of it depends on a
// paired box-shadow to read as raised or pressed in. That was deliberately
// traded away: a shop reading a customer's balance across the counter is
// served better by a page that reads instantly than by one that reads as
// polished -- and a shadow pair that works on a desktop card reads as a smudge
// at phone width, which is the same tradeoff a flat surface never has to make.
export function useThemeTokens() {
  const { dark } = useTheme();
  return {
    dark,
    bg: dark ? "bg-slate-900" : "bg-slate-50",
    sidebarBg: dark ? "bg-slate-950 border-r border-slate-800" : "bg-white border-r border-slate-200",
    cardBg: dark ? "bg-slate-800 border border-slate-700 shadow-sm" : "bg-white border border-slate-200 shadow-sm",
    insetBg: dark ? "bg-slate-900 border border-slate-700" : "bg-slate-50 border border-slate-200",
    inputBg: dark
      ? "bg-slate-800 border border-slate-600 text-white placeholder:text-slate-500"
      : "bg-white border border-slate-300 text-slate-900 placeholder:text-slate-400",
    pillBg: dark ? "bg-slate-700 border border-slate-600 text-slate-200" : "bg-slate-100 border border-slate-200 text-slate-700",
    // faint hairline, for rows and section dividers
    divider: dark ? "border-slate-700" : "border-slate-200",
    textPrimary: dark ? "text-white" : "text-slate-900",
    textSecondary: dark ? "text-slate-300" : "text-slate-700",
    textMuted: dark ? "text-slate-400" : "text-slate-500",
  };
}

