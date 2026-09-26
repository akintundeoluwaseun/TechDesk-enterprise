import React, { useEffect, useState } from "react";
import { Cloud, LogOut, Mail, RefreshCw, UserPlus, Copy } from "lucide-react";
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

const MODES = { signin: "signin", signup: "signup", worker: "worker" };

/**
 * Generates the code an owner reads out to a worker, and counts down until
 * it expires -- a code with no visible clock reads as though it never
 * expires at all, which is not true and not meant to be.
 */
function InviteWorkerPanel() {
  const t = useThemeTokens();
  const [state, setState] = useState({ code: null, expiresAt: null, busy: false, error: "" });
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state.expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.expiresAt]);

  async function generate() {
    setState((s) => ({ ...s, busy: true, error: "" }));
    const res = await account.inviteStart();
    if (!res.ok) {
      setState({ code: null, expiresAt: null, busy: false, error: res.message || "Couldn't generate a code. Try again." });
      return;
    }
    setState({
      code: res.code,
      expiresAt: Date.now() + res.expiresInMinutes * 60 * 1000,
      busy: false,
      error: "",
    });
  }

  const secondsLeft = state.expiresAt ? Math.max(0, Math.round((state.expiresAt - now) / 1000)) : 0;
  const expired = state.expiresAt && secondsLeft === 0;

  return (
    <div className={`mt-4 rounded-xl p-4 ${t.insetBg}`}>
      <div className="flex items-center gap-2">
        <UserPlus className={`w-4 h-4 ${t.textSecondary}`} />
        <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>Invite a worker</div>
      </div>
      <p className={`text-sm mt-1 ${t.textSecondary}`}>
        A worker's own device can read and write this shop's sales, repairs and inventory --
        without ever being given this email's password. Generate a code and read it out to them;
        they'll enter this shop's email, the code, and their own name.
      </p>

      {state.code && !expired ? (
        <div className="mt-3 flex items-center gap-3">
          <div className={`font-mono text-2xl font-bold tracking-[0.3em] px-4 py-2 rounded-lg ${t.cardBg}`}>
            {state.code}
          </div>
          <button
            type="button"
            onClick={() => navigator.clipboard?.writeText(state.code).catch(() => {})}
            className={`p-2 rounded-lg ${t.textSecondary}`}
            aria-label="Copy code"
            title="Copy code"
          >
            <Copy className="w-4 h-4" />
          </button>
          <span className={`text-sm ${t.textMuted}`}>
            Expires in {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
          </span>
        </div>
      ) : null}

      {expired && <p className={`text-sm mt-2 ${t.textMuted}`}>That code has expired.</p>}
      {state.error && <p className="text-sm mt-2 text-red-500">{state.error}</p>}

      <button
        onClick={generate}
        disabled={state.busy}
        className={`mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 ${t.pillBg}`}
      >
        <RefreshCw className={`w-4 h-4 ${state.busy ? "animate-spin" : ""}`} />
        {state.busy ? "Generating…" : state.code ? "Generate a new code" : "Generate a code"}
      </button>
    </div>
  );
}

export default function AccountTab() {
  const t = useThemeTokens();
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState(MODES.signin);
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

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);

    if (mode === MODES.worker) {
      const res = await account.workerJoin(email, workerCode, workerName);
      setBusy(false);
      if (!res.ok) return setError(res.message || "That didn't work. Try again.");
      setAccountGateDecision("signed-in");
      setEmail("");
      setWorkerCode("");
      setWorkerName("");
      setStatus(await account.status());
      return;
    }

    const res = mode === MODES.signup ? await account.signUp(email, password) : await account.signIn(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.message || "That didn't work. Try again.");
    if (res.needsConfirmation) {
      setNotice("Check your email to confirm the account, then sign in here.");
      setMode(MODES.signin);
      return;
    }
    setAccountGateDecision("signed-in");
    setEmail("");
    setPassword("");
    setStatus(await account.status());
  }

  async function signOut() {
    await account.signOut();
    setStatus(await account.status());
  }

  const input = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${t.inputBg}`;

  if (!status) return null;

  if (status.signedIn) {
    const isWorker = status.role === "worker";
    return (
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

          {/* Only the owner's own device hands out invites -- a worker's
              device has no password to protect anybody's access with, and
              letting one invite another would make the restriction pointless. */}
          {!isWorker && <InviteWorkerPanel />}

          <button
            onClick={signOut}
            className="mt-4 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-500 bg-red-500/10"
          >
            <LogOut className="w-4 h-4" /> Sign out of this device
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={`rounded-2xl p-6 ${t.cardBg}`}>
      <div className="flex items-center gap-3 mb-4">
        <Mail className={t.dark ? "text-amber-300" : "text-amber-500"} size={20} />
        <div>
          <h3 className={`font-semibold ${t.textPrimary}`}>Sign in to sync data</h3>
          <p className={`text-sm ${t.textSecondary}`}>
            You're running TechDesk locally. Sign in whenever you want this device ready to sync.
          </p>
        </div>
      </div>
      <form onSubmit={submit} className="flex flex-col gap-3 max-w-sm">
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} className={input} />
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
        {notice && <p className="text-sm text-emerald-500">{notice}</p>}
        <button
          type="submit"
          disabled={busy}
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 ${t.pillBg}`}
        >
          {busy
            ? "Working…"
            : mode === MODES.signup
            ? "Set up your business"
            : mode === MODES.worker
            ? "Connect to a business"
            : "Sign in"}
        </button>
        <div className="flex flex-col gap-1.5">
          {mode !== MODES.signin && (
            <button
              type="button"
              onClick={() => { setMode(MODES.signin); setError(""); setNotice(""); }}
              className={`text-sm text-left ${t.textSecondary}`}
            >
              Already have an account? Sign in
            </button>
          )}
          {mode !== MODES.signup && (
            <button
              type="button"
              onClick={() => { setMode(MODES.signup); setError(""); setNotice(""); }}
              className={`text-sm text-left ${t.textSecondary}`}
            >
              Setting up a new shop? Set up your business
            </button>
          )}
          {mode !== MODES.worker && (
            <button
              type="button"
              onClick={() => { setMode(MODES.worker); setError(""); setNotice(""); }}
              className={`text-sm text-left ${t.textSecondary}`}
            >
              Joining a shop that already has an account? Connect to a business
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
