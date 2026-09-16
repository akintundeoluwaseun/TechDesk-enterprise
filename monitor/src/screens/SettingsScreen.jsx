import React from "react";
import { Building2, LogOut, Phone, ShieldCheck } from "lucide-react";
import { Card, IconBubble } from "../components/ui";

export default function SettingsScreen({ data, onSignOut }) {
  const business = data?.business || {};
  const branches = data?.branches || [];

  return (
    <div className="px-4">
      <h1 className="text-2xl font-bold mb-1">Settings</h1>
      <p className="text-ink-soft mb-5">Your account and this app.</p>

      <Card className="p-5 mb-4 flex items-center gap-4">
        <IconBubble tone="blue"><Building2 size={19} /></IconBubble>
        <div className="min-w-0">
          <div className="font-semibold truncate">{business.name || "Your business"}</div>
          <div className="text-sm text-ink-soft">
            {branches.length} branch{branches.length === 1 ? "" : "es"}
          </div>
        </div>
      </Card>

      <Card className="p-5 mb-4">
        <div className="flex items-center gap-3 mb-2">
          <ShieldCheck className="text-emerald-500" size={18} />
          <h2 className="font-semibold">Read only</h2>
        </div>
        <p className="text-sm text-ink-soft leading-relaxed">
          This app can look but never touch. Nothing you do here changes a sale, a repair or a
          stock count on any branch&rsquo;s computer.
        </p>
      </Card>

      <Card className="p-5 mb-4">
        <div className="flex items-center gap-3 mb-2">
          <Phone className="text-ink-soft" size={18} />
          <h2 className="font-semibold">Adding a branch</h2>
        </div>
        <p className="text-sm text-ink-soft leading-relaxed">
          On that shop&rsquo;s computer, open <b className="text-ink">Settings &rarr; Connect to HQ</b> and
          type your phone number. We text you a code &mdash; they ring you, you read it out.
        </p>
      </Card>

      <button
        onClick={onSignOut}
        className="w-full py-3.5 rounded-2xl bg-card shadow-raised text-rose-500 font-semibold flex items-center justify-center gap-2"
      >
        <LogOut size={17} /> Sign out
      </button>

      <p className="text-xs text-ink-faint text-center mt-5">TechDesk Monitor 1.0.0</p>
    </div>
  );
}
