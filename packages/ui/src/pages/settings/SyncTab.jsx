import React, { useCallback, useEffect, useState } from "react";
import {
  RefreshCw,
  CheckCircle2,
  Package,
  Wrench,
  UserRound,
  Phone,
  Plus,
  Unlink,
  ArrowUpRight,
  ArrowDownLeft,
  Users,
} from "lucide-react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { sync, SYNCABLE } from "../../lib/sync";

// Syncing with one other person.
//
// Not head office, and not sharing. You put your own number in once so people
// can reach you, then you type somebody else's, they read you the code, and
// the two of you are linked. Each of you ticks what YOU send over THAT link.
//
// Link three people in a row and it flows along the row: what B sends C
// includes what B got from A, because passing it on is what B ticked.

const KINDS = [
  {
    key: "product",
    label: "Stock",
    Icon: Package,
    what: "What you have on the shelf, and how many. They can see it and correct a count.",
  },
  {
    key: "repair",
    label: "Repairs",
    Icon: Wrench,
    what: "Tickets on your bench, so either of you can tell a customer where their phone is.",
  },
  {
    key: "customer",
    label: "Customers",
    Icon: UserRound,
    what: "Names and numbers, so the same customer is not typed in twice.",
  },
];

const kindName = (k) => KINDS.find((x) => x.key === k)?.label || k;

