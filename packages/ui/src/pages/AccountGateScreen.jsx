import React, { useState } from "react";
import { Cloud, HardDrive } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { account, setAccountGateDecision } from "../lib/account";

const MODES = { choose: "choose", signup: "signup", signin: "signin" };

/**
 * Shown once, on a device's very first run: sign in to sync data across
 * devices later, or continue exactly as TechDesk has always worked -- fully
 * local, nothing sent anywhere. Skipped entirely for any device that already
 * has records of its own, so nobody running the shop today is suddenly
 * interrupted by it.
 */
export default function AccountGateScreen({ onDone }) {
  const t = useThemeTokens();
  const [mode, setMode] = useState(MODES.choose);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  function continueLocally() {
    setAccountGateDecision("local");
    onDone();
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = mode === MODES.signup ? await account.signUp(email, password) : await account.signIn(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.message || "That didn't work. Try again.");
    if (res.needsConfirmation) {
      setNotice("Check your email to confirm the account, then come back and sign in.");
      setMode(MODES.signin);
      return;
    }
    setAccountGateDecision("signed-in");
    onDone();
  }

  const input = `w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`;

  return (
    <div className={`min-h-screen w-full flex items-center justify-center ${t.bg}`}>
      <div className="w-full max-w-sm px-6">
        {mode === MODES.choose ? (
          <>
            <div className="flex flex-col items-center mb-8 text-center">
              <Cloud className={`w-8 h-8 mb-2 ${t.dark ? "text-white" : "text-blue-500"}`} />
              <h1 className={`text-xl font-bold ${t.textPrimary}`}>Sign in to sync data, or continue locally</h1>
              <p className={`text-sm mt-2 ${t.textSecondary}`}>
                Signing in is only for syncing your data later. Everything about how you use
                TechDesk day to day stays exactly the same either way.
              </p>
            </div>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => setMode(MODES.signup)}
                className={`flex items-center justify-center gap-2 py-3 rounded-xl font-semibold ${
                  t.dark ? "bg-white text-black" : "bg-slate-900 text-white"
                }`}
              >
                <Cloud className="w-4 h-4" /> Set up your business
              </button>
              <button
                onClick={() => setMode(MODES.signin)}
                className={`py-3 rounded-xl font-semibold text-sm ${t.pillBg} ${t.textPrimary}`}
              >
                Connect to a business -- sign in
              </button>
              <button
                onClick={continueLocally}
                className={`flex items-center justify-center gap-2 py-3 mt-2 text-sm underline underline-offset-4 ${t.textSecondary}`}
              >
                <HardDrive className="w-4 h-4" /> Continue locally, no account
              </button>
            </div>
            <p className={`mt-4 text-xs text-center ${t.textMuted}`}>
              Setting up a new shop for the first time? Choose "Set up your business". Joining a
              shop that already has an account -- another till, another worker's device -- choose
              "Connect to a business" and sign in with what they gave you.
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center mb-6 text-center">
              <Cloud className={`w-8 h-8 mb-2 ${t.dark ? "text-white" : "text-blue-500"}`} />
              <h1 className={`text-xl font-bold ${t.textPrimary}`}>
                {mode === MODES.signup ? "Set up your business" : "Connect to a business"}
              </h1>
            </div>
            <form onSubmit={submit} className="flex flex-col gap-3">
              <input
                type="email"
                autoFocus
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={input}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className={input}
              />
              {error && <p className="text-sm text-red-500">{error}</p>}
              {notice && <p className="text-sm text-emerald-500">{notice}</p>}
              <button
                type="submit"
                disabled={busy}
                className={`py-3 rounded-xl font-semibold disabled:opacity-60 ${
                  t.dark ? "bg-white text-black" : "bg-slate-900 text-white"
                }`}
              >
                {busy ? "Working…" : mode === MODES.signup ? "Set up your business" : "Connect to a business"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMode(mode === MODES.signup ? MODES.signin : MODES.signup);
                  setError("");
                  setNotice("");
                }}
                className={`text-sm ${t.textSecondary}`}
              >
                {mode === MODES.signup ? "Already part of one? Connect to a business" : "Setting up a new one? Set up your business"}
              </button>
              <button
                type="button"
                onClick={() => setMode(MODES.choose)}
                className={`text-sm underline underline-offset-4 ${t.textMuted}`}
              >
                Back
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
