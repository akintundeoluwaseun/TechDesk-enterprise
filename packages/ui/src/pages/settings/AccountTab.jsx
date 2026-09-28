import React, { useEffect, useState } from "react";
import { Cloud, LogOut, RefreshCw, ChevronRight } from "lucide-react";
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

const MODES = { signin: "signin", signup: "signup", worker: "worker" };

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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  // What has and has not gone up. Signing in and then seeing nothing move
  // used to look identical to a broken connection -- this is here so nobody
  // has to guess whether it is working.
  const [sync, setSync] = useState({ waiting: 0, lastPushAt: null, lastPullAt: null, busy: false, note: "" });

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
    setNotice("");
  }

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    if (openModal === MODES.worker) {
      const res = await account.workerJoin(email, workerCode, workerName);
      setBusy(false);
      if (!res.ok) return setError(res.message || "That didn't work. Try again.");
      setAccountGateDecision("signed-in");
      setEmail("");
      setWorkerCode("");
      setWorkerName("");
      setOpenModal(null);
      setStatus(await account.status());
      return;
    }

    const res =
      openModal === MODES.signup ? await account.signUp(email, password) : await account.signIn(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.message || "That didn't work. Try again.");
    if (res.needsConfirmation) {
      setNotice("Check your email to confirm the account, then sign in here.");
      setOpenModal(MODES.signin);
      return;
    }
    setAccountGateDecision("signed-in");
    setEmail("");
    setPassword("");
    setOpenModal(null);
    setStatus(await account.status());
  }

  async function signOut() {
    await account.signOut();
    setStatus(await account.status());
  }

  const input = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${t.inputBg}`;

  if (!status) return null;

  const isWorker = status.role === "worker";
  const accountSection = status.signedIn ? (
      <div className="flex flex-col gap-5">
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

          <button
            onClick={signOut}
            className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-500 bg-red-500/10"
          >
            <LogOut className="w-4 h-4" /> Sign out of this device
          </button>
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
      : "Sign in";

  const modalDescription =
    openModal === MODES.signup
      ? "Create this business's account once. Every device after this one connects to it instead of making its own."
      : openModal === MODES.worker
      ? "Enter the shop's email, the code its owner read out to you, and your own name."
      : "Sign in with this business's email and password to get this device ready to sync.";

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
              </>
            )}
            {error && <p className="text-sm text-red-500">{error}</p>}
            {notice && <p className="text-sm text-emerald-500">{notice}</p>}
            <button
              type="submit"
              disabled={busy}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 ${t.pillBg}`}
            >
              {busy ? "Working…" : modalTitle}
            </button>
            {/* A way to switch to a different dialog without closing this one
                and reopening from the teaser card. */}
            <div className="flex flex-col gap-2 mt-1">
              {openModal !== MODES.signin && (
                <button
                  type="button"
                  onClick={() => switchModal(MODES.signin)}
                  className={`flex items-center justify-between gap-2 w-full text-left px-4 py-3 rounded-xl text-sm font-medium ${t.insetBg} ${t.textPrimary}`}
                >
                  Already have an account? Sign in
                  <ChevronRight className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
                </button>
              )}
              {openModal !== MODES.signup && (
                <button
                  type="button"
                  onClick={() => switchModal(MODES.signup)}
                  className={`flex items-center justify-between gap-2 w-full text-left px-4 py-3 rounded-xl text-sm font-medium ${t.insetBg} ${t.textPrimary}`}
                >
                  Setting up a new shop? Set up your business
                  <ChevronRight className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
                </button>
              )}
              {openModal !== MODES.worker && (
                <button
                  type="button"
                  onClick={() => switchModal(MODES.worker)}
                  className={`flex items-center justify-between gap-2 w-full text-left px-4 py-3 rounded-xl text-sm font-medium ${t.insetBg} ${t.textPrimary}`}
                >
                  Joining a shop that already has an account? Connect to a business
                  <ChevronRight className={`w-4 h-4 shrink-0 ${t.textMuted}`} aria-hidden="true" />
                </button>
              )}
            </div>
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
