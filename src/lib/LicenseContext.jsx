import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import codeHashes from "../data/activationHashes.json";

const LicenseContext = createContext(null);

const KEY_ASSIGNED_INDEX = "techdesk_license_index";
const KEY_TRIAL_START = "techdesk_trial_start";
const KEY_ACTIVATED = "techdesk_activated";

const TRIAL_DAYS = 7;

async function sha256Hex(text) {
  const data = new TextEncoder().encode(text);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function getOrAssignEntry() {
  let index = localStorage.getItem(KEY_ASSIGNED_INDEX);
  if (index === null) {
    index = Math.floor(Math.random() * codeHashes.length);
    localStorage.setItem(KEY_ASSIGNED_INDEX, String(index));
  }
  return codeHashes[Number(index)];
}

function getOrStartTrial() {
  let start = localStorage.getItem(KEY_TRIAL_START);
  if (!start) {
    start = new Date().toISOString();
    localStorage.setItem(KEY_TRIAL_START, start);
  }
  return start;
}

export function LicenseProvider({ children }) {
  const [activated, setActivated] = useState(() => localStorage.getItem(KEY_ACTIVATED) === "1");
  const assignedEntry = useMemo(() => getOrAssignEntry(), []);
  const trialStart = useMemo(() => getOrStartTrial(), []);
  const [now, setNow] = useState(Date.now());

  // keep trial countdown live without needing a reload
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 60000);
    return () => clearInterval(t);
  }, []);

  const daysElapsed = (now - new Date(trialStart).getTime()) / (1000 * 60 * 60 * 24);
  const daysLeft = Math.max(0, Math.ceil(TRIAL_DAYS - daysElapsed));
  const trialExpired = daysElapsed >= TRIAL_DAYS;
  const restricted = !activated && trialExpired;

  async function verifyCode(input) {
    const clean = (input || "").trim().toUpperCase();
    const candidateHash = await sha256Hex(`${assignedEntry.pin}:${clean}`);
    if (candidateHash === assignedEntry.hash) {
      localStorage.setItem(KEY_ACTIVATED, "1");
      setActivated(true);
      return true;
    }
    return false;
  }

  return (
    <LicenseContext.Provider
      value={{
        activated,
        pin: assignedEntry.pin,
        daysLeft,
        trialExpired,
        restricted,
        verifyCode,
      }}
    >
      {children}
    </LicenseContext.Provider>
  );
}

export function useLicense() {
  const ctx = useContext(LicenseContext);
  if (!ctx) throw new Error("useLicense must be used within LicenseProvider");
  return ctx;
}
