import React, { useEffect, useState } from "react";
import { ArrowRight, Mic, MessageCircle, Camera, Check, Sparkles } from "lucide-react";
import AssistantBot from "../components/AssistantBot";

// Page 4 of the welcome: the assistant. A glowing robot in the middle, and
// three short scenes on a loop under it -- talk, ask, snap -- each acted out
// the way it works in the app. Plain CSS keyframes (prefixed ai*), like the
// rest of the welcome; reduced-motion is handled by OnboardingScreen's root.

const EASE = "cubic-bezier(.2,.8,.2,1)";
const SPRING = "cubic-bezier(.3,1.45,.5,1)";
const SCENE_MS = 5200;

/** Types `text` out, starting after `delay`. */
function useTypewriter(text, { delay = 0, speed = 38 } = {}) {
  const [n, setN] = useState(0);
  useEffect(() => {
    let id;
    const start = setTimeout(() => {
      id = setInterval(() => setN((v) => (v >= text.length ? (clearInterval(id), v) : v + 1)), speed);
    }, delay);
    return () => { clearTimeout(start); clearInterval(id); };
  }, [text, delay, speed]);
  return text.slice(0, n);
}

function useAfter(ms) {
  const [on, setOn] = useState(false);
  useEffect(() => { const t = setTimeout(() => setOn(true), ms); return () => clearTimeout(t); }, [ms]);
  return on;
}

function Bubble({ text, delay }) {
  const typed = useTypewriter(text, { delay });
  return (
    <div className="self-end max-w-[88%] rounded-2xl rounded-br-md px-3.5 py-2 text-[13px] font-medium text-white bg-gradient-to-br from-indigo-500 to-sky-500 shadow-lg"
      style={{ animation: `aiIn .45s ${SPRING} ${delay / 1000 - 0.2}s both` }}>
      {typed}<span className="ai-caret" />
    </div>
  );
}

function Wave({ until }) {
  const live = !useAfter(until);
  return (
    <div className="flex items-end justify-center gap-[3px] h-6" aria-hidden="true">
      {Array.from({ length: 17 }).map((_, i) => (
        <span key={i} className="w-[3px] rounded-full bg-gradient-to-t from-indigo-400 to-sky-300"
          style={{ height: live ? "100%" : "18%", transformOrigin: "bottom", animation: live ? `aiWave .9s ease-in-out ${(i % 6) * 0.08}s infinite alternate` : "none", transition: "height .4s" }} />
      ))}
    </div>
  );
}

function Field({ label, value, at }) {
  const on = useAfter(at);
  return (
    <div className={`flex justify-between gap-3 text-[12px] py-1 border-b border-white/10 last:border-0 transition-all duration-500 ${on ? "opacity-100" : "opacity-0 translate-x-2"}`}>
      <span className="text-neutral-400">{label}</span>
      <span className="text-white font-semibold">{value}</span>
    </div>
  );
}

function TalkScene() {
  const card = useAfter(2700);
  return (
    <div className="flex flex-col gap-3">
      <Wave until={2500} />
      <Bubble text="Sell two chargers to Bola, she paid by transfer" delay={350} />
      <div className={`rounded-2xl border border-emerald-400/30 bg-white/[0.06] p-3 transition-all duration-500 ${card ? "opacity-100" : "opacity-0 translate-y-3"}`}
        style={{ boxShadow: card ? "0 0 40px -12px rgba(52,211,153,.55)" : "none" }}>
        <div className="flex items-center gap-2 text-[11px] font-bold tracking-wider text-emerald-300 mb-1"><Check className="w-3.5 h-3.5" /> SALE, READY TO SAVE</div>
        <Field label="Customer" value="Bola Oluwatoyin" at={2900} />
        <Field label="Item" value="2 × 20W charger" at={3150} />
        <Field label="Paid" value="Bank transfer" at={3400} />
      </div>
    </div>
  );
}

function AskScene() {
  const rows = [["Tunde Bakare", "45,000"], ["Aisha Bello", "20,000"], ["Ken Obi", "7,500"]];
  const answer = useAfter(1700);
  return (
    <div className="flex flex-col gap-3">
      <Bubble text="Who owes me money?" delay={250} />
      <div className={`rounded-2xl border border-white/10 bg-white/[0.06] p-3 transition-all duration-500 ${answer ? "opacity-100" : "opacity-0 translate-y-3"}`}>
        <div className="text-[11px] font-bold tracking-wider text-sky-300">ANSWERED IN A SECOND</div>
        <div className="text-xl font-bold text-white tabular-nums mt-0.5">72,500 owed</div>
        {rows.map(([n, v], i) => (
          <Field key={n} label={n} value={v} at={2000 + i * 260} />
        ))}
      </div>
    </div>
  );
}

