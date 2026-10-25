import React, { useEffect, useMemo, useState } from "react";
import BrandMark from "../components/BrandMark";
import { Delete } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";
import { useAuth } from "../lib/AuthContext";
import { useSettings } from "../lib/SettingsContext";
import { db } from "../lib/db";
import ForgotPinModal from "../components/ForgotPinModal";
import { BUILDER, BUILDER_LINE } from "@techdesk/editions";

// Matches the range the Users tab offers when a PIN is set.
const MIN_PIN = 4;
const MAX_PIN = 6;

export default function LoginScreen() {
  const t = useThemeTokens();
  const { signIn } = useAuth();
  const { settings } = useSettings();
  const users = db.getUsers();

  const [selectedUser, setSelectedUser] = useState(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [showForgot, setShowForgot] = useState(false);
  const [notice, setNotice] = useState("");

  // PINs are 4 to 6 digits, so a 4-digit entry is not necessarily finished.
  //
  // This used to check at exactly four and clear the box when that failed,
  // which made a 5- or 6-digit PIN impossible to type: the fourth digit was
  // tested against the whole PIN, missed, and wiped what had been entered.
  // The Users tab offers "PIN (4-6 digits)" and then the lock screen would
  // not accept one. Anybody who set a longer PIN was locked out of their own
  // shop with no way in.
  //
  // So a miss below the maximum is not reported at all -- they are still
  // typing. Only a full six digits, or pressing Enter, is a finished attempt.
  function attempt(candidate, { final }) {
    if (signIn(candidate)) return true;
    if (final) {
      setError("Incorrect PIN");
      setPin("");
    }
    return false;
  }

  // The longest PIN anyone on this device actually has. Below it, a miss just
  // means they have not finished typing; at it, there is nothing left to type
  // and the attempt is a real one. That keeps the immediate "Incorrect PIN"
  // for a shop whose PINs are all four digits, without breaking the longer
  // ones -- which is the whole bug.
  const longestPin = useMemo(() => {
    const lengths = [
      String(settings.adminPin || "0000").length,
      ...db.getUsers().map((u) => String(u.pin || "").length),
    ].filter((n) => n >= MIN_PIN && n <= MAX_PIN);
    return lengths.length ? Math.max(...lengths) : MAX_PIN;
  }, [settings.adminPin]);

  function handleDigit(d) {
    if (pin.length >= MAX_PIN) return;
    const next = pin + d;
    setPin(next);
    setError("");
    if (next.length >= MIN_PIN) {
      setTimeout(() => attempt(next, { final: next.length >= longestPin }), 100);
    }
  }

  /** Enter says "that is the whole PIN", for anyone who set a short one. */
  function submitNow() {
    if (pin.length < MIN_PIN) return;
    attempt(pin, { final: true });
  }

  function backspace() {
    setError("");
    setPin((p) => p.slice(0, -1));
  }

  // physical keyboard support: digits, backspace, escape to go back
  useEffect(() => {
    if (!selectedUser) return;
    function onKeyDown(e) {
      if (/^[0-9]$/.test(e.key)) {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        backspace();
      } else if (e.key === "Enter") {
        submitNow();
      } else if (e.key === "Escape") {
        setSelectedUser(null);
        setPin("");
        setError("");
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedUser, pin]);

  const people = [{ id: "admin", name: "Admin", role: "admin" }, ...users];

  return (
    <div className={`relative min-h-screen w-full flex items-center justify-center ${t.bg}`}>
      <div className="w-full max-w-sm px-6">
        <div className="flex flex-col items-center mb-8">
          <BrandMark className="w-12 h-12 mb-3" />
          <h1 className={`text-2xl font-bold ${t.textPrimary}`}>{settings.shopName}</h1>
          <p className={`text-sm ${t.textMuted}`}>{settings.tagline}</p>
        </div>

        {!selectedUser ? (
          <div className="flex flex-col gap-2">
            <p className={`text-sm text-center mb-2 ${t.textSecondary}`}>Select user</p>
            {people.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setSelectedUser(p);
                  setPin("");
                  setError("");
                }}
                className={`flex items-center gap-3 rounded-xl px-4 py-3 ${t.cardBg}`}
              >
                <div
                  className={`w-9 h-9 rounded-full flex items-center justify-center font-semibold text-sm ${
                    t.dark ? "bg-white text-black" : "bg-blue-100 text-blue-600"
                  }`}
                >
                  {p.name[0]}
                </div>
                <div className="text-left">
                  <div className={`text-sm font-semibold ${t.textPrimary}`}>{p.name}</div>
                  <div className={`text-xs ${t.textMuted}`}>{p.role}</div>
                </div>
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center">
            <div
              className={`w-14 h-14 rounded-full flex items-center justify-center font-semibold mb-3 ${
                t.dark ? "bg-white text-black" : "bg-blue-100 text-blue-600"
              }`}
            >
              {selectedUser.name[0]}
            </div>
            <div className={`font-semibold mb-1 ${t.textPrimary}`}>{selectedUser.name}</div>
            <div className={`text-xs mb-6 ${t.textMuted} min-h-[2.5rem] flex flex-col items-center justify-start`}>
              <span>Enter PIN</span>
              {selectedUser.id === "admin" && !settings.adminPin && (
                <span className="mt-1">Default admin PIN is 0000 until changed in Settings</span>
              )}
            </div>

            <div className="flex items-center gap-3 mb-6">
              {Array.from({ length: MAX_PIN }, (_, i) => i).map((i) => (
                <span
                  key={i}
                  className={`w-3 h-3 rounded-full ${
                    i < pin.length ? (t.dark ? "bg-white" : "bg-neutral-900") : t.dark ? "bg-white/20" : "bg-neutral-200"
                  }`}
                />
              ))}
            </div>

            {error && <div className="text-red-500 text-sm mb-3">{error}</div>}
            {notice && <div className="text-emerald-500 text-sm mb-3">{notice}</div>}

            <div className="grid grid-cols-3 gap-3 mb-4">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((d) => (
                <button
                  key={d}
                  onClick={() => handleDigit(d)}
                  className={`w-16 h-16 rounded-full text-lg font-semibold ${t.cardBg} ${t.textPrimary}`}
                >
                  {d}
                </button>
              ))}
              <button
                onClick={() => setSelectedUser(null)}
                className={`w-16 h-16 rounded-full text-xs font-medium ${t.pillBg}`}
              >
                Back
              </button>
              <button
                onClick={() => handleDigit("0")}
                className={`w-16 h-16 rounded-full text-lg font-semibold ${t.cardBg} ${t.textPrimary}`}
              >
                0
              </button>
              <button onClick={backspace} className={`w-16 h-16 rounded-full flex items-center justify-center ${t.pillBg}`}>
                <Delete className="w-5 h-5" />
              </button>
            </div>

            {/* Admin only. A staff PIN is reset by the admin in Settings;
                answering the owner's questions must not hand out a till
                account to whoever is standing at the counter. */}
            {selectedUser.id === "admin" && (
              <button
                onClick={() => setShowForgot(true)}
                className={`text-sm underline underline-offset-4 ${t.textSecondary}`}
              >
                Forgot your PIN?
              </button>
            )}
          </div>
        )}
      </div>

      {/* Quiet, at the very bottom, under everything else: the sign-in screen
          is the one place every user of the app passes through, and it has
          room going spare. Small and muted on purpose -- a shop signing in at
          the counter should read the keypad, not this. */}
      <a
        href={BUILDER.url}
        target="_blank"
        rel="noopener noreferrer"
        className={`absolute bottom-4 inset-x-0 text-center text-[11px] ${t.textMuted}`}
      >
        {BUILDER_LINE}
      </a>

      {showForgot && (
        <ForgotPinModal
          onClose={() => setShowForgot(false)}
          onReset={() => {
            setShowForgot(false);
            setPin("");
            setError("");
            setNotice("PIN changed. Sign in with your new PIN.");
          }}
        />
      )}
    </div>
  );
}
