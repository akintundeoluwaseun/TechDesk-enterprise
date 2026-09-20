import React, { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { api } from "../api";
import { Card, Empty } from "../components/ui";
import { ago } from "../format";
import { money } from "../currency";

const TABS = [
  { kind: "sale", label: "Sales" },
  { kind: "repair", label: "Repairs" },
  { kind: "product", label: "Stock" },
];

/** A line of detail per kind, so each list reads like the thing it is. */
function line(kind, p) {
  if (kind === "sale") {
    return {
      title: p.invoice || "Sale",
      detail: p.customerName || p.customer || "Walk-in",
      right: p.total != null ? money(p.total) : "",
    };
  }
  if (kind === "repair") {
    return {
      title: p.device || p.ticket || "Repair",
      detail: [p.ticket, p.status].filter(Boolean).join(" · "),
      right: p.status || "",
    };
  }
  return {
    title: p.name || "Item",
    detail: p.category || "",
    right: p.stock != null ? `${p.stock} left` : "",
  };
}

export default function BranchScreen({ token, branch, onBack }) {
  const [kind, setKind] = useState("sale");
  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    setRows(null);
    setError("");
    api.branch(token, branch.id, kind, 50).then((res) => {
      if (cancelled) return;
      if (!res.ok) return setError(res.message || "Couldn't load that.");
      setRows(res.records || []);
    });
    return () => { cancelled = true; };
  }, [token, branch.id, kind]);

  return (
    <div className="px-4">
      <button onClick={onBack} className="flex items-center gap-1.5 text-ink-soft mb-4 -ml-1">
        <ArrowLeft size={18} /> Back
      </button>
      <h1 className="text-2xl font-bold mb-1">{branch.name}</h1>
      <p className="text-ink-soft mb-5">What this shop has been doing.</p>

      <div className="flex gap-2 mb-4">
        {TABS.map((t) => (
          <button
            key={t.kind}
            onClick={() => setKind(t.kind)}
            className={`px-4 py-2 rounded-full text-sm font-medium ${
              kind === t.kind ? "bg-blue-500 text-white shadow-raised-sm" : "bg-card text-ink-soft shadow-raised-sm"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {error ? (
        <Empty title="Couldn't load that" detail={error} />
      ) : rows === null ? (
        <Card className="p-6 text-center text-ink-soft">Loading&hellip;</Card>
      ) : rows.length === 0 ? (
        <Empty title="Nothing here yet" detail="This branch hasn't sent anything of this kind." />
      ) : (
        <Card className="divide-y divide-slate-100">
          {rows.map((r) => {
            const l = line(kind, r.payload || {});
            return (
              <div key={r.id} className="flex items-center gap-3 p-4">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.title}</div>
                  <div className="text-xs text-ink-faint mt-0.5 truncate">
                    {[l.detail, ago(r.at)].filter(Boolean).join(" · ")}
                  </div>
                </div>
                <div className="text-sm font-semibold shrink-0 tabular-nums">{l.right}</div>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