function SnapScene() {
  const done = useAfter(2900);
  const lines = ["2 phone cases — 6,000", "Screen fix, Mr Ade — 15,000", "Charger — 7,500", "Battery, Kemi — 18,000"];
  return (
    <div className="flex gap-3 items-stretch">
      <div className="relative w-[46%] rounded-xl bg-[#fdf6e3] p-2.5 overflow-hidden rotate-[-3deg] shadow-xl" style={{ animation: `aiIn .5s ${SPRING} both` }}>
        {lines.map((l) => (
          <div key={l} className="text-[9.5px] leading-[19px] text-[#3b3b9a] border-b border-[#9ec5ff]/70 truncate" style={{ fontFamily: "'Comic Sans MS', 'Segoe Print', cursive" }}>{l}</div>
        ))}
        {!done && <span className="absolute inset-x-0 h-8 bg-gradient-to-b from-sky-400/0 via-sky-400/50 to-sky-400/0" style={{ animation: "aiScan 1.3s ease-in-out infinite alternate" }} />}
      </div>
      <div className="flex-1 flex flex-col justify-center gap-1.5">
        {lines.map((l, i) => (
          <Row key={l} text={l.split(" — ")[0]} at={1300 + i * 380} />
        ))}
        <div className={`text-[11px] font-bold text-emerald-300 mt-1 transition-opacity duration-500 ${done ? "opacity-100" : "opacity-0"}`}>4 sales read. You check, then save.</div>
      </div>
    </div>
  );
}

function Row({ text, at }) {
  const on = useAfter(at);
  return (
    <div className={`flex items-center gap-1.5 text-[11.5px] text-white rounded-lg bg-white/[0.07] px-2 py-1 transition-all duration-500 ${on ? "opacity-100" : "opacity-0 -translate-x-2"}`}>
      <Check className="w-3 h-3 text-emerald-400 shrink-0" /><span className="truncate">{text}</span>
    </div>
  );
}

const SCENES = [
  { key: "talk", Icon: Mic, label: "Talk", Scene: TalkScene },
  { key: "ask", Icon: MessageCircle, label: "Ask", Scene: AskScene },
  { key: "snap", Icon: Camera, label: "Snap", Scene: SnapScene },
];

