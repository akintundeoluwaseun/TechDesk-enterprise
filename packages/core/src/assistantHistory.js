// What the assistant has done, one short line each: "Sale made · Chidi",
// "Stock added · iPhone 11 battery", "Checked: who owes". No details and no
// way back into the cards -- the records themselves are on their pages.
// Kept on this device, newest first, the last 100.
import { storage } from "./storage";

const KEY = "techdesk_assistant_history";
const MAX = 100;

export function assistantHistory() {
  try {
    const v = JSON.parse(storage.getItem(KEY) || "[]");
    return Array.isArray(v) ? v : [];
  } catch {
    return [];
  }
}

export function addHistory(text, kind = "done", at = new Date()) {
  if (!text) return;
  const list = [{ at: at.toISOString(), text: String(text).slice(0, 120), kind }, ...assistantHistory()].slice(0, MAX);
  storage.setItem(KEY, JSON.stringify(list));
}

export function clearHistory() {
  storage.setItem(KEY, "[]");
}