export default function SyncTab() {
  const t = useThemeTokens();
  const [state, setState] = useState(() => sync.status());
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  const reload = useCallback(async () => {
    const res = await sync.refresh();
    setState(sync.status());
    return res;
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

  async function toggle(link, kind) {
    const has = link.iSend.includes(kind);
    const next = has ? link.iSend.filter((k) => k !== kind) : [...link.iSend, kind];

    // Moved straight away, then corrected by whatever the server kept. A box
    // that waits for the network before it moves feels broken on a Nigerian
    // mobile connection, and this is a decision somebody made, not a request.
    setState((s) => ({
      ...s,
      links: s.links.map((l) => (l.id === link.id ? { ...l, iSend: next } : l)),
    }));
    setBusy(true);
    setNote("");

    const res = await sync.setKinds(link.id, next);
    setBusy(false);

    if (!res?.ok) {
      setState(sync.status());
      setNote(res?.message || "Couldn't save that. Check your internet and try again.");
      return;
    }
    setState(sync.status());
  }

  async function stop(link) {
    setBusy(true);
    setNote("");
    const res = await sync.unlink(link.id);
    setBusy(false);
    setState(sync.status());
    setNote(
      res?.ok
        ? `Stopped syncing with ${link.label}. Their records will come out of your lists on the next check.`
        : res?.message || "Couldn't stop that sync. Try again.",
    );
  }

  async function checkNow() {
    setBusy(true);
    setNote("");
    const res = await sync.pullAndPrune();
    setBusy(false);
    setState(sync.status());
    if (!res?.ok) {
      setNote(res?.message || "Couldn't check just now.");
      return;
    }
    setNote(
      res.received === 0
        ? "Nothing new."
        : `${res.added} new, ${res.updated} updated, ${res.removed} removed.`,
    );
  }

  if (!state.registered) {
    return <RegisterCard onDone={reload} />;
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center gap-3 mb-1">
          <Phone className={`w-5 h-5 ${t.textSecondary}`} />
          <h3 className={`font-semibold ${t.textPrimary}`}>Your sync number</h3>
        </div>
        <p className={`text-sm ${t.textSecondary}`}>
          <b className={t.textPrimary}>{state.phone}</b> &mdash; this is what somebody types
          into their TechDesk to sync with you. When they do, we text the code here and you
          read it out to them.
        </p>
      </div>

      <PairCard onDone={reload} />

      <ReachingCard reaching={state.reaching} />

      {state.links.length === 0 ? (
        <div className={`rounded-2xl p-6 ${t.cardBg}`}>
          <p className={`text-sm ${t.textSecondary}`}>
            You aren&rsquo;t syncing with anybody yet. Put their number in above, or give
            them yours.
          </p>
        </div>
      ) : (
        state.links.map((link) => (
          <div key={link.id} className={`rounded-2xl p-6 ${t.cardBg}`}>
            <div className="flex items-start justify-between gap-3 mb-4 flex-wrap">
              <div className="min-w-0">
                <h3 className={`font-semibold ${t.textPrimary}`}>{link.label}</h3>
                <p className={`text-xs ${t.textMuted}`}>{link.phone}</p>
              </div>
              <button
                onClick={() => stop(link)}
                disabled={busy}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold ${t.pillBg} ${
                  busy ? "opacity-60" : ""
                }`}
              >
                <Unlink className="w-3.5 h-3.5" /> Stop syncing
              </button>
            </div>

            <div className={`text-xs font-semibold mb-2 flex items-center gap-1.5 ${t.textSecondary}`}>
              <ArrowUpRight className="w-3.5 h-3.5" /> What you send them
            </div>
            <div className="flex flex-col gap-2">
              {KINDS.map(({ key, label, Icon, what }) => {
                const on = link.iSend.includes(key);
                return (
                  <button
                    key={key}
                    onClick={() => toggle(link, key)}
                    disabled={busy}
                    className={`flex items-start gap-3 text-left p-4 rounded-xl border transition-colors ${
                      on ? "border-blue-500/60 bg-blue-500/5" : `border-transparent ${t.pillBg}`
                    }`}
                  >
                    <div
                      className={`w-5 h-5 mt-0.5 rounded-md shrink-0 flex items-center justify-center ${
                        on ? "bg-blue-500 text-white" : t.dark ? "bg-slate-700" : "bg-slate-200"
                      }`}
                      aria-hidden="true"
                    >
                      {on && <CheckCircle2 className="w-4 h-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className={`text-sm font-semibold flex items-center gap-2 ${t.textPrimary}`}>
                        <Icon className="w-4 h-4 shrink-0" /> {label}
                      </div>
                      <div className={`text-xs mt-0.5 ${t.textSecondary}`}>{what}</div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div className={`text-xs font-semibold mt-5 mb-1 flex items-center gap-1.5 ${t.textSecondary}`}>
              <ArrowDownLeft className="w-3.5 h-3.5" /> What they send you
            </div>
            {/* Stated, not ticked. What comes the other way is their decision,
                made on their own screen, and a box here that could not change
                it would be a lie the shape of a control. */}
            <p className={`text-xs ${t.textMuted}`}>
              {link.theySend.length === 0
                ? "Nothing yet. They choose that on their own device."
                : link.theySend.map(kindName).join(", ")}
            </p>
          </div>
        ))
      )}

      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold ${t.textPrimary}`}>Checking</h3>
        {/* What it found, not just that it looked. "Last checked 10:42" on its
            own is the line people stare at wondering whether syncing works. */}
        <p className={`text-sm mt-1 mb-4 ${t.textSecondary}`}>
          {state.lastPullAt ? (
            <>
              Last checked {timeAgo(state.lastPullAt)}
              {state.received > 0
                ? `, and brought in ${state.received} ${state.received === 1 ? "change" : "changes"}.`
                : ", with nothing new."}
            </>
          ) : (
            "Not checked yet."
          )}{" "}
          This happens on its own while the app is open. Your takings are never synced.
        </p>
        <button
          onClick={checkNow}
          disabled={busy}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg} ${
            busy ? "opacity-60" : ""
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Check now
        </button>
        {note && <p className={`text-xs mt-3 ${t.textMuted}`}>{note}</p>}

        {SYNCABLE.length !== KINDS.length && (
          /* If the two ever drift, this screen is missing a box the server
             would accept -- worth saying so rather than quietly syncing less
             than was asked for. */
          <p className="text-xs mt-3 text-amber-500">
            This build knows about {KINDS.length} of {SYNCABLE.length} syncable kinds.
          </p>
        )}
      </div>
    </div>
  );
}

/**
 * Everybody whose records reach this device.
 *
 * Not the same list as the links below it, and that is the point. You link to
 * one person; what arrives is whatever THEY pass on, including what they were
 * given by somebody further along. A shop linked only to the bench next door
 * could be reading a third shop's stock and have no way to know it.
 *
 * So the ones you set up yourself are marked as yours, and the ones that
 * arrive down the chain say so. Cutting a link you own is on its card below;
 * a name here that is not yours to cut is a fact about the chain, and the
 * person to take it up with is the link it came through.
 */
function ReachingCard({ reaching }) {
  const t = useThemeTokens();
  const list = reaching || [];
  if (list.length === 0) return null;

  const indirect = list.filter((r) => !r.direct).length;

  return (
    <div className={`rounded-2xl p-6 ${t.cardBg}`}>
      <div className="flex items-center gap-3 mb-1">
        <Users className={`w-5 h-5 ${t.textSecondary}`} />
        <h3 className={`font-semibold ${t.textPrimary}`}>
          Syncing with you{list.length > 1 ? ` \u00b7 ${list.length}` : ""}
        </h3>
      </div>
      <p className={`text-sm mb-4 ${t.textSecondary}`}>
        {indirect === 0
          ? "Everyone here is a link you set up."
          : `${indirect} of these ${indirect === 1 ? "reaches" : "reach"} you through somebody you are linked to, not directly.`}
      </p>

      <ul className="flex flex-col gap-2">
        {list.map((r) => (
          <li
            key={r.id}
            className={`flex items-start justify-between gap-3 p-3 rounded-xl flex-wrap ${t.pillBg}`}
          >
            <div className="min-w-0">
              <div className={`text-sm font-semibold ${t.textPrimary}`}>{r.label}</div>
              <div className={`text-xs mt-0.5 ${t.textSecondary}`}>
                {(r.kinds || []).map(kindName).join(", ") || "Nothing yet"}
              </div>
            </div>
            <span
              className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${
                r.direct
                  ? "bg-blue-500/10 text-blue-500"
                  : t.dark
                    ? "bg-white/5 text-slate-400"
                    : "bg-slate-200 text-slate-600"
              }`}
            >
              {r.direct ? "Your link" : "Down the chain"}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** "2 minutes ago", because a timestamp is not an answer to "is this working". */
function timeAgo(iso) {
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return "just now";
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (secs < 60) return "just now";
  const mins = Math.round(secs / 60);
  if (mins < 60) return `${mins} minute${mins === 1 ? "" : "s"} ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleString();
}

/** Putting your own number in, so other people can reach you. */
function RegisterCard({ onDone }) {
  const t = useThemeTokens();
  const [step, setStep] = useState("idle");
  const [phone, setPhone] = useState("");
  const [label, setLabel] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(null);
  const [error, setError] = useState("");

  async function askForCode(e) {
    e.preventDefault();
    setError("");
    setStep("working");
    const res = await sync.registerStart(phone.trim(), label.trim());
    if (!res?.ok) {
      setStep("idle");
      setError(res?.message || "Couldn't send the code. Try again.");
      return;
    }
    setSent(res);
    setStep("code");
  }

  async function submitCode(e) {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError("");
    setStep("working");
    const res = await sync.registerVerify({ state: sent.state, otpId: sent.otpId, code });
    if (!res?.ok) {
      setStep("code");
      setError(res?.message || "That didn't work. Try again.");
      return;
    }
    await onDone();
  }

  const input = `w-full px-4 py-3 rounded-xl text-sm ${t.pillBg} ${t.textPrimary}`;

  return (
    <div className={`rounded-2xl p-6 ${t.cardBg}`}>
      <div className="flex items-center gap-3 mb-1">
        <Phone className={`w-5 h-5 ${t.textSecondary}`} />
        <h3 className={`font-semibold ${t.textPrimary}`}>Sync with another device</h3>
      </div>
      <p className={`text-sm mb-5 ${t.textSecondary}`}>
        Two people, each with their own TechDesk, working off each other&rsquo;s stock,
        repairs and customers. Put your number in first &mdash; it&rsquo;s what the other
        person types to find you. We text a code to it to make sure it is yours.
      </p>

      {step === "code" ? (
        <form onSubmit={submitCode}>
          <p className={`text-sm mb-4 ${t.textSecondary}`}>
            We texted a 6-digit code to <b className={t.textPrimary}>{sent?.phone}</b>.
          </p>
          <input
            className={`${input} text-center text-2xl font-semibold tracking-[0.4em] mb-4`}
            inputMode="numeric"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <button
            type="submit"
            disabled={step === "working"}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg} ${
              step === "working" ? "opacity-60" : ""
            }`}
          >
            <CheckCircle2 className="w-4 h-4" /> {step === "working" ? "Checking…" : "Confirm"}
          </button>
        </form>
      ) : (
        <form onSubmit={askForCode}>
          <label className="block mb-4">
            <span className={`block text-xs font-semibold mb-2 ${t.textSecondary}`}>
              Your number
            </span>
            <input
              className={input}
              inputMode="tel"
              placeholder="08012345678"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </label>
          <label className="block mb-4">
            <span className={`block text-xs font-semibold mb-2 ${t.textSecondary}`}>
              What to call this device
            </span>
            <input
              className={input}
              placeholder="The Samsung bench"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
            <span className={`block text-xs mt-2 ${t.textMuted}`}>
              What the other person sees your records marked as.
            </span>
          </label>
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <button
            type="submit"
            disabled={step === "working"}
            className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg} ${
              step === "working" ? "opacity-60" : ""
            }`}
          >
            <Phone className="w-4 h-4" /> {step === "working" ? "Sending…" : "Text me a code"}
          </button>
        </form>
      )}
    </div>
  );
}

/** Typing somebody else's number, and the code they read out. */
function PairCard({ onDone }) {
  const t = useThemeTokens();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState("idle");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(null);
  const [error, setError] = useState("");

  function reset() {
    setOpen(false);
    setStep("idle");
    setPhone("");
    setCode("");
    setSent(null);
    setError("");
  }

  async function askForCode(e) {
    e.preventDefault();
    setError("");
    setStep("working");
    const res = await sync.pairStart(phone.trim());
    if (!res?.ok) {
      setStep("idle");
      setError(res?.message || "Couldn't send the code. Try again.");
      return;
    }
    setSent(res);
    setStep("code");
  }

  async function submitCode(e) {
    e.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError("");
    setStep("working");
    const res = await sync.pairVerify({ state: sent.state, otpId: sent.otpId, code });
    if (!res?.ok) {
      setStep("code");
      setError(res?.message || "That didn't work. Try again.");
      return;
    }
    reset();
    await onDone();
  }

  const input = `w-full px-4 py-3 rounded-xl text-sm ${t.pillBg} ${t.textPrimary}`;

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className={`flex items-center gap-2 px-4 py-3 rounded-2xl text-sm font-semibold ${t.cardBg} ${t.textPrimary}`}
      >
        <Plus className="w-4 h-4" /> Sync with somebody
      </button>
    );
  }

  return (
    <div className={`rounded-2xl p-6 ${t.cardBg}`}>
      <h3 className={`font-semibold mb-1 ${t.textPrimary}`}>Sync with somebody</h3>
      {step === "code" ? (
        <form onSubmit={submitCode} className="mt-4">
          <p className={`text-sm mb-4 ${t.textSecondary}`}>
            We texted a 6-digit code to <b className={t.textPrimary}>{sent?.phone}</b>
            {sent?.label ? <> &mdash; {sent.label}</> : null}. Ring them and ask for it.
          </p>
          <input
            className={`${input} text-center text-2xl font-semibold tracking-[0.4em] mb-4`}
            inputMode="numeric"
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
            autoFocus
          />
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <div className="flex gap-3 flex-wrap">
            <button
              type="submit"
              disabled={step === "working"}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg} ${
                step === "working" ? "opacity-60" : ""
              }`}
            >
              <CheckCircle2 className="w-4 h-4" /> Link us
            </button>
            <button
              type="button"
              onClick={reset}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg}`}
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <form onSubmit={askForCode} className="mt-4">
          <p className={`text-sm mb-4 ${t.textSecondary}`}>
            Their number, the one they put into TechDesk. The code goes to{" "}
            <b className={t.textPrimary}>them</b>, not to you &mdash; ring them and they read
            it out.
          </p>
          <input
            className={`${input} mb-4`}
            inputMode="tel"
            placeholder="08012345678"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            autoFocus
          />
          {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
          <div className="flex gap-3 flex-wrap">
            <button
              type="submit"
              disabled={step === "working"}
              className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg} ${
                step === "working" ? "opacity-60" : ""
              }`}
            >
              <Phone className="w-4 h-4" /> {step === "working" ? "Sending…" : "Send them a code"}
            </button>
            <button
              type="button"
              onClick={reset}
              className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg}`}
            >
              Cancel
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
