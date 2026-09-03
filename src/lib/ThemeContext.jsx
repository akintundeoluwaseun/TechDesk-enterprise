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

// Shared token map so every page reads colors the same way — iOS-style liquid glass:
// blurred + saturated backdrops with a specular edge highlight (see .liquid-glass
// in index.css) over a colorful, blobbed backdrop for the glass to refract.
export function useThemeTokens() {
  const { dark } = useTheme();
  return {
    dark,
    bg: dark
      ? "bg-[radial-gradient(circle_at_15%_15%,rgba(124,58,237,0.45)_0%,transparent_38%),radial-gradient(circle_at_85%_10%,rgba(37,99,235,0.4)_0%,transparent_42%),radial-gradient(circle_at_35%_95%,rgba(13,148,136,0.35)_0%,transparent_45%),linear-gradient(180deg,#120b28_0%,#000000_100%)]"
      : "bg-[radial-gradient(circle_at_12%_8%,rgba(255,170,214,0.85)_0%,transparent_52%),radial-gradient(circle_at_88%_12%,rgba(157,178,255,0.8)_0%,transparent_55%),radial-gradient(circle_at_25%_95%,rgba(140,235,205,0.75)_0%,transparent_55%),radial-gradient(circle_at_90%_90%,rgba(255,205,150,0.55)_0%,transparent_50%),linear-gradient(180deg,#f3f5fc_0%,#dde6f7_100%)]",
    sidebarBg: dark
      ? "liquid-glass liquid-glass-xl bg-white/5 border-r border-white/10"
      : "liquid-glass liquid-glass-xl bg-white/30 border-r border-white/40",
    cardBg: dark
      ? "liquid-glass liquid-glass-lg bg-white/[0.07] border border-white/10 shadow-[0_8px_32px_rgba(0,0,0,0.35)]"
      : "liquid-glass liquid-glass-lg bg-white/40 border border-white/50 shadow-[0_8px_32px_rgba(31,38,135,0.15)]",
    modalBg: dark
      ? "liquid-glass liquid-glass-xl bg-[#1a1a2e]/75 border border-white/10 shadow-[0_20px_60px_rgba(0,0,0,0.5)]"
      : "liquid-glass liquid-glass-xl bg-white/55 border border-white/60 shadow-[0_20px_60px_rgba(31,38,135,0.25)]",
    inputBg: dark
      ? "liquid-glass liquid-glass-sm bg-white/[0.06] border border-white/10 text-white placeholder:text-slate-500"
      : "liquid-glass liquid-glass-sm bg-white/35 border border-white/50 text-slate-900 placeholder:text-slate-500",
    pillBg: dark
      ? "liquid-glass liquid-glass-sm bg-white/10 text-slate-200"
      : "liquid-glass liquid-glass-sm bg-white/40 text-slate-700",
    textPrimary: dark ? "text-white" : "text-black",
    textSecondary: dark ? "text-slate-300" : "text-slate-800",
    textMuted: dark ? "text-slate-400" : "text-slate-700",
  };
}
