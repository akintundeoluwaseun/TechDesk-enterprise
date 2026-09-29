// Light or dark, the owner's choice, remembered on this device. Until they
// choose, Monitor follows the phone or computer's own setting.
import { useEffect, useState } from "react";

const KEY = "techdesk_monitor_theme";
const listeners = new Set();

function stored() {
  try { return localStorage.getItem(KEY); } catch { return null; }
}

export function currentTheme() {
  const s = stored();
  if (s === "light" || s === "dark") return s;
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

export function applyTheme(theme = currentTheme()) {
  const dark = theme === "dark";
  document.documentElement.classList.toggle("dark", dark);
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", dark ? "#171717" : "#e5e5e5");
}

export function setTheme(theme) {
  try { localStorage.setItem(KEY, theme); } catch { /* private mode: still switches for now */ }
  applyTheme(theme);
  listeners.forEach((fn) => fn(theme));
}

export function useTheme() {
  const [theme, set] = useState(currentTheme);
  useEffect(() => {
    listeners.add(set);
    return () => listeners.delete(set);
  }, []);
  return [theme, () => setTheme(theme === "dark" ? "light" : "dark")];
}
