import React, { useState } from "react";
import { X, KeyRound } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { getQuestions, verifyAnswers, resetAdminPin, lockedForMs } from "../lib/pinRecovery";
import { useCloseOnBack } from "../lib/useCloseOnBack";

function minutes(ms) {
  return Math.max(1, Math.ceil(ms / 60000));
}

/**
 * Answer the questions, set a new PIN.
 *
 * Two steps so the new PIN is never typed before the questions are passed --
 * otherwise a wrong guess and a new PIN look like the same interaction, and
 * somebody will believe they changed it when they did not.
 */
export default function ForgotPinModal({ onClose, onReset }) {
  const t = useThemeTokens();
  useCloseOnBack(true, onClose);
  const questions = getQuestions();

  const [answers, setAnswers] = useState({});
  const [stage, setStage] = useState(() => (lockedForMs() > 0 ? "locked" : "questions"));
  const [error, setError] = useState("");
  const [hint, setHint] = useState("");
  const [waitMs, setWaitMs] = useState(() => lockedForMs());
  const [pin, setPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleCheck() {
    setBusy(true);
    setError("");
    setHint("");
    try {
      const result = await verifyAnswers(answers);
      if (result.ok) {
        setStage("newPin");
      } else if (result.lockedForMs) {
        setWaitMs(result.lockedForMs);
        setStage("locked");
      } else if (result.notConfigured) {
        setError("No recovery questions were ever set on this device.");
      } else {
        setError("That doesn't match.");
        setHint(`${result.attemptsLeft} ${result.attemptsLeft === 1 ? "try" : "tries"} left.`);
      }
    } finally {
      setBusy(false);
    }
  }

  function handleSetPin() {
    if (pin !== confirmPin) {
      setError("The two PINs don't match.");
      return;
    }
    try {
      resetAdminPin(pin);
      onReset?.();
    } catch (err) {
      setError(err.message);
    }
  }

  const input = `w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
      <div className={`w-full max-w-md rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            <KeyRound className={t.dark ? "text-amber-300" : "text-amber-500"} size={18} />
            <h2 className={`text-lg font-bold ${t.textPrimary}`}>Forgot your PIN</h2>
          </div>
          <button onClick={onClose} aria-label="Close" className={t.textMuted}>
            <X className="w-5 h-5" />
          </button>
        </div>

        {stage === "locked" && (
          <p className={`text-sm mt-4 ${t.textSecondary}`}>
            Too many wrong answers. Try again in about {minutes(waitMs)} minutes.
          </p>
        )}

        {stage === "questions" && questions.length === 0 && (
          <p className={`text-sm mt-4 ${t.textSecondary}`}>
            No recovery questions were set on this device, so there is no way to reset the PIN
            here. If you have a backup file, reinstalling and restoring it will bring your records
            back.
          </p>
        )}

        {stage === "questions" && questions.length > 0 && (
          <>
            <p className={`text-sm mt-1 mb-5 ${t.textSecondary}`}>
              Answer the questions you set, then choose a new PIN.
            </p>
            <div className="flex flex-col gap-4">
              {questions.map((q) => (
                <div key={q.id}>
                  <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>{q.question}</label>
                  <input
                    value={answers[q.id] || ""}
                    onChange={(e) => setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))}
                    className={input}
                  />
                </div>
              ))}
            </div>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            {hint && <p className={`text-xs mt-1 ${t.textMuted}`}>{hint}</p>}
            <button
              onClick={handleCheck}
              disabled={busy}
              className={`w-full mt-5 py-3 rounded-xl font-semibold disabled:opacity-50 ${
                t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
              }`}
            >
              {busy ? "Checking…" : "Continue"}
            </button>
          </>
        )}

        {stage === "newPin" && (
          <>
            <p className={`text-sm mt-1 mb-5 ${t.textSecondary}`}>
              That's right. Choose a new admin PIN, 4 to 6 digits.
            </p>
            <div className="flex flex-col gap-4">
              <input
                type="password"
                inputMode="numeric"
                value={pin}
                onChange={(e) => { setPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                placeholder="New PIN"
                className={input}
              />
              <input
                type="password"
                inputMode="numeric"
                value={confirmPin}
                onChange={(e) => { setConfirmPin(e.target.value.replace(/\D/g, "").slice(0, 6)); setError(""); }}
                placeholder="Repeat the new PIN"
                className={input}
              />
            </div>
            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}
            <button
              onClick={handleSetPin}
              className={`w-full mt-5 py-3 rounded-xl font-semibold ${
                t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
              }`}
            >
              Set new PIN
            </button>
          </>
        )}
      </div>
    </div>
  );
}
