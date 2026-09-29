import React, { useEffect, useState } from "react";
import { requestPermission } from "../notify";
import { Building2, Coins, LogOut, Phone, ShieldCheck, Sparkles, BellRing, BellOff } from "lucide-react";
import { Card, IconBubble } from "../components/ui";
import { CURRENCIES, currencyCode, setCurrency, money } from "../currency";

export default function SettingsScreen({ data, onSignOut, onTour }) {
  const business = data?.business || {};
  // Held in state as well as storage so the sample below updates as soon as
  // it is changed, rather than on the next screen.
  const [currency, setCurrencyState] = useState(currencyCode);
  const branches = data?.branches || [];
  // Not a switch: Monitor always notifies. This only says whether the phone
  // or browser lets it, and asks again if it hasn't been allowed yet.
  const [allowed, setAllowed] = useState(null);
  useEffect(() => {
    requestPermission().then(setAllowed).catch(() => setAllowed(false));
  }, []);

  return (
    <div className="px-4 lg:px-0 lg:max-w-4xl">
      <h1 className="text-2xl lg:text-3xl font-bold mb-1 m-rise">Settings</h1>
      <p className="text-ink-soft mb-5">Your account and this app.</p>

      <div className="m-stagger lg:grid lg:grid-cols-2 lg:gap-4">
      <Card className="p-5 mb-4 lg:mb-0 flex items-center gap-4">
        <span className={`grid place-items-center w-11 h-11 shrink-0 rounded-2xl ${allowed ? "bg-emerald-500/15 text-emerald-400" : "bg-amber-500/15 text-amber-400"}`}>
          {allowed ? <BellRing size={19} /> : <BellOff size={19} />}
        </span>
        <div className="min-w-0">
          <div className="font-semibold">Notifications {allowed ? "on" : allowed === false ? "blocked" : ""}</div>
          <div className="text-sm text-ink-soft leading-snug">
            {allowed
              ? "Every sale, and who still owes or hasn't collected, every 5 hours until it's sorted."
              : "Allow notifications for Monitor in your phone or browser settings, so you hear about every sale."}
          </div>
        </div>
      </Card>

      <button
        onClick={onTour}
        className="w-full mb-4 lg:mb-0 p-5 rounded-xl2 text-left flex items-center gap-4 border border-sky-400/20 bg-gradient-to-br from-indigo-500/15 to-sky-500/10 hover:from-indigo-500/25 transition-colors"
      >
        <span className="grid place-items-center w-11 h-11 shrink-0 rounded-2xl bg-gradient-to-br from-indigo-500 to-sky-400 text-white shadow-glow">
          <Sparkles size={19} />
        </span>
        <span className="min-w-0">
          <span className="block font-semibold">Take the tour</span>
          <span className="block text-sm text-ink-soft">A quick look round Monitor, one thing at a time.</span>
        </span>
      </button>

      <Card className="p-5 mb-4 lg:mb-0 flex items-center gap-4">
        <IconBubble tone="blue"><Building2 size={19} /></IconBubble>
        <div className="min-w-0">
          <div className="font-semibold truncate">{business.name || "Your business"}</div>
          <div className="text-sm text-ink-soft">
            {branches.length} branch{branches.length === 1 ? "" : "es"}
          </div>
        </div>
      </Card>

      <Card className="p-5 mb-4 lg:mb-0">
        <div className="flex items-center gap-3 mb-2">
          <Coins className="text-amber-500" size={18} />
          <h2 className="font-semibold">Currency</h2>
        </div>
        <p className="text-sm text-ink-soft leading-relaxed mb-3">
          Branches send up figures, not a currency, so pick the one your shops sell in. It only
          changes how the numbers here are labelled.
        </p>
        <select
          value={currency}
          onChange={(e) => {
            setCurrency(e.target.value);
            setCurrencyState(e.target.value);
          }}
          className="w-full rounded-xl px-3 py-2.5 text-sm bg-sunk border border-white/[0.08] text-ink outline-none"
        >
          {CURRENCIES.map((c) => (
            <option key={c.code} value={c.code}>
              {c.symbol}  {c.name} ({c.code})
            </option>
          ))}
        </select>
        <p className="text-xs text-ink-soft mt-2">Totals show as {money(45000, currency)}.</p>
      </Card>

      <Card className="p-5 mb-4 lg:mb-0">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="text-emerald-500" size={18} />
          <h2 className="font-semibold">Read only</h2>
        </div>
        <p className="text-sm text-ink-soft leading-relaxed">
          This app can look but never touch. Nothing you do here changes a sale, a repair or a
          stock count on any branch&rsquo;s computer.
        </p>
      </Card>

      <Card className="p-5 mb-4 lg:mb-0">
        <div className="flex items-center gap-3 mb-2">
          <Phone className="text-ink-soft" size={18} />
          <h2 className="font-semibold">Adding a branch</h2>
        </div>
        <p className="text-sm text-ink-soft leading-relaxed">
          On that shop&rsquo;s computer, open <b className="text-ink">Settings &rarr; Connect to HQ</b> and
          type your phone number. We text you a code &mdash; they ring you, you read it out.
        </p>
      </Card>

      </div>

      <button
        onClick={onSignOut}
        className="w-full lg:w-auto lg:px-8 mt-4 py-3.5 rounded-2xl bg-card border border-rose-500/20 text-rose-400 font-semibold flex items-center justify-center gap-2 hover:bg-rose-500/10"
      >
        <LogOut size={17} /> Sign out
      </button>

      <p className="text-xs text-ink-faint text-center mt-5">TechDesk Monitor</p>
    </div>
  );
}
