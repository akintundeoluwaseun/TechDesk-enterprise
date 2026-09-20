import React, { useEffect, useState } from "react";
import { KeyRound, Check } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import {
  SUGGESTED_QUESTIONS,
  REQUIRED_QUESTIONS,
  getQuestions,
  saveRecovery,
  clearRecovery,
  isConfigured,
} from "../lib/pinRecovery";

const BLANK = { question: "", answer: "" };

/**
 * Setting the questions that get you back in after forgetting the PIN.
 *
 * Deliberately shows the questions already set but never the answers -- they
 * are hashed, so they cannot be shown, and a box pre-filled with dots would
 * suggest otherwise.
 */
export default function PinRecoverySetup() {
  const t = useThemeTokens();
  const [rows, setRows] = useState(() => Array.from({ length: REQUIRED_QUESTIONS }, () => ({ ...BLANK })));
  const [existing, setExisting] = useState(() => getQuestions());
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(() => !isConfigured());

  useEffect(() => {
    if (!status) return undefined;
    const id = setTimeout(() => setStatus(""), 2500);
    return () => clearTimeout(id);
  }, [status]);

  function update(i, field, value) {
    setError("");
    setRows((prev) => prev.map((row, idx) => (idx === i ? { ...row, [field]: value } : row)));
  }

  async function handleSave() {
    try {
      await saveRecovery(rows);
      setExisting(getQuestions());
      setRows(Array.from({ length: REQUIRED_QUESTIONS }, () => ({ ...BLANK })));
      setEditing(false);
      setStatus("Saved. Keep the answers to yourself.");
    } catch (err) {
      setError(err.message || "Couldn't save those.");
    }
  }

  function handleClear() {
    clearRecovery();
    setExisting([]);
    setEditing(true);
    setStatus("Recovery questions removed.");
  }

  const input = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${t.inputBg}`;

  return (
    <div className={`rounded-2xl p-6 ${t.cardBg}`}>
      <div className="flex items-center gap-3 mb-1">
        <KeyRound className={t.dark ? "text-amber-300" : "text-amber-500"} size={20} />
        <h3 className={`font-semibold ${t.textPrimary}`}>If you forget your PIN</h3>
      </div>
      <p className={`text-sm mb-5 ${t.textSecondary}`}>
        TechDesk has no email and may have no internet, so these questions are the only way back
        in. Answer them at the lock screen to set a new PIN. Pick things nobody in the shop could
        guess &mdash; anyone who answers them gets everything the admin can see.
      </p>

      {existing.length > 0 && !editing && (
        <div className={`rounded-xl overflow-hidden mb-4 ${t.insetBg}`}>
          {existing.map((q) => (
            <div key={q.id} className={`flex items-center gap-2 px-4 py-3 border-b last:border-b-0 ${t.divider}`}>
              <Check className="w-4 h-4 text-emerald-500 shrink-0" />
              <span className={`text-sm ${t.textPrimary}`}>{q.question}</span>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <div className="flex flex-col gap-4 mb-4">
          {rows.map((row, i) => (
            <div key={i} className="flex flex-col gap-2">
              <label className={`text-sm font-medium ${t.textPrimary}`}>Question {i + 1}</label>
              <input
                list={`pin-recovery-suggestions-${i}`}
                value={row.question}
                onChange={(e) => update(i, "question", e.target.value)}
                placeholder="Pick one, or write your own"
                className={input}
              />
              {/* A datalist, not a dropdown: the suggestions are a starting
                  point and a shop should be able to write a better one. */}
              <datalist id={`pin-recovery-suggestions-${i}`}>
                {SUGGESTED_QUESTIONS.map((q) => (
                  <option key={q} value={q} />
                ))}
              </datalist>
              <input
                value={row.answer}
                onChange={(e) => update(i, "answer", e.target.value)}
                placeholder="Answer"
                className={input}
              />
            </div>
          ))}
        </div>
      )}

      {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
      {status && <p className="text-sm text-emerald-500 mb-3">{status}</p>}

      <div className="flex flex-wrap gap-3">
        {editing ? (
          <>
            <button
              onClick={handleSave}
              className={`px-4 py-2.5 rounded-full text-sm font-semibold ${t.pillBg}`}
            >
              Save questions
            </button>
            {existing.length > 0 && (
              <button
                onClick={() => { setEditing(false); setError(""); }}
                className={`px-4 py-2.5 rounded-full text-sm font-medium ${t.textSecondary}`}
              >
                Cancel
              </button>
            )}
          </>
        ) : (
          <>
            <button
              onClick={() => setEditing(true)}
              className={`px-4 py-2.5 rounded-full text-sm font-semibold ${t.pillBg}`}
            >
              Change questions
            </button>
            <button
              onClick={handleClear}
              className={`px-4 py-2.5 rounded-full text-sm font-medium text-red-500 ${
                t.dark ? "bg-red-500/10" : "bg-red-50"
              }`}
            >
              Remove
            </button>
          </>
        )}
      </div>

      {existing.length === 0 && !editing && (
        <p className={`text-xs mt-3 ${t.textMuted}`}>
          Nothing is set. If the PIN is forgotten there will be no way into this app.
        </p>
      )}
    </div>
  );
}