export default function AiShowcase({ onNext, onBack }) {
  const [scene, setScene] = useState(0);
  // Each scene gets its full time, whether it came round by itself or was tapped.
  useEffect(() => {
    const id = setTimeout(() => setScene((s) => (s + 1) % SCENES.length), SCENE_MS);
    return () => clearTimeout(id);
  }, [scene]);
  const S = SCENES[scene];
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-14">
      <AiStyles />
      <div className="w-full max-w-sm">
        <div className="flex justify-center" style={{ animation: `aiIn .7s ${SPRING} both` }}>
          <div className="relative w-28 h-28 grid place-items-center">
            {/* aura, the spinning ring, and three orbiting sparks */}
            {[0, 1.2].map((d) => <span key={d} className="absolute inset-0 rounded-full border border-sky-300/40" style={{ animation: `aiPulse 2.4s ease-out ${d}s infinite` }} />)}
            <span className="absolute -inset-1 rounded-full" style={{ background: "conic-gradient(from 0deg, #6366f1, #0ea5e9, #34d399, #a855f7, #6366f1)", animation: "aiSpin 3.2s linear infinite", filter: "blur(.5px)" }} />
            <span className="absolute inset-[3px] rounded-full bg-[#0b0b1d]" />
            <span className="absolute inset-[3px] rounded-full" style={{ background: "radial-gradient(circle at 50% 35%, rgba(99,102,241,.55), rgba(14,165,233,.15) 60%, transparent 70%)" }} />
            {[0, 1, 2].map((i) => (
              <span key={i} className="absolute inset-0" style={{ animation: `aiSpin ${5 + i * 2}s linear ${-i}s infinite ${i % 2 ? "reverse" : ""}` }}>
                <span className="absolute left-1/2 -top-1.5 w-2 h-2 rounded-full" style={{ background: ["#38bdf8", "#a78bfa", "#34d399"][i], boxShadow: `0 0 12px ${["#38bdf8", "#a78bfa", "#34d399"][i]}` }} />
              </span>
            ))}
            <span className="relative" style={{ animation: "aiFloat 3s ease-in-out infinite" }}>
              <AssistantBot size={72} listening={S.key === "talk"} />
            </span>
          </div>
        </div>

        <h1 className="ai-shimmer text-[28px] leading-tight font-extrabold text-center mt-6" style={{ animation: `aiRise .6s ${EASE} .15s both` }}>
          Meet your AI assistant
        </h1>
        <p className="text-sm text-neutral-400 text-center mt-1.5" style={{ animation: `aiRise .6s ${EASE} .25s both` }}>
          Talk to it, ask it, or show it your notebook. It does the typing.
        </p>

        <div className="flex justify-center gap-2 mt-5">
          {SCENES.map((s, i) => (
            <button key={s.key} onClick={() => setScene(i)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all duration-300 ${i === scene ? "bg-white text-neutral-900 scale-105" : "bg-white/[0.07] text-neutral-300"}`}>
              <s.Icon className="w-3.5 h-3.5" /> {s.label}
              {i === scene && <span className="ml-0.5 h-1 w-8 rounded-full bg-neutral-900/15 overflow-hidden"><span className="block h-full bg-neutral-900/70" style={{ animation: `aiBar ${SCENE_MS}ms linear both` }} key={scene} /></span>}
            </button>
          ))}
        </div>

        <div className="relative mt-4 h-[262px] rounded-3xl border border-white/10 bg-white/[0.04] p-4 overflow-hidden"
          style={{ boxShadow: "0 30px 80px -30px rgba(99,102,241,.6)" }}>
          <div key={scene} style={{ animation: `aiSwap .5s ${EASE} both` }}>
            <S.Scene />
          </div>
        </div>

        <div className="flex flex-wrap justify-center gap-1.5 mt-4" style={{ animation: "aiFade .6s ease-out .5s both" }}>
          {["Understands any names", "Answers in a second", "You check before it saves"].map((c) => (
            <span key={c} className="flex items-center gap-1 text-[11px] text-neutral-300 rounded-full bg-white/[0.06] border border-white/10 px-2.5 py-1">
              <Sparkles className="w-3 h-3 text-sky-300" /> {c}
            </span>
          ))}
        </div>

        <button onClick={onNext}
          className="w-full mt-6 flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold text-white bg-gradient-to-r from-indigo-500 to-sky-500 shadow-[0_14px_44px_-14px_rgba(56,189,248,.8)] active:scale-[.98] transition-transform">
          Next <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={onBack} className="w-full mt-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors">Back</button>
      </div>
    </div>
  );
}

function AiStyles() {
  return (
    <style>{`
      @keyframes aiIn { from { opacity: 0; transform: translateY(10px) scale(.92); } to { opacity: 1; transform: none; } }
      @keyframes aiRise { from { opacity: 0; transform: translateY(14px); } to { opacity: 1; transform: none; } }
      @keyframes aiFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes aiSwap { from { opacity: 0; transform: translateX(26px); } to { opacity: 1; transform: none; } }
      @keyframes aiSpin { to { transform: rotate(360deg); } }
      @keyframes aiPulse { 0% { opacity: .7; transform: scale(1); } 100% { opacity: 0; transform: scale(1.75); } }
      @keyframes aiFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
      @keyframes aiWave { from { transform: scaleY(.18); } to { transform: scaleY(1); } }
      @keyframes aiScan { from { top: -10%; } to { top: 85%; } }
      @keyframes aiBar { from { width: 0; } to { width: 100%; } }
      @keyframes aiShimmer { from { background-position: 0% center; } to { background-position: 200% center; } }
      @keyframes aiBlink { 50% { opacity: 0; } }
      .ai-shimmer { background: linear-gradient(90deg, #fff 0%, #a5b4fc 25%, #7dd3fc 50%, #fff 75%, #a5b4fc 100%); background-size: 200% auto;
        -webkit-background-clip: text; background-clip: text; color: transparent; animation: aiShimmer 4s linear infinite; }
      .ai-caret { display: inline-block; width: 2px; height: 1em; margin-left: 2px; vertical-align: -2px; background: rgba(255,255,255,.85); animation: aiBlink .9s steps(1) infinite; }
    `}</style>
  );
}
