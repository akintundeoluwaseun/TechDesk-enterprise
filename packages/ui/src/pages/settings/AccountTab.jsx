import React, { useEffect, useState } from "react";
import { Cloud, LogOut, Mail, RefreshCw } from "lucide-react";
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

export default function AccountTab() {
  const t = useThemeTokens();
  const [status, setStatus] = useState(null);
  const [mode, setMode] = useState("signin"); // signin | signup
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
    const res = mode === "signup" ? await account.signUp(email, password) : await account.signIn(email, password);
    setBusy(false);
    if (!res.ok) return setError(res.message || "That didn't work. Try again.");
    if (res.needsConfirmation) {
      setNotice("Check your email to confirm the account, then sign in here.");
      setMode("signin");
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
    return (
      <div className="flex flex-col gap-5">
        <div className={`rounded-2xl p-6 ${t.cardBg}`}>
          <div className="flex items-center gap-3">
            <Cloud className="text-emerald-500" size={20} />
            <div>
              <h3 className={`font-semibold ${t.textPrimary}`}>Signed in</h3>
              <p className={`text-sm ${t.textSecondary}`}>{status.email}</p>
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
          className={`px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 ${t.pillBg}`}
        >
          {busy ? "Working…" : mode === "signup" ? "Create account" : "Sign in"}
        </button>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signup" ? "signin" : "signup");
            setError("");
            setNotice("");
          }}
          className={`text-sm text-left ${t.textSecondary}`}
        >
          {mode === "signup" ? "Already have an account? Sign in" : "New here? Create an account"}
        </button>
      </form>
    </div>
  );
}
