// Getting back in after forgetting the PIN.
//
// There is no email in TechDesk and a shop may have no internet, so recovery
// has to work with nothing but the machine in front of you: questions chosen
// and answered at setup, checked at the login screen.
//
// Answers are hashed, not stored. They are the kind of thing people reuse --
// a mother's name, a first phone -- and a backup file is a plain JSON file
// that gets copied onto flash drives and emailed to whoever is helping.

import { db } from "./db";

export const SUGGESTED_QUESTIONS = [
  "What was the name of your first shop?",
  "What street was your first shop on?",
  "What is your mother's first name?",
  "What was your first phone?",
  "What year did you start this business?",
  "What is the name of your home town?",
  "Who was your first customer?",
  "What is your oldest sibling's first name?",
];

/** How many questions must be set, and answered correctly, to get back in. */
export const REQUIRED_QUESTIONS = 2;

const MAX_ATTEMPTS = 5;
const LOCKOUT_MS = 15 * 60 * 1000;
const ATTEMPTS_KEY = "techdesk_pin_recovery_attempts";

/**
 * Answers compared the way a person would say them, not the way they typed
 * them. "  Lagos " and "lagos" are the same answer; refusing the second one
 * six months later helps nobody.
 */
export function normaliseAnswer(answer) {
  return String(answer || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * SHA-256 where it is available, which is everywhere the app actually runs.
 *
 * crypto.subtle needs a secure context. Electron's file:// pages and the
 * packaged Android WebView both qualify, but a bare http:// dev server does
 * not -- and an app that cannot hash must not silently store the answer in
 * clear, so the fallback is still one-way.
 */
export async function hashAnswer(answer) {
  const normalised = normaliseAnswer(answer);
  if (!normalised) return "";

  const bytes = new TextEncoder().encode(`techdesk-pin-recovery:${normalised}`);
  if (globalThis.crypto?.subtle?.digest) {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // FNV-1a. Far weaker, and only ever reached off a secure context, but it
  // still does not hand the answer back to anyone reading the backup file.
  let h = 0x811c9dc5;
  for (const byte of bytes) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return `fnv1a:${h.toString(16).padStart(8, "0")}`;
}

export function getRecovery() {
  const stored = db.getSettings().pinRecovery;
  return Array.isArray(stored?.questions) ? stored : { questions: [] };
}

export function isConfigured() {
  return getRecovery().questions.length >= REQUIRED_QUESTIONS;
}

/** The questions to put to someone who is locked out, without the answers. */
export function getQuestions() {
  return getRecovery().questions.map(({ id, question }) => ({ id, question }));
}

/**
 * Stores the questions with hashed answers.
 *
 * Takes [{ question, answer }]. A blank question or answer is dropped rather
 * than saved half-set: a question nobody can answer is a locked door.
 */
export async function saveRecovery(entries) {
  const usable = (entries || []).filter((e) => e.question?.trim() && normaliseAnswer(e.answer));
  if (usable.length < REQUIRED_QUESTIONS) {
    throw new Error(`Set ${REQUIRED_QUESTIONS} questions with answers.`);
  }

  const questions = await Promise.all(
    usable.map(async (entry, i) => ({
      id: `q${i + 1}`,
      question: entry.question.trim(),
      hash: await hashAnswer(entry.answer),
    }))
  );

  db.saveSettings({ ...db.getSettings(), pinRecovery: { questions, updatedAt: new Date().toISOString() } });
  clearAttempts();
  return questions.length;
}

export function clearRecovery() {
  const settings = db.getSettings();
  delete settings.pinRecovery;
  db.saveSettings(settings);
}

// ------------------------------------------------------------ lockout --

function readAttempts() {
  try {
    const raw = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || "{}");
    return { count: Number(raw.count) || 0, until: Number(raw.until) || 0 };
  } catch {
    return { count: 0, until: 0 };
  }
}

function writeAttempts(state) {
  try {
    localStorage.setItem(ATTEMPTS_KEY, JSON.stringify(state));
  } catch {
    /* storage full or blocked; the check below just starts over */
  }
}

export function clearAttempts() {
  try {
    localStorage.removeItem(ATTEMPTS_KEY);
  } catch {
    /* nothing to clear */
  }
}

/** Milliseconds left on a lockout, or 0 when recovery may be attempted. */
export function lockedForMs() {
  const { until } = readAttempts();
  return until > Date.now() ? until - Date.now() : 0;
}

/**
 * Checks answers against what was stored.
 *
 * Every question must be right. Guessing is rate-limited because these
 * answers are shorter and more guessable than a PIN, and the prize is the
 * whole till.
 */
export async function verifyAnswers(answers) {
  const waitMs = lockedForMs();
  if (waitMs > 0) return { ok: false, lockedForMs: waitMs, attemptsLeft: 0 };

  const { questions } = getRecovery();
  if (questions.length < REQUIRED_QUESTIONS) {
    return { ok: false, notConfigured: true, attemptsLeft: 0 };
  }

  const hashes = await Promise.all(questions.map((q) => hashAnswer(answers?.[q.id])));
  const allRight = questions.every((q, i) => hashes[i] !== "" && hashes[i] === q.hash);

  if (allRight) {
    clearAttempts();
    return { ok: true, attemptsLeft: MAX_ATTEMPTS };
  }

  const state = readAttempts();
  const count = state.count + 1;
  const until = count >= MAX_ATTEMPTS ? Date.now() + LOCKOUT_MS : 0;
  writeAttempts({ count: until ? 0 : count, until });

  return {
    ok: false,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS - count),
    lockedForMs: until ? LOCKOUT_MS : 0,
  };
}

/** Sets a new admin PIN after the questions have been answered. */
export function resetAdminPin(newPin) {
  if (!/^\d{4,6}$/.test(String(newPin || ""))) {
    throw new Error("The PIN must be 4 to 6 digits.");
  }
  db.saveSettings({ ...db.getSettings(), adminPin: String(newPin) });
  clearAttempts();
}
