// Finding and importing data left behind by another TechDesk edition on the
// same device. The heavy lifting (scanning folders, reading files) happens in
// the Electron main process; this is just the renderer-side wrapper.
import { db } from "./db";

// Set once the owner has answered the first-run prompt, so we never nag again.
export const MERGE_DECISION_KEY = "techdesk_data_merge_decision";

export function getMergeDecision() {
  return localStorage.getItem(MERGE_DECISION_KEY);
}

export function setMergeDecision(decision) {
  localStorage.setItem(MERGE_DECISION_KEY, decision);
}

// True when this install already has real records of its own. A fresh install
// has none, which is when offering to bring data across makes the most sense.
export function hasLocalRecords() {
  return (
    db.getSales().length > 0 ||
    db.getRepairs().length > 0 ||
    db.getInventory().length > 0 ||
    db.getCustomers().length > 0
  );
}

export async function findOtherEditions() {
  if (!window.techdesk?.findOtherEditions) return [];
  const result = await window.techdesk.findOtherEditions();
  return result?.ok ? result.editions : [];
}

export async function mergeFromEdition(file) {
  if (!window.techdesk?.readEditionBackup) {
    throw new Error("Not available outside the desktop app.");
  }
  const result = await window.techdesk.readEditionBackup(file);
  if (!result?.ok) throw new Error(result?.error || "Couldn't read that backup.");
  return db.mergeBackup(result.json);
}
