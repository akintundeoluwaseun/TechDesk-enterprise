import React, { useState } from "react";
import { X } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { useAuth } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { db } from "../lib/db";

const STATUSES = ["received", "in progress", "awaiting parts", "completed", "delivered"];

export default function NewRepairModal({ onClose, onCompleted }) {
  const t = useThemeTokens();
  const { user: authUser } = useAuth();
  const { settings } = useSettings();
  const labels = settings.labels;
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [device, setDevice] = useState("");
  const [imei, setImei] = useState("");
  const [serial, setSerial] = useState("");
  const [problem, setProblem] = useState("");
  const [status, setStatus] = useState("received");
  const [cost, setCost] = useState("0");
  const [notes, setNotes] = useState("");

  function handleSave() {
    if (!name || !device || !problem) return;
    const customer = db.findOrCreateCustomer({ name, phone });
    const repair = db.createRepair({
      customerId: customer?.id || null,
      customerName: name,
      customerPhone: phone,
      device,
      imei,
      serial,
      problem,
      status,
      repairCost: Number(cost) || 0,
      notes,
    });
    db.logActivity({
      type: "repair",
      message: `New ${labels.ticketSingular.toLowerCase()} ticket ${repair.ticket} created`,
      refId: repair.id,
      actor: authUser?.name,
    });
    onCompleted?.(repair);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 p-6 overflow-y-auto">
      <div className={`w-full max-w-lg rounded-2xl mt-10 mb-10 p-6 ${t.cardBg}`}>
        <div className="flex items-center justify-between mb-5">
          <h2 className={`text-xl font-bold ${t.textPrimary}`}>New {labels.ticketSingular.toLowerCase()}</h2>
          <button onClick={onClose} className={t.textMuted}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Customer name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Phone</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="08012345678"
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>{labels.itemLabel}</label>
          <input
            value={device}
            onChange={(e) => setDevice(e.target.value)}
            className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>{labels.idLabel}</label>
            <input
              value={imei}
              onChange={(e) => setImei(e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>{labels.serialLabel}</label>
            <input
              value={serial}
              onChange={(e) => setSerial(e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>{labels.problemLabel}</label>
          <input
            value={problem}
            onChange={(e) => setProblem(e.target.value)}
            className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>{labels.ticketSingular} cost (&#8358;)</label>
            <input
              type="number"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
        </div>

        <div className="mb-5">
          <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Notes</label>
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none resize-none ${t.inputBg}`}
          />
        </div>

        <button
          onClick={handleSave}
          className={`w-full py-3 rounded-xl font-semibold ${t.dark ? "bg-white text-black" : "bg-slate-900 text-white"}`}
        >
          Save
        </button>
      </div>
    </div>
  );
}
