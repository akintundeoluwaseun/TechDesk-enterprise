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
    // Light mode's surfaces used to sit one step apart at most (page,
    // card and inset box were all within a couple of percent of white),
    // which read as everything being the same washed-out white rather than
    // as a page with cards on it. Page and inset now sit a clear step
    // further from white than the card itself, so a card actually pops off
    // the page, and a box recessed into a card (the syncing panel, a
    // dashboard tile) actually reads as recessed rather than just outlined.
    bg: dark ? "bg-neutral-900" : "bg-neutral-100",
    sidebarBg: dark ? "bg-neutral-950 border-r border-neutral-800" : "bg-white border-r border-neutral-200",
    cardBg: dark ? "bg-neutral-800 border border-neutral-700 shadow-sm" : "bg-white border border-neutral-200 shadow-sm",
    insetBg: dark ? "bg-neutral-900 border border-neutral-700" : "bg-neutral-200 border border-neutral-300",
    inputBg: dark
      ? "bg-neutral-800 border border-neutral-600 text-white placeholder:text-neutral-500"
      : "bg-white border border-neutral-300 text-neutral-900 placeholder:text-neutral-400",
    pillBg: dark ? "bg-neutral-700 border border-neutral-600 text-neutral-200" : "bg-neutral-200 border border-neutral-300 text-neutral-700",
    // faint hairline, for rows and section dividers
    divider: dark ? "border-neutral-700" : "border-neutral-200",
    textPrimary: dark ? "text-white" : "text-neutral-900",
    textSecondary: dark ? "text-neutral-300" : "text-neutral-700",
    textMuted: dark ? "text-neutral-400" : "text-neutral-500",
  };
}

