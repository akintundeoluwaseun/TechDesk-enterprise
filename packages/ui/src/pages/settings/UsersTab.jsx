import React, { useEffect, useState } from "react";
import { UserPlus, KeyRound, Pencil, Trash2, Check, X, RefreshCw, Copy } from "lucide-react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { useSettings } from "../../lib/SettingsContext";
import { db } from "../../lib/db";
import { account } from "../../lib/account";
import PinRecoverySetup from "../../components/PinRecoverySetup";
import SettingsModal, { SettingsRow } from "../../components/SettingsModal";
import { isConfigured as pinRecoveryConfigured } from "../../lib/pinRecovery";
import { currentStaffLimit, tierLabel, nextTier } from "../../lib/tier";
import { TIER_META } from "@techdesk/editions";
import { IS_DESKTOP_APP } from "../../lib/platform";

function toggleRole0(draft, setDraft, r) {
  setDraft((d) => {
    if (d.role === "both") return { ...d, role: r === "seller" ? "repairer" : "seller" };
    if (d.role !== r) return { ...d, role: "both" };
    return d;
  });
}

// The only three pages an online worker can ever be granted -- kept in step
// with AuthContext.jsx's WORKER_PAGES, which is what actually enforces this
// once the worker's device is running.
const PAGE_OPTIONS = [
  { key: "sales", label: "Sales" },
  { key: "repairs", label: "Repairs" },
  { key: "inventory", label: "Inventory" },
];
const PAGE_LABELS = Object.fromEntries(PAGE_OPTIONS.map((o) => [o.key, o.label]));

function pagesLabel(pages) {
  if (!Array.isArray(pages) || !pages.length) return "Sales, Repairs, Inventory";
  return pages.map((p) => PAGE_LABELS[p] || p).join(", ");
}

/**
 * Generates the code an owner reads out to an online worker, and counts down
 * until it expires -- a code with no visible clock reads as though it never
 * expires at all, which is not true and not meant to be.
 *
 * Which pages that worker gets is picked here, per worker, before the code
 * even exists -- not automatic, and not the same for everyone the shop
 * invites. A worker without "Inventory" ticked never sees a stock value or
 * an Inventory tab at all; a worker without "Sales" never sees the till.
 */
function InviteWorkerPanel() {
  const t = useThemeTokens();
  // Nothing is picked until the shop actually checks it -- narrowing access
  // is the point of this screen, and a box that starts ticked reads as
  // decided for you rather than something you chose.
  const [pages, setPages] = useState([]);
  const [state, setState] = useState({ code: null, expiresAt: null, busy: false, error: "" });
  const [grantedPages, setGrantedPages] = useState(null);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!state.expiresAt) return undefined;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [state.expiresAt]);

  function togglePage(key) {
    setPages((prev) => (prev.includes(key) ? prev.filter((p) => p !== key) : [...prev, key]));
  }

  async function generate() {
    if (!pages.length) {
      setState((s) => ({ ...s, error: "Pick at least one page for this worker." }));
      return;
    }
    setState((s) => ({ ...s, busy: true, error: "" }));
    const res = await account.inviteStart(pages);
    if (!res.ok) {
      setState({ code: null, expiresAt: null, busy: false, error: res.message || "Couldn't generate a code. Try again." });
      return;
    }
    setGrantedPages(res.pages || pages);
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
    <div className={`rounded-xl p-4 ${t.insetBg}`}>
      <div className="flex items-center gap-2">
        <UserPlus className={`w-4 h-4 ${t.textSecondary}`} />
        <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>Invite a worker</div>
      </div>
      <p className={`text-sm mt-1 ${t.textSecondary}`}>
        A worker's own device can read and write only the pages you pick below -- without ever
        being given this email's password. Generate a code and read it out to them; they'll enter
        this shop's email, the code, and their own name.
      </p>

      <div className={`text-xs font-semibold uppercase tracking-wider mt-4 mb-2 ${t.textMuted}`}>
        This worker can open
      </div>
      <div className="flex flex-wrap gap-4">
        {PAGE_OPTIONS.map((opt) => {
          const checked = pages.includes(opt.key);
          return (
            <label key={opt.key} className="flex items-center gap-2 cursor-pointer">
              <span
                className={`w-5 h-5 rounded-md flex items-center justify-center shrink-0 ${
                  checked ? "bg-emerald-500" : t.dark ? "border border-white/20" : "border border-neutral-300"
                }`}
              >
                {checked && <Check className="w-3.5 h-3.5 text-white" strokeWidth={3} />}
              </span>
              <input
                type="checkbox"
                className="sr-only"
                checked={checked}
                onChange={() => togglePage(opt.key)}
              />
              <span className={`text-sm font-medium ${t.textPrimary}`}>{opt.label}</span>
            </label>
          );
        })}
      </div>

      {state.code && !expired ? (
        <div className="mt-3">
          <p className={`text-xs mb-2 ${t.textMuted}`}>
            This code gives access to: {(grantedPages || pages).map((p) => PAGE_LABELS[p]).join(", ")}
          </p>
          <div className="flex items-center gap-3">
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
        </div>
      ) : null}

      {expired && <p className={`text-sm mt-2 ${t.textMuted}`}>That code has expired.</p>}
      {state.error && <p className="text-sm mt-2 text-red-500">{state.error}</p>}

      <button
        onClick={generate}
        disabled={state.busy || !pages.length}
        className={`mt-3 flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-60 ${t.pillBg}`}
      >
        <RefreshCw className={`w-4 h-4 ${state.busy ? "animate-spin" : ""}`} />
        {state.busy ? "Generating…" : state.code ? "Generate a new code" : "Generate a code"}
      </button>
    </div>
  );
}

