import React, { useState } from "react";
import { HardDrive, Mail, Lock, KeyRound, User, ArrowLeft, Check, AlertCircle } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { account, setAccountGateDecision } from "../lib/account";
import { useAuth } from "../lib/AuthContext";
import BrandMark from "../components/BrandMark";
import Field from "../components/Field";

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
  // Set when the email already has an account, so the message can offer the
  // way out instead of leaving the shop on a dead end.
  const [taken, setTaken] = useState(false);
  const [notice, setNotice] = useState("");
  const [show, setShow] = useState(false);

  function continueLocally() {
    setAccountGateDecision("local");
    onDone();
  }

  function goTo(next) {
    setMode(next);
    setError("");
    setTaken(false);
    setNotice("");
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

  // What the button needs before it will do anything. A one-field form is
  // submitted by the phone keyboard's Done key, so an incomplete one has to
  // refuse here rather than call out and fail in a way nobody can read.
  const emailLooksReal = /\S+@\S+\.\S+/.test(email.trim());
  const ready =
    mode === MODES.worker
      ? emailLooksReal && workerCode.length === 6 && workerName.trim().length > 0
      : mode === MODES.confirmSignup
      ? code.length >= 6
      : emailLooksReal && password.length >= 6;

  async function submit(e) {
    e.preventDefault();
    if (!ready || busy) return;
    setError("");
    setNotice("");
    setTaken(false);
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
      if (!res.ok) return setError(res.message || "That code didn't match. Check it and try again.");
      return finish();
    }

    const res = mode === MODES.signup ? await account.signUp(email, password) : await account.signIn(email, password);
    setBusy(false);
    if (!res.ok) {
      if (res.exists) setTaken(true);
      return setError(res.message || "That didn't work. Try again.");
    }
    if (res.needsConfirmation) {
      setError("");
      setCode("");
      setMode(MODES.confirmSignup);
      return;
    }
    return finish();
  }

  async function resend() {
    setBusy(true);
    setError("");
    const res = await account.signUp(email, password);
    setBusy(false);
    if (res.exists) { setTaken(true); return setError(res.message); }
    setNotice(`Sent again to ${email}. It can take a minute, and it may land in spam.`);
  }

  const title =
    mode === MODES.signup ? "Set up your business"
      : mode === MODES.worker ? "Join as a worker"
      : mode === MODES.confirmSignup ? "Check your email"
      : "Welcome back";
  const subtitle =
    mode === MODES.signup ? "One account keeps this shop's records on all your devices."
      : mode === MODES.worker ? "Ask the owner for the shop's email and the code they made for you."
      : mode === MODES.confirmSignup ? `We sent a 6-digit code to ${email}.`
      : "Sign in with the email and password for this shop.";

  return (
    <div className={`min-h-screen w-full flex items-center justify-center px-5 py-10 ${transparent ? "" : t.bg}`}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center mb-7">
          <BrandMark className="w-12 h-12 rounded-2xl mb-4" title="TechDesk" />
          <h1 className={`text-2xl font-bold tracking-tight ${t.textPrimary}`}>
            {mode === MODES.choose ? "Set up TechDesk" : title}
          </h1>
          <p className={`text-sm mt-2 leading-relaxed ${t.textSecondary}`}>
            {mode === MODES.choose
              ? "An account keeps this shop's records on all your devices. You can also run TechDesk entirely on this one."
              : subtitle}
          </p>
        </div>

        {mode === MODES.choose ? (
          <div className="flex flex-col gap-2.5">
            <button
              type="button"
              onClick={() => goTo(MODES.signup)}
              className="py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-br from-indigo-600 to-sky-500"
            >
              Set up a new business
            </button>
            <button
              type="button"
              onClick={() => goTo(MODES.signin)}
              className={`py-3.5 rounded-xl font-semibold text-sm border ${t.divider} ${t.textPrimary}`}
            >
              Sign in to an existing one
            </button>
            <button
              type="button"
              onClick={() => goTo(MODES.worker)}
              className={`py-3.5 rounded-xl font-semibold text-sm border ${t.divider} ${t.textPrimary}`}
            >
              Join a shop as a worker
            </button>
            <div className={`flex items-center gap-3 my-2 text-xs ${t.textMuted}`}>
              <span className={`flex-1 h-px ${t.dark ? "bg-white/10" : "bg-black/10"}`} />or<span className={`flex-1 h-px ${t.dark ? "bg-white/10" : "bg-black/10"}`} />
            </div>
            <button
              type="button"
              onClick={continueLocally}
              className={`flex items-center justify-center gap-2 py-3 text-sm font-medium ${t.textSecondary}`}
            >
              <HardDrive className="w-4 h-4" /> Use this device only
            </button>
            <p className={`mt-3 text-xs text-center leading-relaxed ${t.textMuted}`}>
              Nothing leaves this device unless you sign in, and you can create an account later
              from Settings without losing anything.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-4">
            {mode !== MODES.confirmSignup && (
              <Field
                id="ag-email" label="Email" icon={Mail} type="email" autoComplete="email"
                inputMode="email" autoFocus placeholder="you@yourshop.com"
                value={email} onChange={(e) => { setEmail(e.target.value); setTaken(false); }}
              />
            )}

            {mode === MODES.worker ? (
              <>
                <Field
                  id="ag-wcode" label="Code from the owner" icon={KeyRound} inputMode="numeric"
                  placeholder="6 digits" value={workerCode}
                  onChange={(e) => setWorkerCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                />
                <Field
                  id="ag-wname" label="Your name" icon={User} placeholder="So the shop knows who sold what"
                  value={workerName} onChange={(e) => setWorkerName(e.target.value)}
                />
              </>
            ) : mode === MODES.confirmSignup ? (
              <Field
                id="ag-code" label="Code from your email" icon={KeyRound} inputMode="numeric"
                autoFocus placeholder="6 digits" value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                hint="It can take a minute to arrive, and it sometimes lands in spam."
              />
            ) : (
              <Field
                id="ag-pass" label="Password" icon={Lock}
                type={show ? "text" : "password"}
                autoComplete={mode === MODES.signup ? "new-password" : "current-password"}
                placeholder={mode === MODES.signup ? "At least 6 characters" : "Your password"}
                value={password} onChange={(e) => setPassword(e.target.value)}
                reveal revealed={show} onReveal={() => setShow((v) => !v)}
              />
            )}

            {notice && (
              <p className="flex items-start gap-2 text-sm text-emerald-600 dark:text-emerald-400">
                <Check className="w-4 h-4 mt-0.5 shrink-0" /> {notice}
              </p>
            )}
            {error && (
              <div className="flex items-start gap-2 text-sm text-red-500">
                <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                <div>
                  {error}
                  {taken && (
                    <button
                      type="button"
                      onClick={() => { const keep = email; goTo(MODES.signin); setEmail(keep); }}
                      className="block mt-1.5 font-semibold underline underline-offset-4 text-indigo-500"
                    >
                      Sign in with this email instead
                    </button>
                  )}
                </div>
              </div>
            )}

            <button
              type="submit"
              disabled={busy || !ready}
              className="py-3.5 rounded-xl font-semibold text-sm text-white bg-gradient-to-br from-indigo-600 to-sky-500 disabled:opacity-50"
            >
              {busy ? "Working…"
                : mode === MODES.signup ? "Create account"
                : mode === MODES.worker ? "Join this shop"
                : mode === MODES.confirmSignup ? "Confirm"
                : "Sign in"}
            </button>

            {mode === MODES.confirmSignup && (
              <button type="button" onClick={resend} disabled={busy} className={`text-sm font-medium ${t.textSecondary}`}>
                Didn&rsquo;t get it? Send the code again
              </button>
            )}

            {(mode === MODES.signup || mode === MODES.signin) && (
              <button
                type="button"
                onClick={() => goTo(mode === MODES.signup ? MODES.signin : MODES.signup)}
                className={`text-sm ${t.textSecondary}`}
              >
                {mode === MODES.signup
                  ? <>Already have an account? <span className="font-semibold text-indigo-500">Sign in</span></>
                  : <>New to TechDesk? <span className="font-semibold text-indigo-500">Set up a business</span></>}
              </button>
            )}

            <button
              type="button"
              onClick={() => goTo(MODES.choose)}
              className={`flex items-center justify-center gap-1.5 text-sm ${t.textMuted}`}
            >
              <ArrowLeft className="w-4 h-4" /> Back
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
