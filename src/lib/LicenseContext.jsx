import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import codeHashes from "../data/activationHashes.json";
import { TRIAL_DAYS, dayKey, normalizeState, advance, mergeStates, describe } from "./trial";

const LicenseContext = createContext(null);

const KEY_ASSIGNED_INDEX = "techdesk_license_index";
const KEY_TRIAL = "techdesk_trial";
const KEY_TRIAL_START_LEGACY = "techdesk_trial_start";
const KEY_ACTIVATED = "techdesk_activated";

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

function readLocalTrial() {
  try {
    const raw = localStorage.getItem(KEY_TRIAL);
    if (raw) return normalizeState(JSON.parse(raw));
    // Pre-1.0.3 installs stored only the install timestamp.
    const legacy = localStorage.getItem(KEY_TRIAL_START_LEGACY);
    if (legacy) return normalizeState(legacy);
  } catch {
    /* fall through to a fresh trial */
  }
  return null;
}

function writeLocalTrial(state) {
  try {
    localStorage.setItem(KEY_TRIAL, JSON.stringify(state));
  } catch {
    // Out of quota, or storage blocked. The userData file is the durable
    // copy, so losing this mirror is survivable.
  }
}

export function LicenseProvider({ children }) {
  const [activated, setActivated] = useState(() => localStorage.getItem(KEY_ACTIVATED) === "1");
  const assignedEntry = useMemo(() => getOrAssignEntry(), []);

  // Render immediately from local storage; the userData file is read a tick
  // later and reconciled, so the sidebar never waits on IPC to show a number.
  const [trial, setTrial] = useState(() => advance(normalizeState(readLocalTrial())));
  const trialRef = useRef(trial);
  trialRef.current = trial;

  function commit(next) {
    setTrial(next);
    trialRef.current = next;
    writeLocalTrial(next);
    window.techdesk?.writeTrial?.(next);
  }

  // Reconcile with the durable copy on disk. Whichever record is further
  // along wins, so clearing localStorage cannot buy a second trial and a
  // wiped profile cannot lose one.
  useEffect(() => {
    let cancelled = false;
    Promise.resolve(window.techdesk?.readTrial?.())
      .then((res) => {
        if (cancelled) return;
        const fromDisk = res?.ok && res.state ? normalizeState(res.state) : null;
        const merged = advance(mergeStates(trialRef.current, fromDisk));
        commit(merged);
      })
      .catch(() => {
        // No Electron bridge (browser/dev). localStorage stands alone.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Roll the day over while the app stays open -- a shop leaves this running
  // for weeks, so the count has to move at midnight without a restart.
  useEffect(() => {
    const t = setInterval(() => {
      const next = advance(trialRef.current, dayKey());
      if (next !== trialRef.current) commit(next);
    }, 60000);
    return () => clearInterval(t);
  }, []);

  const { daysLeft, expired } = describe(trial);
  const restricted = !activated && expired;

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
        trialDays: TRIAL_DAYS,
        daysUsed: trial.daysUsed,
        daysLeft,
        trialExpired: expired,
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
