import React, { useState } from "react";
import { Monitor, Phone, ArrowRight } from "lucide-react";
import { api } from "../api";
import { Card } from "../components/ui";
import { sitePage, siteLabel } from "@techdesk/editions";

export default function LoginScreen({ onSignedIn }) {
  const [step, setStep] = useState("identifier");
  const [identifier, setIdentifier] = useState("");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [otpId, setOtpId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const field =
    "w-full rounded-2xl px-4 py-3.5 bg-sunk shadow-pressed outline-none text-ink placeholder:text-ink-faint";

  async function askForCode(e) {
    e.preventDefault();
    setError("");
    const value = identifier.trim();
    if (!value) return setError("Enter your email or phone number.");
    setBusy(true);
    const res = await api.loginStart(value);
    setBusy(false);
    if (!res.ok) return setError(res.message || "That didn't work. Try again.");
    setSentTo(res.email || res.phone || value);
    setOtpId(res.otpId || null);
    setStep("code");
  }

  async function signIn(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code.trim())) return setError("The code is 6 digits.");
    setBusy(true);
    const res = await api.loginVerify(identifier.trim(), code.trim(), otpId);
    setBusy(false);
    if (!res.ok) return setError(res.message || "That didn't work. Try again.");
    onSignedIn(res.token);
  }

  return (
    <div className="min-h-screen flex flex-col justify-center items-center px-6 py-10">
      <div className="w-full max-w-sm">
      <div className="flex flex-col items-center mb-8">
        <div className="w-16 h-16 rounded-2xl bg-ink grid place-items-center shadow-raised-sm mb-4 m-pop">
          <Monitor className="text-ground" size={30} />
        </div>
        <h1 className="text-2xl font-bold">TechDesk <span>Monitor</span></h1>
        <p className="text-sm text-ink-soft mt-1">Your branches, on your phone.</p>
      </div>

      <Card className="p-6">
        {step === "identifier" ? (
          <form onSubmit={askForCode}>
            <label className="block mb-4">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft mb-2">
                <Phone size={13} /> Your HQ email or phone number
              </span>
              <input
                id="hq-identifier"
                className={field}
                type="text"
                autoComplete="email tel"
                placeholder="hq@shop.com or 08012345678"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
              />
            </label>
            <p className="text-xs text-ink-faint mb-4 leading-relaxed">
              Whichever you registered your business with. An email code is
              free and instant; a phone number gets a text.
              Haven&rsquo;t registered yet?{" "}
              <a
                href={sitePage("hq.html")}
                target="_blank"
                rel="noreferrer"
                className="text-ink font-semibold"
              >
                Set up your HQ first
              </a>
              .
            </p>
            {error && <p className="text-sm text-rose-600 dark:text-rose-400 mb-3">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className={`w-full py-3.5 rounded-2xl bg-ink text-ground font-semibold flex items-center justify-center gap-2 ${
                busy ? "opacity-60" : ""
              }`}
            >
              {busy ? "Sending…" : "Send me a code"} {!busy && <ArrowRight size={17} />}
            </button>
          </form>
        ) : (
          <form onSubmit={signIn}>
            <p className="text-sm text-ink-soft mb-3 leading-relaxed">
              We sent a 6-digit code to <b className="text-ink">{sentTo}</b>.
            </p>
            {/* The server answers the same way whether or not that identifier
                runs a business, so that a stranger cannot find out by typing
                things in. Which means "no code arrived" has two causes, and
                the second one is the common one for a new owner: there is no
                HQ on that email or number yet. Saying so here costs nothing
                and saves the wait. */}
            <p className="text-xs text-ink-faint mb-5 leading-relaxed">
              No code after a minute? It has to be registered as HQ
              first &mdash; set that up at{" "}
              <a
                href={sitePage("hq.html")}
                target="_blank"
                rel="noreferrer"
                className="text-ink font-semibold"
              >
                {siteLabel("hq.html")}
              </a>
              , then come back here.
            </p>
            {/* No maxLength: it would cut a code pasted with spaces before the
                handler strips them. Six digits is enforced here instead. */}
            <input
              className={`${field} text-center text-2xl font-bold tracking-[0.35em] pl-[0.35em]`}
              inputMode="numeric"
              autoComplete="one-time-code"
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              autoFocus
            />
            {error && <p className="text-sm text-rose-600 dark:text-rose-400 mt-3">{error}</p>}
            <button
              type="submit"
              disabled={busy}
              className={`w-full mt-5 py-3.5 rounded-2xl bg-ink text-ground font-semibold ${
                busy ? "opacity-60" : ""
              }`}
            >
              {busy ? "Checking…" : "Sign in"}
            </button>
            <button
              type="button"
              onClick={() => {
                setStep("identifier");
                setCode("");
                setError("");
              }}
              className="w-full mt-3 py-3 rounded-2xl text-ink-soft text-sm font-medium"
            >
              Use a different email or number
            </button>
          </form>
        )}
      </Card>
      </div>
    </div>
  );
}
