import React, { useState } from "react";
import { UserPlus, KeyRound, Pencil, Trash2, Check, X } from "lucide-react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { useSettings } from "../../lib/SettingsContext";
import { db } from "../../lib/db";

function toggleRole0(draft, setDraft, r) {
  setDraft((d) => {
    if (d.role === "both") return { ...d, role: r === "seller" ? "repairer" : "seller" };
    if (d.role !== r) return { ...d, role: "both" };
    return d;
  });
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

  function refresh() {
    setUsers(db.getUsers());
  }

  function toggleRole(r) {
    if (role === "both") {
      setRole(r === "seller" ? "repairer" : "seller");
    } else if (role !== r) {
      setRole("both");
    }
  }

  function handleAddUser() {
    if (!name || pin.length < 4) return;
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

  return (
    <div className="flex flex-col gap-5">
      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className={`font-semibold ${t.textPrimary}`}>Require PIN sign-in</h3>
            <p className={`text-sm ${t.textSecondary}`}>
              When off, the app opens straight to the Dashboard as Admin \u2014 no lock screen.
            </p>
          </div>
          <button
            onClick={() => updateSettings({ requirePin: !settings.requirePin })}
            className={`w-12 h-7 rounded-full flex items-center px-0.5 transition-colors shrink-0 ${
              settings.requirePin ? "bg-emerald-500 justify-end" : t.dark ? "bg-white/15 justify-start" : "bg-slate-300 justify-start"
            }`}
          >
            <span className="w-6 h-6 rounded-full bg-white block" />
          </button>
        </div>
      </div>

      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <h3 className={`font-semibold mb-1 ${t.textPrimary}`}>Users on this device</h3>
        <p className={`text-sm mb-6 ${t.textSecondary}`}>
          Add sellers, repairers, or both. Each user signs in with their own PIN from the user switch screen.
          Sellers see Sales + Inventory, repairers see Repairs + Inventory. Only the admin sees dashboard, logs,
          cost prices and settings.
        </p>

        <div className="grid grid-cols-2 gap-4 mb-4">
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Full name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
          <div>
            <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>Email (optional)</label>
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
            />
          </div>
        </div>

        <div className="mb-4">
          <label className={`text-sm font-medium block mb-1.5 ${t.textPrimary}`}>PIN (4-6 digits)</label>
          <input
            value={pin}
            onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 6))}
            className={`w-full rounded-xl px-4 py-2.5 text-sm outline-none ${t.inputBg}`}
          />
        </div>

        <div className="flex items-center gap-6 mb-5">
          <button onClick={() => toggleRole("seller")} className="flex items-center gap-2">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                role === "seller" || role === "both" ? "bg-emerald-500" : t.dark ? "border border-white/20" : "border border-slate-300"
              }`}
            >
              {(role === "seller" || role === "both") && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <span className={`text-sm ${t.textPrimary}`}>Seller</span>
          </button>
          <button onClick={() => toggleRole("repairer")} className="flex items-center gap-2">
            <span
              className={`w-5 h-5 rounded-full flex items-center justify-center ${
                role === "repairer" || role === "both" ? "bg-emerald-500" : t.dark ? "border border-white/20" : "border border-slate-300"
              }`}
            >
              {(role === "repairer" || role === "both") && <span className="w-2 h-2 rounded-full bg-white" />}
            </span>
            <span className={`text-sm ${t.textPrimary}`}>Repairer</span>
          </button>
        </div>

        <button
          onClick={handleAddUser}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold mb-6 ${t.pillBg}`}
        >
          <UserPlus className="w-4 h-4" /> Add user
        </button>

        <div className={`rounded-2xl p-5 mb-4 ${t.dark ? "bg-white/5 border border-white/10" : "bg-white/40 border border-white/60"}`}>
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
              <div key={u.id} className={`rounded-2xl p-5 ${t.dark ? "bg-white/5 border border-white/10" : "bg-white/40 border border-white/60"}`}>
                {editingId === u.id ? (
                  <div className="flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
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
                              : "border border-slate-300"
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
                              : "border border-slate-300"
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
      </div>
    </div>
  );
}
