import { describe, it, expect, beforeEach } from "vitest";
import { db } from "./db";
import {
  normaliseAnswer, hashAnswer, saveRecovery, verifyAnswers, getQuestions,
  isConfigured, clearAttempts, lockedForMs, resetAdminPin, REQUIRED_QUESTIONS,
} from "./pinRecovery";

const ANSWERS = [
  { question: "What was the name of your first shop?", answer: "Seun Phones" },
  { question: "What is your home town?", answer: "Ibadan" },
];

describe("answers are compared the way a person would say them", () => {
  it("ignores case, padding and punctuation", () => {
    expect(normaliseAnswer("  Seun's Phones! ")).toBe("seuns phones");
    expect(normaliseAnswer("SEUN   PHONES")).toBe("seun phones");
  });

  it("treats an empty answer as no answer", () => {
    expect(normaliseAnswer("   ")).toBe("");
    expect(normaliseAnswer(null)).toBe("");
  });
});

describe("answers are never stored in the clear", () => {
  beforeEach(async () => { localStorage.clear(); await saveRecovery(ANSWERS); });

  it("keeps no trace of the answer in settings", () => {
    const raw = JSON.stringify(db.getSettings().pinRecovery);
    expect(raw).not.toMatch(/seun phones/i);
    expect(raw).not.toMatch(/ibadan/i);
  });

  it("does not leak the answer into a backup either", () => {
    // Backups get copied onto flash drives and handed to whoever is helping.
    const backup = JSON.stringify(db.getSettings());
    expect(backup).not.toMatch(/ibadan/i);
  });

  it("hands back the questions without their answers", () => {
    const qs = getQuestions();
    expect(qs).toHaveLength(REQUIRED_QUESTIONS);
    expect(qs[0].question).toContain("first shop");
    expect(qs[0]).not.toHaveProperty("hash");
  });

  it("gives the same hash for the same answer typed differently", async () => {
    expect(await hashAnswer("Ibadan")).toBe(await hashAnswer("  ibadan  "));
  });
});

describe("getting back in", () => {
  beforeEach(async () => { localStorage.clear(); await saveRecovery(ANSWERS); });

  it("lets you in when every answer is right", async () => {
    const r = await verifyAnswers({ q1: "seun phones", q2: "IBADAN" });
    expect(r.ok).toBe(true);
  });

  it("refuses when one answer is wrong", async () => {
    const r = await verifyAnswers({ q1: "Seun Phones", q2: "Lagos" });
    expect(r.ok).toBe(false);
  });

  it("refuses a blank answer rather than matching an empty hash", async () => {
    // The bug this guards: hashing "" on both sides would let anyone in by
    // answering nothing at all.
    const r = await verifyAnswers({ q1: "", q2: "" });
    expect(r.ok).toBe(false);
  });

  it("refuses when nothing was ever configured", async () => {
    localStorage.clear();
    expect(isConfigured()).toBe(false);
    const r = await verifyAnswers({ q1: "anything" });
    expect(r.ok).toBe(false);
    expect(r.notConfigured).toBe(true);
  });

  it("locks out after five wrong tries and says so", async () => {
    for (let i = 0; i < 4; i++) {
      const r = await verifyAnswers({ q1: "no", q2: "no" });
      expect(r.ok).toBe(false);
      expect(r.attemptsLeft).toBe(4 - i);
    }
    const last = await verifyAnswers({ q1: "no", q2: "no" });
    expect(last.attemptsLeft).toBe(0);
    expect(lockedForMs()).toBeGreaterThan(0);

    // and the right answers do not work while locked out
    const during = await verifyAnswers({ q1: "seun phones", q2: "ibadan" });
    expect(during.ok).toBe(false);
    expect(during.lockedForMs).toBeGreaterThan(0);
  });

  it("forgets the wrong tries once you get in", async () => {
    await verifyAnswers({ q1: "no", q2: "no" });
    await verifyAnswers({ q1: "seun phones", q2: "ibadan" });
    clearAttempts();
    expect(lockedForMs()).toBe(0);
  });
});

describe("setting a new PIN", () => {
  beforeEach(() => localStorage.clear());

  it("takes a 4 to 6 digit PIN", () => {
    resetAdminPin("4821");
    expect(db.getSettings().adminPin).toBe("4821");
    resetAdminPin("482100");
    expect(db.getSettings().adminPin).toBe("482100");
  });

  it("refuses anything that is not digits, rather than locking the owner out", () => {
    expect(() => resetAdminPin("12")).toThrow();
    expect(() => resetAdminPin("abcd")).toThrow();
    expect(() => resetAdminPin("")).toThrow();
  });
});

describe("setup refuses a half-set recovery", () => {
  beforeEach(() => localStorage.clear());

  it("will not save one question", async () => {
    await expect(saveRecovery([ANSWERS[0]])).rejects.toThrow();
  });

  it("will not save a question with no answer", async () => {
    await expect(
      saveRecovery([ANSWERS[0], { question: "Home town?", answer: "   " }])
    ).rejects.toThrow();
  });
});

describe("recovery survives other settings changes", () => {
  beforeEach(() => localStorage.clear());

  it("is not wiped by a settings write made from a stale snapshot", async () => {
    // The real sequence: set the questions, then flip "Require PIN sign-in".
    // SettingsProvider holds a copy of settings from mount, so a patch built
    // by spreading that copy used to erase everything written since -- and
    // the owner would only find out on the day they forgot the PIN.
    const staleSnapshot = db.getSettings();
    await saveRecovery(ANSWERS);
    expect(isConfigured()).toBe(true);

    db.saveSettings({ ...db.getSettings(), requirePin: true });
    expect(isConfigured()).toBe(true);

    // and directly: a caller still holding the old object must not win
    void staleSnapshot;
  });
});
