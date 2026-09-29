import React, { useState } from "react";
import { Cloud, HardDrive } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { account, setAccountGateDecision } from "../lib/account";
import { useAuth } from "../lib/AuthContext";

const MODES = { choose: "choose", signup: "signup", signin: "signin", worker: "worker", confirmSignup: "confirmSignup" };

/**
 * Shown once, on a device's very first run: sign in to sync data across
 * devices later, or continue exactly as TechDesk has always worked -- fully
 * local, nothing sent anywhere. Skipped entirely for any device that already
 * has records of its own, so nobody running the shop today is suddenly
 * interrupted by it.
 */
// `transparent` drops the page background, for when onboarding draws its
// own animated one behind this screen.
export default function AccountGateScreen({ onDone, transparent = false }) {
  const t = useThemeTokens();
  const { syncUserFromAccount } = useAuth();
  const [mode, setMode] = useState(MODES.choose);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [workerCode, setWorkerCode] = useState("");
  const [workerName, setWorkerName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function continueLocally() {
    setAccountGateDecision("local");
    onDone();
  }

  async function finish() {
    setAccountGateDecision("signed-in");
    // This device just proved itself as a worker (or an owner) -- without
    // this, the app moves on to Shell still carrying whatever role it
    // guessed before this screen ever ran, and a worker's device shows the
    // full admin view until its next full restart.
    await syncUserFromAccount();
    onDone();
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    if (mode === MODES.worker) {
      const res = await account.workerJoin(email, workerCode, workerName);
      setBusy(false);
      if (!res.ok) return setError(res.message || "That didn't work. Try again.");
      return finish();
    }

    if (mode === MODES.confirmSignup) {
      const res = await account.confirmSignUp(email, code);
      setBusy(false);
      if (!res.ok) return setError(res.message || "That didn't work. Try again.");
      return finish();
    }

    const res = mode === MODES.signup ? await account.signUp(email, password) : await account.signIn(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.message || "That didn't work. Try again.");
    if (res.needsConfirmation) {
      setError("");
      setCode("");
      setMode(MODES.confirmSignup);
      return;
    }
    return finish();
  }

  const input = `w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`;

  return (
    <div className={`min-h-screen w-full flex items-center justify-center py-16 ${transparent ? "" : t.bg}`}>
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
                  t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
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
                onClick={() => setMode(MODES.worker)}
                className={`py-3 rounded-xl font-semibold text-sm ${t.pillBg} ${t.textPrimary}`}
              >
                Joining as a worker, with a code
              </button>
              <button
                onClick={continueLocally}
                className={`flex items-center justify-center gap-2 py-3 mt-2 text-sm underline underline-offset-4 ${t.textSecondary}`}
              >
                <HardDrive className="w-4 h-4" /> Continue locally, no account
              </button>
            </div>
            <p className={`mt-4 text-xs text-center ${t.textMuted}`}>
              Setting up a new shop for the first time? Choose "Set up your business". Getting a
              new device of your own for a shop that already has an account? Choose "Connect to a
              business" and sign in with its email and password. Handed a shop's email and a code
              by its owner, to work there without their password? Choose "Joining as a worker".
            </p>
          </>
        ) : (
          <>
            <div className="flex flex-col items-center mb-6 text-center">
              <Cloud className={`w-8 h-8 mb-2 ${t.dark ? "text-white" : "text-blue-500"}`} />
              <h1 className={`text-xl font-bold ${t.textPrimary}`}>
                {mode === MODES.signup
                  ? "Set up your business"
                  : mode === MODES.worker
                  ? "Joining as a worker"
                  : mode === MODES.confirmSignup
                  ? "Confirm your email"
                  : "Connect to a business"}
              </h1>
              {mode === MODES.worker && (
                <p className={`text-sm mt-2 ${t.textSecondary}`}>
                  Ask the shop's owner for its email and the code they generated for you.
                </p>
              )}
              {mode === MODES.confirmSignup && (
                <p className={`text-sm mt-2 ${t.textSecondary}`}>
                  We sent a code to {email || "your email"}. Enter it to finish setting up your account.
                </p>
              )}
            </div>
            <form onSubmit={submit} className="flex flex-col gap-3">
              {mode !== MODES.confirmSignup && (
                <input
                  type="email"
                  autoFocus
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={input}
                />
              )}
              {mode === MODES.worker ? (
                <>
                  <input
                    value={workerCode}
                    onChange={(e) => setWorkerCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="6-digit code"
                    inputMode="numeric"
                    className={input}
                  />
                  <input
                    value={workerName}
                    onChange={(e) => setWorkerName(e.target.value)}
                    placeholder="Your name"
                    className={input}
                  />
                </>
              ) : mode === MODES.confirmSignup ? (
                <input
                  autoFocus
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  placeholder="Code from your email"
                  inputMode="numeric"
                  className={input}
                />
              ) : (
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={input}
                />
              )}
              {error && <p className="text-sm text-red-500">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className={`py-3 rounded-xl font-semibold disabled:opacity-60 ${
                  t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
                }`}
              >
                {busy
                  ? "Working…"
                  : mode === MODES.signup
                  ? "Set up your business"
                  : mode === MODES.worker
                  ? "Join"
                  : mode === MODES.confirmSignup
                  ? "Confirm"
                  : "Connect to a business"}
              </button>
              {mode !== MODES.worker && mode !== MODES.confirmSignup && (
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === MODES.signup ? MODES.signin : MODES.signup);
                    setError("");
                  }}
                  className={`text-sm ${t.textSecondary}`}
                >
                  {mode === MODES.signup ? "Already part of one? Connect to a business" : "Setting up a new one? Set up your business"}
                </button>
              )}
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