/**
 * Everyone connected to this shop's cloud account right now, and a way to
 * cut one off. Generating a code says nothing about who redeemed it or
 * whether they still should be able to -- this is the other half: the list
 * an admin actually checks against, and the one button that undoes an
 * invite once it has been used.
 *
 * One popup for the whole online side of "adding a user" -- invite and
 * manage sit together here, separate from the local, this-device-only
 * users below, because they are answering a different question: who can
 * reach this shop's records from somewhere else, not who can sign in at
 * this counter.
 */
function OnlineWorkersModal({ onClose, accountStatus }) {
  const t = useThemeTokens();
  const [state, setState] = useState({ loading: true, workers: [], error: "" });
  const [busyId, setBusyId] = useState(null);

  const signedIn = Boolean(accountStatus?.signedIn);
  const isWorkerDevice = signedIn && accountStatus.role === "worker";
  const canManage = signedIn && !isWorkerDevice;

  useEffect(() => {
    if (!canManage) return undefined;
    let cancelled = false;
    account.listWorkers().then((res) => {
      if (cancelled) return;
      if (!res.ok) {
        setState({ loading: false, workers: [], error: res.message || "Couldn't load your workers." });
        return;
      }
      setState({ loading: false, workers: res.workers || [], error: "" });
    });
    return () => {
      cancelled = true;
    };
  }, [canManage]);

  async function disconnect(worker) {
    if (
      !window.confirm(`Disconnect ${worker.name}? They lose access to this shop's data immediately.`)
    ) {
      return;
    }
    setBusyId(worker.id);
    const res = await account.revokeWorker(worker.id);
    setBusyId(null);
    if (!res.ok) {
      window.alert(res.message || "Couldn't disconnect them. Try again.");
      return;
    }
    setState((s) => ({ ...s, workers: s.workers.filter((w) => w.id !== worker.id) }));
  }

  return (
    <SettingsModal
      title="Online workers"
      description="Anyone connected to this shop's cloud account from their own device -- invite one, see what each can open, and disconnect one immediately if you need to."
      onClose={onClose}
    >
      {!signedIn && (
        <div className={`rounded-xl p-4 ${t.insetBg}`}>
          <p className={`text-sm ${t.textSecondary}`}>
            This device isn't signed into the shop's cloud account yet. Sign in (or set one up) from the
            Account tab, then come back here to invite a worker.
          </p>
        </div>
      )}

      {isWorkerDevice && (
        <div className={`rounded-xl p-4 ${t.insetBg}`}>
          <p className={`text-sm ${t.textSecondary}`}>
            A worker's own device can't invite or manage another worker -- only the owner's device can.
          </p>
        </div>
      )}

      {canManage && (
        <div className="flex flex-col gap-6">
          <InviteWorkerPanel />

          <div>
            <div className={`text-xs uppercase tracking-wider mb-2 ${t.textMuted}`}>Connected now</div>
            {state.loading && <p className={`text-sm ${t.textSecondary}`}>Loading…</p>}
            {state.error && <p className="text-sm text-red-500">{state.error}</p>}
            {!state.loading && !state.error && state.workers.length === 0 && (
              <p className={`text-sm ${t.textSecondary}`}>No workers connected yet.</p>
            )}
            <div className="flex flex-col gap-3">
              {state.workers.map((w) => (
                <div key={w.id} className={`flex items-center justify-between gap-3 rounded-xl p-4 ${t.insetBg}`}>
                  <div className="min-w-0">
                    <div className={`font-semibold truncate ${t.textPrimary}`}>{w.name}</div>
                    <div className={`text-xs mt-0.5 ${t.textMuted}`}>Can open: {pagesLabel(w.pages)}</div>
                    {w.joinedAt && (
                      <div className={`text-xs ${t.textMuted}`}>Joined {new Date(w.joinedAt).toLocaleDateString()}</div>
                    )}
                  </div>
                  <button
                    onClick={() => disconnect(w)}
                    disabled={busyId === w.id}
                    className="shrink-0 px-3 py-2 rounded-lg text-sm font-semibold text-red-500 bg-red-500/10 disabled:opacity-60"
                  >
                    {busyId === w.id ? "Disconnecting…" : "Disconnect"}
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </SettingsModal>
  );
}

export default function UsersTab() {
  const t = useThemeTokens();
  const { settings, updateSettings } = useSettings();
  const [users, setUsers] = useState(() => db.getUsers());
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [role, setRole] = useState("seller");
  const [adminPin, setAdminPin] = useState("");
  const [editingId, setEditingId] = useState(null);
  const [editDraft, setEditDraft] = useState({});
  const [localOpen, setLocalOpen] = useState(false);
  const [onlineOpen, setOnlineOpen] = useState(false);
  const [pinRecoveryOpen, setPinRecoveryOpen] = useState(false);
  // Whether this device is signed into the shop's cloud account at all, and
  // whether it is the owner's device or a worker's -- a worker's device has
  // no password to protect anybody's access with, so it never gets to invite
  // another one. Fetched here, separately from Account's own copy: there is
  // no shared "am I signed in" store yet, and this tab only needs to know
  // whether to offer the online-workers button at all.
  const [accountStatus, setAccountStatus] = useState(null);

  useEffect(() => {
    account.status().then(setAccountStatus);
  }, []);

  function refresh() {
    setUsers(db.getUsers());
  }

  const staffLimit = currentStaffLimit();
  // +1 for the admin, who is a person behind the counter too.
  const atLimit = users.length + 1 >= staffLimit;

  function toggleRole(r) {
    if (role === "both") {
      setRole(r === "seller" ? "repairer" : "seller");
    } else if (role !== r) {
      setRole("both");
    }
  }

  function handleAddUser() {
    if (!name || pin.length < 4) return;
    // The admin counts. A shop on Business buys three people behind the
    // counter, and the owner is one of them.
    if (users.length + 1 >= staffLimit) return;
    db.addUser({ name, email, pin, role });
    db.logActivity({ type: "settings", message: `${name} added as ${role}` });
    setName("");
    setEmail("");
    setPin("");
    setRole("seller");
    refresh();
  }

  function handleSetAdminPin() {
    if (adminPin.length < 4) return;
    updateSettings({ adminPin });
    setAdminPin("");
  }

  function startEdit(u) {
    setEditingId(u.id);
    setEditDraft({ name: u.name, email: u.email, role: u.role, pin: u.pin });
  }

  function saveEdit(id) {
    db.updateUser(id, editDraft);
    setEditingId(null);
    refresh();
  }

  function handleDeleteUser(id, userName) {
    db.deleteUser(id);
    db.logActivity({ type: "settings", message: `${userName} removed` });
    refresh();
  }

  // A hint on the row itself, so "why can't I see a way to add one" is
  // answered before the popup is even opened, not just inside it.
  const onlineWorkersHint = !accountStatus?.signedIn
    ? "Sign in from Account first"
    : accountStatus.role === "worker"
    ? "Not on a worker's own device"
    : undefined;

  return (
    <div className="flex flex-col gap-5">
      {/* A phone is one person's own device, not a shared counter -- the
          whole local PIN system (several staff switching who's signed in on
          the same machine) is a desktop-counter idea with nothing to gate
          on a phone. AuthContext's pinRequired() already never asks for one
          here regardless of this setting; showing the toggle and the local
          user list anyway would just be controls for a screen that can't
          appear. Online workers (below) is a different system -- a cloud
          account this phone connects to -- and stays exactly as it was. */}
      {IS_DESKTOP_APP && (
        <>
          <div className={`rounded-2xl p-6 ${t.cardBg}`}>
            <div className="flex items-center justify-between">
              <div>
                <h3 className={`font-semibold ${t.textPrimary}`}>Require PIN sign-in</h3>
                <p className={`text-sm ${t.textSecondary}`}>
                  When off, the app opens straight to the Dashboard as Admin — no lock screen.
                </p>
              </div>
              <button
                onClick={() => updateSettings({ requirePin: !settings.requirePin })}
                className={`w-12 h-7 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${
                  settings.requirePin ? "bg-emerald-500 justify-end" : t.dark ? "bg-white/15 justify-start" : "bg-neutral-300 justify-start"
                }`}
              >
                <span className="w-6 h-6 rounded-full bg-white block" />
              </button>
            </div>
          </div>

          <SettingsRow
            title="If you forget your PIN"
            description="Answer a few questions at the lock screen to set a new PIN -- the only way back in, since TechDesk has no email and may have no internet."
            value={pinRecoveryConfigured() ? "Questions set" : "Nothing set yet"}
            onOpen={() => setPinRecoveryOpen(true)}
            actionLabel="Manage"
          />

          <SettingsRow
            title="Local users"
            description="Sellers, repairers, or both, each with their own PIN from the user switch screen on this device."
            value={
              staffLimit === Infinity
                ? "Unlimited staff accounts"
                : `${users.length + 1} of ${staffLimit} staff accounts`
            }
            onOpen={() => setLocalOpen(true)}
            actionLabel="Manage local users"
          />
        </>
      )}

      <SettingsRow
        title="Online workers"
        description="Invited by code, working from their own device on this shop's cloud account."
        value={onlineWorkersHint}
        onOpen={() => setOnlineOpen(true)}
        actionLabel="Manage online workers"
      />

      {pinRecoveryOpen && (
        <SettingsModal title="PIN recovery" onClose={() => setPinRecoveryOpen(false)}>
          <PinRecoverySetup />
        </SettingsModal>
      )}

      {localOpen && (
        <SettingsModal
          title="Local users"
          description="Add sellers, repairers, or both. Each user signs in with their own PIN from the user switch screen. Sellers see Sales + Inventory, repairers see Repairs + Inventory. Only the admin sees dashboard, logs, cost prices and settings."
          onClose={() => setLocalOpen(false)}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label htmlFor="new-user-name" className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Full name</label>
              <input
                id="new-user-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
              />
            </div>
            <div>
              <label htmlFor="new-user-email" className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Email (optional)</label>
              <input
                id="new-user-email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
              />
            </div>
          </div>

          <div className="mb-4">
            <label htmlFor="new-user-pin" className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>PIN (4-6 digits)</label>
            <input
              id="new-user-pin"
              value={pin}
              onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>

          <div className="flex items-center gap-6 mb-5">
            <button onClick={() => toggleRole("seller")} className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  role === "seller" || role === "both" ? "bg-emerald-500" : t.dark ? "border border-white/20" : "border border-neutral-300"
                }`}
              >
                {(role === "seller" || role === "both") && <span className="w-2 h-2 rounded-full bg-white" />}
              </span>
              <span className={`text-sm ${t.textPrimary}`}>Seller</span>
            </button>
            <button onClick={() => toggleRole("repairer")} className="flex items-center gap-2">
              <span
                className={`w-5 h-5 rounded-full flex items-center justify-center ${
                  role === "repairer" || role === "both" ? "bg-emerald-500" : t.dark ? "border border-white/20" : "border border-neutral-300"
                }`}
              >
                {(role === "repairer" || role === "both") && <span className="w-2 h-2 rounded-full bg-white" />}
              </span>
              <span className={`text-sm ${t.textPrimary}`}>Repairer</span>
            </button>
          </div>

          <button
            onClick={handleAddUser}
            disabled={atLimit}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold mb-6 ${t.pillBg} ${
              atLimit ? "opacity-60 cursor-not-allowed" : ""
            }`}
          >
            <UserPlus className="w-4 h-4" /> Add user
          </button>

          {/* Say which plan holds more, not just that this one is full. A shop
              that has hired someone and cannot add them needs to know what to
              do about it, today, not that the button is broken. */}
          {atLimit && (
            <p className={`-mt-4 mb-6 text-sm ${t.textSecondary}`}>
              That is every account {tierLabel()} includes.{" "}
              {nextTier() ? `${TIER_META[nextTier()].label} adds more.` : ""}
            </p>
          )}

          <div className={`rounded-2xl p-5 mb-4 ${t.insetBg}`}>
            <div className={`font-semibold ${t.textPrimary}`}>Admin</div>
            <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 mb-1 ${t.pillBg}`}>admin</span>
            <p className={`text-xs mb-3 ${t.textMuted}`}>
              {settings.adminPin ? "Custom PIN set." : "Default PIN is 0000 until you set a custom one."}
            </p>
            <div className="flex items-center gap-3">
              <input
                value={adminPin}
                onChange={(e) => setAdminPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="New PIN"
                className={`rounded-xl px-4 py-2.5 text-sm outline-none flex-1 ${t.inputBg}`}
              />
              <button
                onClick={handleSetAdminPin}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-medium ${t.pillBg}`}
              >
                <KeyRound className="w-4 h-4" /> Set PIN
              </button>
            </div>
          </div>

          {users.length > 0 && (
            <div className="flex flex-col gap-3">
              {users.map((u) => (
                <div key={u.id} className={`rounded-2xl p-5 ${t.insetBg}`}>
                  {editingId === u.id ? (
                    <div className="flex flex-col gap-3">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          value={editDraft.name}
                          onChange={(e) => setEditDraft((d) => ({ ...d, name: e.target.value }))}
                          className={`rounded-xl px-3 py-2 text-sm outline-none ${t.inputBg}`}
                        />
                        <input
                          value={editDraft.pin}
                          onChange={(e) => setEditDraft((d) => ({ ...d, pin: e.target.value.replace(/\D/g, "").slice(0, 6) }))}
                          placeholder="PIN"
                          className={`rounded-xl px-3 py-2 text-sm outline-none ${t.inputBg}`}
                        />
                      </div>
                      <div className="flex items-center gap-4">
                        <button onClick={() => toggleRole0(editDraft, setEditDraft, "seller")} className="flex items-center gap-2">
                          <span
                            className={`w-4 h-4 rounded-full flex items-center justify-center ${
                              editDraft.role === "seller" || editDraft.role === "both"
                                ? "bg-emerald-500"
                                : t.dark
                                ? "border border-white/20"
                                : "border border-neutral-300"
                            }`}
                          />
                          <span className={`text-xs ${t.textPrimary}`}>Seller</span>
                        </button>
                        <button onClick={() => toggleRole0(editDraft, setEditDraft, "repairer")} className="flex items-center gap-2">
                          <span
                            className={`w-4 h-4 rounded-full flex items-center justify-center ${
                              editDraft.role === "repairer" || editDraft.role === "both"
                                ? "bg-emerald-500"
                                : t.dark
                                ? "border border-white/20"
                                : "border border-neutral-300"
                            }`}
                          />
                          <span className={`text-xs ${t.textPrimary}`}>Repairer</span>
                        </button>
                        <div className="flex-1" />
                        <button onClick={() => saveEdit(u.id)} className="text-emerald-500">
                          <Check className="w-4 h-4" />
                        </button>
                        <button onClick={() => setEditingId(null)} className={t.textMuted}>
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <div>
                        <div className={`font-semibold ${t.textPrimary}`}>{u.name}</div>
                        <span className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full mt-1 ${t.pillBg}`}>{u.role}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <button onClick={() => startEdit(u)} className={t.textSecondary}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button onClick={() => handleDeleteUser(u.id, u.name)} className="text-red-500">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </SettingsModal>
      )}

      {onlineOpen && (
        <OnlineWorkersModal onClose={() => setOnlineOpen(false)} accountStatus={accountStatus} />
      )}
    </div>
  );
}
