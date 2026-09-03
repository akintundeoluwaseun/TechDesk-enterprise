import React, { createContext, useContext, useState } from "react";
import { db } from "./db";

const SettingsContext = createContext(null);

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(() => db.getSettings());

  function updateSettings(patch) {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      db.saveSettings(next);
      return next;
    });
  }

  return (
    <SettingsContext.Provider value={{ settings, updateSettings }}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) throw new Error("useSettings must be used within SettingsProvider");
  return ctx;
}
