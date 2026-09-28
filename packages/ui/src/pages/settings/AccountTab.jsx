import React, { useEffect, useState } from "react";
import { Cloud, CheckCircle2, LogOut, LogIn, RefreshCw, ChevronRight } from "lucide-react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { db } from "../../lib/db";
import {
  account,
  setAccountGateDecision,
  getPushCursor,
  setPushCursor,
  getPullCursor,
  setPullCursor,
} from "../../lib/account";
import ConnectHqTab from "./ConnectHqTab";
import DeveloperTab from "./DeveloperTab";
import UpgradeLock from "../../components/UpgradeLock";
import SettingsModal, { SettingsRow } from "../../components/SettingsModal";

const MODES = {
  signin: "signin",
  signup: "signup",
  worker: "worker",
  // Finishing signUp() with the code from a confirmation email, and
  // resetting a forgotten password with a code of its own -- both typed
  // in, never a link clicked, for the same reason worker codes are: this
  // device has nowhere reliable for a link to send it back to.
  confirmSignup: "confirmSignup",
  resetRequest: "resetRequest",
  resetConfirm: "resetConfirm",
};

export default function AccountTab() {
  const t = useThemeTokens();
  const [status, setStatus] = useState(null);
  // null means the teaser card is showing, not a form. Each of the three
  // ways in (sign in, set up a business, join with a worker code) pops up
  // as its own dialog rather than swapping in place on the settings page --
  // nothing half-filled sits around behind a page that looks otherwise done.
  const [openModal, setOpenModal] = useState(null);
  const [hqOpen, setHqOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [workerCode, setWorkerCode] = useState("");
  const [workerName, setWorkerName] = useState("");
  // Shared by confirmSignup and resetConfirm -- only one of those is ever
  // open at once, so one field is enough.
  const [code, setCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // What has and has not gone up. Signing in and then seeing nothing move
  // used to look identical to a broken connection -- this is here so nobody
  // has to guess whether it is working.
  const [sync, setSync] = useState({ waiting: 0, lastPushAt: null, lastPullAt: null, busy: false, note: "" });
  // A plain "you're in" said out loud, not just a modal quietly closing and a
  // card somewhere below changing its text. Clears itself after a few
  // seconds; it is a moment, not a permanent label -- the signed-in card
  // itself is what answers "am I still signed in" after that.
  const [justSignedIn, setJustSignedIn] = useState("");

  useEffect(() => {
    if (!justSignedIn) return undefined;
    const id = setTimeout(() => setJustSignedIn(""), 4000);
    return () => clearTimeout(id);
  }, [justSignedIn]);

  useEffect(() => {
    account.status().then((next) => {
      setStatus(next);
      if (next?.signedIn) refreshSync();
    });
  }, []);

  function refreshSync() {
    setSync((s) => ({
      ...s,
      waiting: db.countUnsynced(getPushCursor()),
      lastPushAt: getPushCursor(),
      lastPullAt: getPullCursor(),
    }));
  }

  async function syncNow() {
    setSync((s) => ({ ...s, busy: true, note: "" }));

    let guard = 0;
    let pulled = await account.pull(getPullCursor());
    while (pulled?.ok && pulled.more && guard < 20) {
      guard += 1;
      pulled = await account.pull(pulled.cursor);
    }
    if (pulled?.ok && pulled.cursor) setPullCursor(pulled.cursor);

    guard = 0;
    let pushed = await account.push(getPushCursor());
    while (pushed?.ok && pushed.more && guard < 20) {
      guard += 1;
      pushed = await account.push(pushed.cursor);
    }
    if (pushed?.ok && pushed.cursor) setPushCursor(pushed.cursor);

    const ok = pulled?.ok && pushed?.ok;
    const waiting = db.countUnsynced(getPushCursor());
    setSync({
      waiting,
      lastPushAt: getPushCursor(),
      lastPullAt: getPullCursor(),
      busy: false,
      note: ok
        ? waiting
          ? "Some of it went up. The rest follows shortly."
          : "Everything is up to date."
        : (pulled?.message || pushed?.message || "Couldn't reach TechDesk just now. It will try again on its own."),
    });
  }

  function switchModal(next) {
    setOpenModal(next);
    setError("");
    setCode("");
    setNewPassword("");
  }

  /** The end of every path that lands this device signed in. */
  async function finishSignedIn(message = "You're signed in.") {
    setAccountGateDecision("signed-in");
    setEmail("");
    setPassword("");
    setCode("");
    setNewPassword("");
    setOpenModal(null);
    setStatus(await account.status());
    setJustSignedIn(message);
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    if (openModal === MODES.worker) {
      const res = await account.workerJoin(email, workerCode, workerName);
      setBusy(false);
      if (!res.ok) return setError(res.message || "That didn't work. Try again.");
      setEmail("");
      setWorkerCode("");
      setWorkerName("");
      return finishSignedIn(`You're connected as ${workerName || "a worker"}.`);
    }

    if (openModal === MODES.confirmSignup) {
      const res = await account.confirmSignUp(email, code);
      setBusy(false);
      if (!res.ok) return setError(res.message || "That didn't work. Try again.");
      return finishSignedIn();
    }

    if (openModal === MODES.resetRequest) {
      const res = await account.requestPasswordReset(email);
      setBusy(false);
      if (!res.ok) return setError(res.message || "That didn't work. Try again.");
      setError("");
      setOpenModal(MODES.resetConfirm);
      return;
    }

    if (openModal === MODES.resetConfirm) {
      const res = await account.confirmPasswordReset(email, code, newPassword);
      setBusy(false);
      if (!res.ok) return setError(res.message || "That didn't work. Try again.");
      return finishSignedIn("Password changed. You're signed in.");
    }

    const res =
      openModal === MODES.signup ? await account.signUp(email, password) : await account.signIn(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.message || "That didn't work. Try again.");
    if (res.needsConfirmation) {
      setError("");
      setOpenModal(MODES.confirmSignup);
      return;
    }
    return finishSignedIn();
  }

  async function signOut() {
    await account.signOut();
    setStatus(await account.status());
    setJustSignedIn("");
  }

  /** Straight to Sign in -- no detour through the teaser card first, since
   * the whole point is to land on a different business's credentials right
   * away. Does NOT sign out first: signIn() below replaces whatever session
   * is stored the moment it succeeds, so backing out of this popup without
   * finishing leaves the device signed in exactly as it was, rather than
   * stuck signed out for having only started to switch. */
  function switchAccount() {
    switchModal(MODES.signin);
  }

  const input = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${t.inputBg}`;

  if (!status) return null;

  const isWorker = status.role === "worker";
  const accountSection = status.signedIn ? (
      <div className="flex flex-col gap-5">
        {justSignedIn && (
          <div className={`flex items-center gap-2 rounded-xl px-4 py-3 ${t.dark ? "bg-emerald-500/15" : "bg-emerald-50"}`}>
            <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            <span className={`text-sm font-medium ${t.dark ? "text-emerald-300" : "text-emerald-700"}`}>
              {justSignedIn}
            </span>
          </div>
        )}
        <div className={`rounded-2xl p-6 ${t.cardBg}`}>
          <div className="flex items-center gap-3">
            <Cloud className="text-emerald-500" size={20} />
            <div>
              <h3 className={`font-semibold ${t.textPrimary}`}>
                {isWorker ? `Connected as ${status.workerName}` : "Signed in"}
              </h3>
              <p className={`text-sm ${t.textSecondary}`}>
                {isWorker ? "Working on this shop's sales, repairs and inventory." : status.email}
              </p>
            </div>
          </div>

          <div className={`mt-4 rounded-xl p-4 ${t.insetBg}`}>
            <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>Syncing</div>
            <div className={`mt-1 text-sm ${t.textPrimary}`}>
              {sync.lastPushAt ? `Last sent ${new Date(sync.lastPushAt).toLocaleString()}` : "Nothing sent yet"}
            </div>
            <div className={`text-sm ${t.textSecondary}`}>
              {sync.waiting === 0
                ? "Nothing waiting."
                : `${sync.waiting} record${sync.waiting === 1 ? "" : "s"} waiting to go up.`}
            </div>
            <button
              onClick={syncNow}
              disabled={sync.busy}
              className={`mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg} disabled:opacity-60`}
            >
              <RefreshCw className={`w-4 h-4 ${sync.busy ? "animate-spin" : ""}`} />
              {sync.busy ? "Syncing…" : "Sync now"}
            </button>
            {sync.note && <p className={`text-xs mt-2 ${t.textMuted}`}>{sync.note}</p>}
          </div>

          <div className="mt-4 flex flex-wrap gap-3">
            <button
              onClick={signOut}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-500 bg-red-500/10"
            >
              <LogOut className="w-4 h-4" /> Sign out of this device
            </button>
            <button
              onClick={switchAccount}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg}`}
            >
              <LogIn className="w-4 h-4" /> Sign in to a different business
            </button>
          </div>
        </div>
      </div>
  ) : (
    <div className={`rounded-2xl p-6 ${t.cardBg}`}>
      <h3 className={`font-semibold ${t.textPrimary}`}>Sign in to sync data</h3>
      <p className={`text-sm mt-1 mb-4 ${t.textSecondary}`}>
        You're running TechDesk locally. Sign in whenever you want this device ready to sync.
      </p>
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={() => switchModal(MODES.signin)}
          className={`flex items-center justify-between gap-2 w-full text-left px-4 py-3 rounded-xl text-sm font-medium ${t.insetBg} ${t.textPrimary}`}
        >
          Sign in
          <ChevronRight className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => switchModal(MODES.signup)}
          className={`flex items-center justify-between gap-2 w-full text-left px-4 py-3 rounded-xl text-sm font-medium ${t.insetBg} ${t.textPrimary}`}
        >
          Setting up a new shop? Set up your business
          <ChevronRight className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => switchModal(MODES.worker)}
          className={`flex items-center justify-between gap-2 w-full text-left px-4 py-3 rounded-xl text-sm font-medium ${t.insetBg} ${t.textPrimary}`}
        >
          Joining a shop that already has an account? Connect to a business
          <ChevronRight className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
        </button>
      </div>
    </div>
  );

  const modalTitle =
    openModal === MODES.signup
      ? "Set up your business"
      : openModal === MODES.worker
      ? "Connect to a business"
      : openModal === MODES.confirmSignup
      ? "Confirm your email"
      : openModal === MODES.resetRequest
      ? "Reset your password"
      : openModal === MODES.resetConfirm
      ? "Choose a new password"
      : "Sign in";

  const modalDescription =
    openModal === MODES.signup
      ? "Create this business's account once. Every device after this one connects to it instead of making its own."
      : openModal === MODES.worker
      ? "Enter the shop's email, the code its owner read out to you, and your own name."
      : openModal === MODES.confirmSignup
      ? `We sent a code to ${email || "your email"}. Enter it to finish setting up your account.`
      : openModal === MODES.resetRequest
      ? "Enter the email your account uses. If it has an account, a code to reset the password is on its way."
      : openModal === MODES.resetConfirm
      ? `Enter the code sent to ${email || "your email"}, and the password you want instead.`
      : "Sign in with this business's email and password to get this device ready to sync.";

  const submitLabel =
    openModal === MODES.resetRequest
      ? "Send code"
      : openModal === MODES.confirmSignup
      ? "Confirm"
      : openModal === MODES.resetConfirm
      ? "Set new password"
      : modalTitle;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-3">
        <h2 className={`text-xs font-semibold uppercase tracking-wider ${t.textMuted}`}>Account &amp; sync</h2>
        {accountSection}
      </div>

      {openModal && (
        <SettingsModal title={modalTitle} description={modalDescription} onClose={() => switchModal(null)}>
          <form onSubmit={submit} className="flex flex-col gap-3">
            {openModal === MODES.worker ? (
              <>
                <input
                  type="email"
                  placeholder="Shop's email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={input}
                  autoFocus
                />
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
            ) : openModal === MODES.confirmSignup ? (
              <input
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6-digit code"
                inputMode="numeric"
                className={input}
                autoFocus
              />
            ) : openModal === MODES.resetRequest ? (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={input}
                autoFocus
              />
            ) : openModal === MODES.resetConfirm ? (
              <>
                <input
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  placeholder="6-digit code"
                  inputMode="numeric"
                  className={input}
                  autoFocus
                />
                <input
                  type="password"
                  placeholder="New password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={input}
                />
              </>
            ) : (
              <>
                <input
                  type="email"
                  placeholder="Email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className={input}
                  autoFocus
                />
                <input
                  type="password"
                  placeholder="Password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className={input}
                />
                {openModal === MODES.signin && (
                  <button
                    type="button"
                    onClick={() => switchModal(MODES.resetRequest)}
                    className={`self-start text-sm font-medium ${t.textSecondary}`}
                  >
                    Forgot password?
                  </button>
                )}
              </>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 ${t.pillBg}`}
            >
              {busy ? "Working…" : submitLabel}
            </button>
          </form>
        </SettingsModal>
      )}

      <SettingsRow
        title="Connect to head office"
        description="Report this branch up to a head office account, so whoever runs the business sees its sales and repairs from their own phone."
        onOpen={() => setHqOpen(true)}
        actionLabel="Manage head office"
      />

      {hqOpen && (
        <SettingsModal title="Connect to head office" onClose={() => setHqOpen(false)}>
          <UpgradeLock
            feature="hq"
            title="Connect this branch to head office"
            what="Report this branch up to a head office account, so whoever runs the business sees its sales and repairs from their own phone."
          >
            <ConnectHqTab />
          </UpgradeLock>
        </SettingsModal>
      )}

      <DeveloperTab />
    </div>
  );
}
