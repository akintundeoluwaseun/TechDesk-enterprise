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

// Shared token map so every page reads colors the same way — soft-UI /
// neumorphism: flat surfaces, no borders, no blur, depth comes entirely from
// paired light/dark box-shadows. Raised (cardBg/pillBg) = shadow falls away
// from the surface, like it's popping up. Inset (inputBg/insetBg) = shadow
// falls into the surface, like it's pressed in. Same trick, why the shadow
// pairs mirror each other with "inset" swapped in.
export function useThemeTokens() {
  const { dark } = useTheme();
  return {
    dark,
    // Phones get a flat treatment -- hairline borders on solid cards -- and
    // the neumorphic shadows only switch on from `md`. Soft 16px shadow pairs
    // read as smudges on a 390px screen and cost a lot of vertical space for
    // depth nobody can see; the desktop keeps them because there they work.
    bg: dark ? "bg-[#181b22] md:bg-[#1e222a]" : "bg-[#f4f5f7] md:bg-[#e9ecf1]",
    sidebarBg: dark
      ? "bg-[#1f232b] md:bg-[#1a1d24] md:shadow-[inset_-8px_0_12px_-8px_rgba(0,0,0,0.5)]"
      : "bg-white md:bg-[#e3e7ed] md:shadow-[inset_-8px_0_12px_-8px_rgba(163,177,198,0.4)]",
    cardBg: dark
      ? "bg-[#252932] border border-white/10 md:border-0 md:bg-[#1e222a] md:shadow-[8px_8px_16px_#14171d,-8px_-8px_16px_#282d37]"
      : "bg-white border border-black/[0.07] md:border-0 md:bg-[#e9ecf1] md:shadow-[8px_8px_16px_#c8cdd4,-8px_-8px_16px_#ffffff]",
    insetBg: dark
      ? "bg-[#1e222a] border border-white/10 md:border-0 md:bg-[#1e222a] md:shadow-[inset_4px_4px_8px_#14171d,inset_-4px_-4px_8px_#282d37]"
      : "bg-[#f4f5f7] border border-black/[0.06] md:border-0 md:bg-[#e9ecf1] md:shadow-[inset_4px_4px_8px_#c8cdd4,inset_-4px_-4px_8px_#ffffff]",
    inputBg: dark
      ? "bg-[#121418] border border-white/10 text-white placeholder:text-slate-500 md:border-0 md:bg-[#1e222a] md:shadow-[inset_3px_3px_6px_#14171d,inset_-3px_-3px_6px_#282d37]"
      : "bg-white border border-black/[0.08] text-slate-800 placeholder:text-slate-400 md:border-0 md:bg-[#e9ecf1] md:shadow-[inset_3px_3px_6px_#c8cdd4,inset_-3px_-3px_6px_#ffffff]",
    pillBg: dark
      ? "bg-[#121418] border border-white/10 text-slate-300 md:border-0 md:bg-[#1e222a] md:shadow-[4px_4px_8px_#14171d,-4px_-4px_8px_#282d37]"
      : "bg-white border border-black/[0.07] text-slate-700 md:border-0 md:bg-[#e9ecf1] md:shadow-[4px_4px_8px_#c8cdd4,-4px_-4px_8px_#ffffff]",
    divider: dark ? "border-white/10" : "border-black/10",
    textPrimary: dark ? "text-white" : "text-slate-900 md:text-slate-800",
    textSecondary: dark ? "text-slate-300" : "text-slate-600",
    textMuted: dark ? "text-slate-400" : "text-slate-500",
  };
}

