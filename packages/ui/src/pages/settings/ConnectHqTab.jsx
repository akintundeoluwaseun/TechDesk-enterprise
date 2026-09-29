import React, { useEffect, useState } from "react";
import { Building2, CheckCircle2, ChevronDown, Link2, Phone, Unlink } from "lucide-react";
import { useThemeTokens } from "../../lib/ThemeContext";
import { db, CHANGED_EVENT } from "../../lib/db";
import { hq } from "../../lib/hq";
import { IS_ANDROID_APP } from "../../lib/platform";
import { siteLabel } from "@techdesk/editions";

export default function ConnectHqTab() {
  const t = useThemeTokens();
  // One screen, two reasons to be on it.
  //
  // A shop on Enterprise is connecting a BRANCH to a head office that
  // watches several shops. A shop on Business has no head office at all --
  // it is putting a second bench in the same shop so the two can share
  // stock. Both do exactly the same thing here, and the words were written
  // only for the first, so the tier that needs this most was reading about
  // something it does not have.
  const [status, setStatus] = useState(null);
  const [step, setStep] = useState("idle");        // idle | code | working
  const [hqIdentifier, setHqIdentifier] = useState("");
  const [branchName, setBranchName] = useState(() => db.getSettings?.().shopName || "");
  const [code, setCode] = useState("");
  const [sentTo, setSentTo] = useState("");
  const [error, setError] = useState("");
  // The web address is only useful to a branch that is about to REGISTER a
  // new head office, which is not most branches on this screen -- most
  // already have one and are just connecting to it. Showing it every time
  // buried the one thing this screen is actually for under a URL nobody here
  // needed yet.
  const [showNoHq, setShowNoHq] = useState(false);
  // What has and has not reached HQ. Connecting and then seeing nothing at
  // head office used to look identical to a broken connection, because this
  // screen said "Connected" and then never mentioned sending again. There is
  // no button for it: sending itself runs on its own, in the background
  // (useHqSync), on its own heartbeat plus the instant a record changes --
  // this panel only ever reports what that's already done.
  const [sync, setSync] = useState({ waiting: 0, lastSyncAt: null });

  useEffect(() => {
    hq.status().then((next) => setStatus(next));
  }, []);

  function refreshSync(state) {
    setSync({
      waiting: db.countUnsynced(state?.lastSyncAt ?? null),
      lastSyncAt: state?.lastSyncAt ?? null,
    });
  }

  useEffect(() => {
    if (!status?.hqConnected) return undefined;
    refreshSync(status);
    const heartbeat = setInterval(() => hq.status().then((next) => refreshSync(next)), 5000);
    const onChange = () => refreshSync(status);
    window.addEventListener(CHANGED_EVENT, onChange);
    return () => {
      clearInterval(heartbeat);
      window.removeEventListener(CHANGED_EVENT, onChange);
    };
  }, [status?.hqConnected]);

  const input = `w-full rounded-xl px-3 py-2.5 text-sm outline-none ${t.inputBg}`;

  async function askForCode(e) {
    e.preventDefault();
    setError("");
    if (!branchName.trim()) return setError("Give this branch a name first.");
    const identifier = hqIdentifier.trim();
    if (!identifier) return setError("Enter your HQ's email or phone number.");
    const hqEmail = identifier.includes("@") ? identifier : null;
    const hqPhone = hqEmail ? null : identifier;

    setStep("working");
    const res = await hq.connectStart({
      hqPhone,
      hqEmail,
      branchName: branchName.trim(),
      businessName: db.getSettings?.().shopName || null,
    });
    if (!res.ok) {
      setStep("idle");
      return setError(res.message || "That didn't work. Try again.");
    }
    setSentTo(res.targetEmail || res.targetPhone || identifier);
    setStep("code");
  }

  async function submitCode(e) {
    e.preventDefault();
    setError("");
    if (!/^\d{6}$/.test(code.trim())) return setError("The code is 6 digits.");

    setStep("working");
    const res = await hq.connectVerify({ code: code.trim() });
    if (!res.ok) {
      setStep("code");
      return setError(res.message || "That didn't work. Try again.");
    }
    setCode("");
    setStep("idle");
    setStatus(await hq.status());
  }

  async function disconnect() {
    if (!window.confirm("Disconnect this branch from HQ? Your data stays on this device.")) return;
    const res = await hq.disconnect();
    setStatus(await hq.status());
    setStep("idle");
    // Whether head office has actually been told is the part a shop cannot
    // see and used to be told nothing about. It stays listed there until the
    // message gets through, and saying so beats the screen saying nothing
    // while Monitor still shows the device.
    setError(
      res?.told === false
        ? "Disconnected here. Head office hasn't been told yet -- no internet. " +
          "It will be as soon as this device is back online."
        : "",
    );
  }

  // The web build keeps the connection in this browser's storage rather than
  // in a file only the app can read, so it is worth saying so on the screen
  // where someone decides to connect -- not only in a README.
  // Said in the words of whichever shell this is. "Clearing site data" is
  // not a thing a shop does to a phone app, and being warned about it there
  // is worse than not being warned at all.
  const WHERE_IT_LIVES = IS_ANDROID_APP
    ? "This phone holds the link to head office. Clearing the app's data disconnects " +
      "it -- nothing already sent is lost, and you can connect again."
    : "This browser holds the link to head office. Clearing site data disconnects " +
      "it -- nothing already sent is lost, and you can connect again.";

  // Head office used to be refused here unless this was the Electron build,
  // because the desktop keeps its token in the main process and a browser
  // tab has nowhere as safe to put one.
  //
  // That stopped being the whole story when core grew a transport that picks
  // its own implementation: the desktop still hands the token to the main
  // process, and the phone and the web app use the same code the web app has
  // been shipping all along, which keeps it in this origin's storage. Both
  // work. So the refusal was not protecting anything -- it was just denying
  // head office to every shop that runs TechDesk on a phone, which is most
  // of the shops that would want it.
  //
  // What is different is where the link is kept, and that is said plainly
  // below rather than hidden behind a refusal.

  if (status?.hqConnected) {
    return (
      <div className="flex flex-col gap-5">
        <div className={`rounded-2xl p-6 ${t.cardBg}`}>
          <div className="flex items-center gap-3">
            <CheckCircle2 className="text-emerald-500" size={20} />
            <div>
              <h3 className={`font-semibold ${t.textPrimary}`}>Connected to HQ</h3>
              <p className={`text-sm ${t.textSecondary}`}>
                This branch reports to {status.hqEmail || status.hqPhone || "your HQ"}
                {status.connectedAt
                  ? ` since ${new Date(status.connectedAt).toLocaleDateString()}`
                  : ""}.
              </p>
            </div>
          </div>
          <div className={`mt-4 rounded-xl p-4 ${t.insetBg}`}>
            <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>This branch</div>
            <div className={`mt-1 font-semibold ${t.textPrimary}`}>
              {status.branchName || branchName || "Unnamed branch"}
            </div>
          </div>

          {/* What is actually reaching head office. It sends itself every
              couple of minutes; this is here so nobody has to guess. */}
          <div className={`mt-3 rounded-xl p-4 ${t.insetBg}`}>
            <div className={`text-xs uppercase tracking-wider ${t.textMuted}`}>Sending to HQ</div>
            <div className={`mt-1 text-sm ${t.textPrimary}`}>
              {sync.lastSyncAt
                ? `Last sent ${new Date(sync.lastSyncAt).toLocaleString()}`
                : "Nothing sent yet"}
            </div>
            <div className={`text-sm ${t.textSecondary}`}>
              {sync.waiting === 0
                ? "Nothing waiting."
                : `${sync.waiting} record${sync.waiting === 1 ? "" : "s"} waiting to go up.`}
            </div>
          </div>
        </div>

        <div className={`rounded-2xl p-6 ${t.cardBg}`}>
          <h3 className={`font-semibold ${t.textPrimary}`}>Disconnect</h3>
          <p className={`text-sm mt-1 mb-4 ${t.textSecondary}`}>
            Stops this branch reporting to HQ. Nothing is deleted &mdash; your sales, repairs and
            inventory stay on this device exactly as they are.
          </p>
          <button
            onClick={disconnect}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-red-500 bg-red-500/10"
          >
            <Unlink className="w-4 h-4" /> Disconnect from HQ
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <div className="flex items-center gap-3">
          <Link2 className={t.dark ? "text-amber-300" : "text-amber-500"} size={20} />
          <div>
            <h3 className={`font-semibold ${t.textPrimary}`}>
              Connect this branch to HQ
            </h3>
            <p className={`text-sm ${t.textSecondary}`}>
              Your head office sees this branch&rsquo;s sales and repairs on their phone. We
              send them a code &mdash; ring them and they&rsquo;ll read it out.
            </p>
            <p className={`text-xs mt-2 ${t.textMuted}`}>{WHERE_IT_LIVES}</p>
          </div>
        </div>

        {step === "code" ? (
          <form onSubmit={submitCode} className="mt-5">
            <p className={`text-sm mb-4 ${t.textSecondary}`}>
              We sent a 6-digit code to <b className={t.textPrimary}>{sentTo}</b>.{" "}
              Ring them and ask for it.
            </p>
            <label className="block mb-4">
              <span className={`block text-xs font-semibold mb-2 ${t.textSecondary}`}>The code</span>
              {/* No maxlength: it would cut a code typed with spaces before the
                  handler strips them. Six digits is enforced below instead. */}
              <input
                className={`${input} text-center text-2xl font-semibold tracking-[0.4em]`}
                inputMode="numeric"
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                autoFocus
              />
            </label>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <div className="flex gap-3 flex-wrap">
              <button
                type="submit"
                disabled={step === "working"}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg} ${
                  step === "working" ? "opacity-60" : ""
                }`}
              >
                <CheckCircle2 className="w-4 h-4" /> Connect
              </button>
              <button
                type="button"
                onClick={() => {
                  setStep("idle");
                  setCode("");
                  setError("");
                }}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg}`}
              >
                Use a different email or number
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={askForCode} className="mt-5">
            <label className="block mb-4">
              <span className={`block text-xs font-semibold mb-2 ${t.textSecondary}`}>
                <Building2 className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Name for this branch
              </span>
              <input
                className={input}
                placeholder="Akure South"
                value={branchName}
                onChange={(e) => setBranchName(e.target.value)}
              />
              <span className={`block text-xs mt-2 ${t.textMuted}`}>
                This is what HQ sees this shop called.
              </span>
            </label>
            <label className="block mb-4">
              <span className={`block text-xs font-semibold mb-2 ${t.textSecondary}`}>
                <Phone className="inline w-3.5 h-3.5 mr-1 -mt-0.5" />
                Your HQ&rsquo;s email or number
              </span>
              <input
                className={input}
                placeholder="hq@shop.com or 08012345678"
                value={hqIdentifier}
                onChange={(e) => setHqIdentifier(e.target.value)}
              />
              <span className={`block text-xs mt-2 ${t.textMuted}`}>
                Whichever your head office registered with. The code goes to them, not here.
              </span>
            </label>
            {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
            <button
              type="submit"
              disabled={step === "working"}
              className={`flex items-center gap-2 px-5 py-3 rounded-xl text-base font-bold disabled:opacity-60 ${
                t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
              }`}
            >
              <Link2 className="w-4 h-4" />{" "}
              {step === "working" ? "Sending…" : "Send HQ a code"}
            </button>
          </form>
        )}
      </div>

      <div className={`rounded-2xl p-6 ${t.cardBg}`}>
        <button
          type="button"
          onClick={() => setShowNoHq((v) => !v)}
          className={`flex items-center justify-between w-full text-left font-semibold ${t.textPrimary}`}
          aria-expanded={showNoHq}
        >
          No HQ yet?
          <ChevronDown className={`w-4 h-4 shrink-0 transition-transform ${showNoHq ? "rotate-180" : ""}`} />
        </button>
        {showNoHq && (
          <p className={`text-sm mt-2 ${t.textSecondary}`}>
            Head office signs up once at {siteLabel("hq.html")} with their email or phone
            number. Every branch then connects to that.
          </p>
        )}
      </div>
    </div>
  );
}
