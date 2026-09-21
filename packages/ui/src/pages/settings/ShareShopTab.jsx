import React, { useEffect, useState } from "react";
import { Users, RefreshCw, CheckCircle2, Package, Wrench, UserRound } from "lucide-react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { shop, SHAREABLE } from "../../lib/shop";
import { hq } from "../../lib/hq";

// Sharing with the rest of the shop.
//
// The shop this is for has a Samsung bench and an iPhone bench. Each keeps
// its own stock, because it IS different stock; what they wanted is for
// whoever is running the shop to see both, and to fix a wrong count without
// walking over to the other bench.
//
// So this screen is three boxes and nothing else. What is NOT here is who to
// share with: it is one shop, everybody in it is a worker, and a per-person
// grid of permissions for a shop of three people is a screen nobody would
// ever open twice.

const KINDS = [
  {
    key: "product",
    label: "Stock",
    Icon: Package,
    what: "What you have on the shelf, and how many. The rest of the shop can see it and correct a count.",
  },
  {
    key: "repair",
    label: "Repairs",
    Icon: Wrench,
    what: "Tickets on your bench, so anyone can tell a customer where their phone is.",
  },
  {
    key: "customer",
    label: "Customers",
    Icon: UserRound,
    what: "Names and numbers, so the same customer is not typed in twice at two benches.",
  },
];

export default function ShareShopTab() {
  const t = useThemeTokens();
  const [state, setState] = useState(() => shop.status());
  const [connected, setConnected] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    hq.status().then((s) => setConnected(Boolean(s?.connected)));
  }, []);

  async function toggle(kind) {
    const has = state.kinds.includes(kind);
    const next = has ? state.kinds.filter((k) => k !== kind) : [...state.kinds, kind];

    // Shown straight away, then corrected by whatever the server kept. A box
    // that waits for the network before it moves feels broken on a Nigerian
    // mobile connection, and this is a decision the shop made, not a request.
    setState((s) => ({ ...s, kinds: next }));
    setBusy(true);
    setNote("");

    const res = await shop.setSharing(next);
    setBusy(false);

    if (!res?.ok) {
      setState(shop.status());
      setNote(res?.message || "Couldn't save that. Check your internet and try again.");
      return;
    }
    setState((s) => ({ ...s, kinds: res.kinds }));
  }

  async function pullNow() {
    setBusy(true);
    setNote("");
    const res = await shop.pull();
    setBusy(false);
    setState(shop.status());
    if (!res?.ok) {
      setNote(res?.message || "Couldn't reach your shop just now.");
      return;
    }
    setNote(
      res.received === 0
        ? "Nothing new from the rest of the shop."
        : `${res.added} new, ${res.updated} updated, ${res.removed} removed.`,
    );
  }

  // Sharing runs over the same connection as head office, so there is nothing
  // to share into until this device has joined a shop. Said plainly rather
  // than showing three boxes that quietly do nothing.
  if (connected === false) {
    return (
      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center gap-3 mb-2">
          <Users className={`w-5 h-5 ${t.textSecondary}`} />
          <h3 className={`font-semibold ${t.textPrimary}`}>Share with the rest of the shop</h3>
        </div>
        <p className={`text-sm ${t.textSecondary}`}>
          This device isn&rsquo;t part of a shop yet. Connect it on the{" "}
          <b>Connect to HQ</b> tab, and every device that joins the same shop can share
          stock, repairs and customers with the others.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center gap-3 mb-1">
          <Users className={`w-5 h-5 ${t.textSecondary}`} />
          <h3 className={`font-semibold ${t.textPrimary}`}>What this device shares</h3>
        </div>
        <p className={`text-sm mb-5 ${t.textSecondary}`}>
          Anything you tick shows up on the other TechDesk devices in this shop, marked as
          yours. They can change it as well as look at it &mdash; a count fixed at another
          bench comes back here. Your takings are never shared.
        </p>

        <div className="flex flex-col gap-2">
          {KINDS.map(({ key, label, Icon, what }) => {
            const on = state.kinds.includes(key);
            return (
              <button
                key={key}
                onClick={() => toggle(key)}
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

        {SHAREABLE.length !== KINDS.length && (
          /* If the two ever drift, the screen is missing a box the server
             would accept -- worth failing loudly in development rather than
             quietly sharing less than the shop asked for. */
          <p className="text-xs mt-3 text-amber-500">
            This build knows about {KINDS.length} of {SHAREABLE.length} shareable kinds.
          </p>
        )}
      </div>

      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold ${t.textPrimary}`}>From the rest of the shop</h3>
        <p className={`text-sm mt-1 mb-4 ${t.textSecondary}`}>
          {state.lastPullAt
            ? `Last checked ${new Date(state.lastPullAt).toLocaleString()}.`
            : "Not checked yet."}{" "}
          This happens on its own while the app is open.
        </p>
        <button
          onClick={pullNow}
          disabled={busy}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg} ${
            busy ? "opacity-60" : ""
          }`}
        >
          <RefreshCw className={`w-4 h-4 ${busy ? "animate-spin" : ""}`} /> Check now
        </button>
        {note && <p className={`text-xs mt-3 ${t.textMuted}`}>{note}</p>}
      </div>
    </div>
  );
}
