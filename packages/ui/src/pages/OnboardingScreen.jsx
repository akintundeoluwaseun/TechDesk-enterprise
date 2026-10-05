import React, { useEffect, useState } from "react";
import BrandMark from "../components/BrandMark";
import {
  ShoppingCart,
  Wrench,
  Box,
  BarChart3,
  ArrowRight,
  ArrowLeft,
  Smartphone,
  Bell,
  Users,
  Building2,
  WifiOff,
} from "lucide-react";
import { ForceDark, useThemeTokens } from "../lib/ThemeContext";
import AccountGateScreen from "./AccountGateScreen";

// First run, before "new sale" or "new repair" mean anything yet: what this
// is, what it does, then the question AccountGateScreen already asks (set up
// a new business, connect to one, or stay fully local). Dark throughout
// regardless of the shop's own theme choice -- see ForceDark.
//
// All motion is plain CSS keyframes (ObStyles below): no animation library
// to ship for a screen that runs once per install.
const STEP_COUNT = 5;
const SLIDE_MS = 4200;
const EASE = "cubic-bezier(.2,.8,.2,1)";
const SPRING = "cubic-bezier(.3,1.45,.5,1)";

function useCountUp(to, { delay = 0, duration = 900 } = {}) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf;
    let start;
    const timer = setTimeout(() => {
      const frame = (ts) => {
        if (start === undefined) start = ts;
        const p = Math.min(1, (ts - start) / duration);
        setValue(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(frame);
      };
      raf = requestAnimationFrame(frame);
    }, delay);
    return () => {
      clearTimeout(timer);
      cancelAnimationFrame(raf);
    };
  }, [to, delay, duration]);
  return value;
}

/** 0 until the first time passes, then 1, 2, ... -- a tiny timeline. */
function usePhase(times) {
  const [phase, setPhase] = useState(0);
  useEffect(() => {
    const ids = times.map((ms, i) => setTimeout(() => setPhase(i + 1), ms));
    return () => ids.forEach(clearTimeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return phase;
}

const naira = (n) => `₦${n.toLocaleString("en-NG")}`;

// ---------------------------------------------------------------- backdrop

function Backdrop() {
  const glow = (color) => `radial-gradient(circle at center, ${color}, transparent 65%)`;
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <div
        className="absolute rounded-full"
        style={{ width: 520, height: 520, left: -180, top: -160, background: glow("rgba(99,102,241,.38)"), animation: "obDrift1 19s ease-in-out infinite alternate" }}
      />
      <div
        className="absolute rounded-full"
        style={{ width: 460, height: 460, right: -170, bottom: -140, background: glow("rgba(14,165,233,.30)"), animation: "obDrift2 23s ease-in-out infinite alternate" }}
      />
      <div
        className="absolute rounded-full"
        style={{ width: 340, height: 340, left: "35%", top: "45%", background: glow("rgba(16,185,129,.16)"), animation: "obDrift3 27s ease-in-out infinite alternate" }}
      />
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: "radial-gradient(rgba(255,255,255,.075) 1px, transparent 1px)",
          backgroundSize: "22px 22px",
          maskImage: "radial-gradient(ellipse at center, black 25%, transparent 72%)",
          WebkitMaskImage: "radial-gradient(ellipse at center, black 25%, transparent 72%)",
        }}
      />
    </div>
  );
}

function Dots({ step }) {
  return (
    <div className="fixed top-6 inset-x-0 flex items-center justify-center gap-2 z-20">
      {Array.from({ length: STEP_COUNT }).map((_, i) => (
        <span
          key={i}
          className={`h-1.5 rounded-full transition-all duration-500 ${i === step ? "w-7 bg-white" : i < step ? "w-1.5 bg-white/60" : "w-1.5 bg-white/20"}`}
        />
      ))}
    </div>
  );
}

// ----------------------------------------------------------------- welcome

const CHIPS = [
  { pos: { left: "0%", top: "6%" }, dot: "bg-emerald-400", a: naira(45000), b: "Sale · Paid", delay: 0.6, bob: 0 },
  { pos: { right: "0%", top: "20%" }, dot: "bg-sky-400", a: "iPhone 11", b: "Repair · Ready", delay: 0.75, bob: 1.3 },
  { pos: { left: "3%", bottom: "10%" }, dot: "bg-amber-400", a: "Low stock", b: "Chargers · 2 left", delay: 0.9, bob: 0.7 },
  { pos: { right: "3%", bottom: "2%" }, dot: "bg-indigo-400", a: "+18%", b: "This week", delay: 1.05, bob: 1.9 },
];

function Welcome({ onNext }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-16">
      <div className="relative w-full max-w-[340px] h-[240px] mb-8">
        <div className="absolute inset-0 flex items-center justify-center">
          {[0, 1.4].map((d) => (
            <span
              key={d}
              className="absolute w-24 h-24 rounded-[28px] border border-white/30"
              style={{ animation: `obRing 2.8s ease-out ${1 + d}s infinite` }}
            />
          ))}
          <div
            className="relative w-24 h-24 rounded-[28px]"
            style={{ boxShadow: "0 24px 70px -18px rgba(56,189,248,.6)", animation: `obLogo .9s ${SPRING} both` }}
          >
            <BrandMark className="w-24 h-24" />
          </div>
        </div>

        {CHIPS.map((c) => (
          <div key={c.b} className="absolute" style={{ ...c.pos, animation: `obPop .6s ${SPRING} ${c.delay}s both` }}>
            <div
              className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.07] backdrop-blur-md px-3 py-2 shadow-lg shadow-black/30"
              style={{ animation: `obBob 5s ease-in-out ${c.bob}s infinite` }}
            >
              <span className={`w-2 h-2 rounded-full ${c.dot}`} />
              <div className="leading-tight">
                <div className="text-[12px] font-semibold text-white tabular-nums">{c.a}</div>
                <div className="text-[10px] text-neutral-400">{c.b}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <h1 className="text-center font-bold leading-tight mb-3">
        <span className="block text-lg font-medium text-neutral-300" style={{ animation: `obRise .7s ${EASE} .35s both` }}>
          Welcome to
        </span>{" "}
        <span
          className="block text-[42px] tracking-tight"
          style={{
            backgroundImage: "linear-gradient(90deg,#ffffff 0%,#bae6fd 30%,#c7d2fe 55%,#ffffff 80%)",
            backgroundSize: "200% auto",
            WebkitBackgroundClip: "text",
            backgroundClip: "text",
            color: "transparent",
            animation: `obRise .7s ${EASE} .5s both, obShimmer 6s linear 1.4s infinite`,
          }}
        >
          TechDesk
        </span>
      </h1>
      <p className="text-sm text-neutral-400 text-center max-w-xs leading-relaxed" style={{ animation: `obRise .7s ${EASE} .7s both` }}>
        Everything a repair shop needs to run its day &mdash; sales, repairs, stock and more, all in one place.
      </p>

      <button
        onClick={onNext}
        className="relative overflow-hidden mt-9 flex items-center gap-2 px-7 py-3.5 rounded-2xl font-semibold bg-white text-black shadow-[0_12px_40px_-12px_rgba(255,255,255,.55)] active:scale-[.97] transition-transform"
        style={{ animation: `obRise .7s ${EASE} .9s both` }}
      >
        Get Started <ArrowRight className="w-4 h-4" />
        <span
          aria-hidden="true"
          className="absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-black/10 to-transparent"
          style={{ animation: "obShine 3.6s ease-in-out 2.2s infinite" }}
        />
      </button>
    </div>
  );
}

// ------------------------------------------------------- feature showcases

function SalesDemo() {
  const total = useCountUp(10500, { delay: 1350, duration: 900 });
  const items = [
    ["Screen guard", 3000],
    ["Fast charger", 5500],
    ["Phone case", 2000],
  ];
  return (
    <div className="h-full flex items-end justify-center">
      <div
        className="relative w-[214px] rounded-t-2xl bg-white text-neutral-900 px-4 pt-4 pb-12 shadow-2xl"
        style={{ animation: `obPrint .9s ${EASE} both` }}
      >
        <div className="flex items-center justify-between mb-3">
          <span className="text-[11px] font-black tracking-[0.2em]">RECEIPT</span>
          <span className="text-[10px] text-neutral-400">INV-0042</span>
        </div>
        {items.map(([name, price], i) => (
          <div
            key={name}
            className="flex justify-between text-[12px] py-1"
            style={{ animation: `obRise .4s ${EASE} ${0.45 + i * 0.25}s both` }}
          >
            <span className="text-neutral-500">{name}</span>
            <span className="font-medium tabular-nums">{naira(price)}</span>
          </div>
        ))}
        <div className="border-t border-dashed border-neutral-300 my-2" style={{ animation: "obFade .3s ease-out 1.2s both" }} />
        <div className="flex justify-between text-[13px] font-bold" style={{ animation: "obFade .3s ease-out 1.25s both" }}>
          <span>Total</span>
          <span className="tabular-nums">{naira(total)}</span>
        </div>
        <div
          className="absolute right-4 bottom-3 px-2 py-0.5 border-2 border-emerald-500 text-emerald-600 text-[11px] font-black tracking-[0.2em] rounded-md"
          style={{ animation: `obStamp .5s ${SPRING} 2.35s both` }}
        >
          PAID
        </div>
      </div>
    </div>
  );
}

const STAGES = ["Received", "In progress", "Ready", "Delivered"];

function RepairsDemo() {
  const phase = usePhase([450, 1150, 1850, 2550]);
  const at = Math.max(0, Math.min(STAGES.length - 1, phase - 1));
  const lit = (i) => phase > 0 && i <= at;
  return (
    <div className="h-full flex flex-col justify-center gap-7 px-1">
      <div
        className="flex items-center gap-3 rounded-2xl bg-white/[0.06] border border-white/10 p-3"
        style={{ animation: `obRise .6s ${EASE} both` }}
      >
        <div className="w-10 h-10 rounded-xl bg-sky-400/15 flex items-center justify-center shrink-0">
          <Smartphone className="w-5 h-5 text-sky-300" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-white">iPhone 11</div>
          <div className="text-xs text-neutral-400 truncate">Cracked screen &middot; TCK-0108</div>
        </div>
        <span
          key={at}
          className={`text-[11px] font-semibold px-2.5 py-1 rounded-full whitespace-nowrap ${
            at === STAGES.length - 1 ? "bg-emerald-400/15 text-emerald-300" : "bg-sky-400/15 text-sky-300"
          }`}
          style={{ animation: `obPop .35s ${SPRING} both` }}
        >
          {STAGES[at]}
        </span>
      </div>

      <div className="relative">
        <div className="absolute left-5 right-5 top-[7px] h-0.5 rounded bg-white/10" />
        <div
          className="absolute left-5 top-[7px] h-0.5 rounded bg-gradient-to-r from-sky-400 to-emerald-400"
          style={{ width: `calc((100% - 2.5rem) * ${phase > 0 ? at / (STAGES.length - 1) : 0})`, transition: `width .7s ${EASE}` }}
        />
        <div className="relative flex justify-between">
          {STAGES.map((s, i) => (
            <div key={s} className="flex flex-col items-center gap-2 w-10">
              <span
                className={`w-4 h-4 rounded-full border-2 ${lit(i) ? "bg-sky-400 border-sky-300" : "bg-neutral-900 border-white/20"}`}
                style={{
                  transition: "all .45s ease-out",
                  transform: lit(i) && i === at ? "scale(1.3)" : "scale(1)",
                  boxShadow: lit(i) && i === at ? "0 0 0 6px rgba(56,189,248,.18)" : "none",
                }}
              />
              <span className={`text-[10px] text-center leading-tight whitespace-nowrap ${lit(i) ? "text-white" : "text-neutral-500"}`} style={{ transition: "color .45s" }}>
                {s}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function InventoryDemo() {
  const phase = usePhase([150, 1750]);
  const rows = [
    { name: "iPhone 11 screens", full: 78, color: "bg-emerald-400" },
    { name: "USB-C chargers", full: 58, color: "bg-sky-400" },
    { name: "Batteries", full: 44, color: "bg-indigo-400", drainsTo: 8 },
  ];
  return (
    <div className="h-full flex flex-col justify-center gap-5 px-1">
      {rows.map((r, i) => {
        const draining = r.drainsTo !== undefined && phase >= 2;
        const width = phase === 0 ? 0 : draining ? r.drainsTo : r.full;
        return (
          <div key={r.name} style={{ animation: `obRise .5s ${EASE} ${i * 0.12}s both` }}>
            <div className="flex items-center justify-between mb-1.5 h-5">
              <span className="text-[13px] text-white">{r.name}</span>
              {draining ? (
                <span
                  className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-400/15 text-amber-300"
                  style={{ animation: `obPop .4s ${SPRING} .5s both, obShake .5s ease-in-out 1s` }}
                >
                  Low stock
                </span>
              ) : (
                <span className="text-[11px] text-neutral-400 tabular-nums">{Math.round(width / 3)} left</span>
              )}
            </div>
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className={`h-full rounded-full ${draining ? "bg-amber-400" : r.color}`}
                style={{ width: `${width}%`, transition: `width .9s ${EASE}, background-color .4s` }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ReportsDemo() {
  const pct = useCountUp(18, { delay: 700, duration: 1100 });
  const revenue = useCountUp(495000, { delay: 300, duration: 1400 });
  const bars = [38, 52, 44, 66, 58, 81, 94];
  return (
    <div className="h-full flex flex-col">
      <div className="flex items-end justify-between mb-4" style={{ animation: "obFade .4s ease-out both" }}>
        <div>
          <div className="text-[11px] text-neutral-400">Revenue this week</div>
          <div className="text-xl font-bold text-white tabular-nums">{naira(revenue)}</div>
        </div>
        <span className="text-xs font-semibold px-2 py-1 rounded-full bg-emerald-400/15 text-emerald-300 tabular-nums">+{pct}%</span>
      </div>
      <div className="flex-1 flex items-end gap-2">
        {bars.map((h, i) => (
          <div
            key={i}
            className={`flex-1 rounded-t-md ${i === bars.length - 1 ? "bg-gradient-to-t from-emerald-500/70 to-emerald-300" : "bg-gradient-to-t from-indigo-500/50 to-sky-400"}`}
            style={{ height: `${h}%`, transformOrigin: "bottom", animation: `obGrow .7s ${EASE} ${0.15 + i * 0.08}s both` }}
          />
        ))}
      </div>
      <div className="flex mt-2 text-[10px] text-neutral-500">
        {["M", "T", "W", "T", "F", "S", "S"].map((d, i) => (
          <span key={i} className="flex-1 text-center">
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

const FEATURES = [
  { key: "sales", label: "Sales", icon: ShoppingCart, headline: "Ring up a sale in seconds", text: "Add items, take payment, then print or WhatsApp the receipt.", Demo: SalesDemo },
  { key: "repairs", label: "Repairs", icon: Wrench, headline: "Track every job to the end", text: "From booked in to collected — you always know where each one is.", Demo: RepairsDemo },
  { key: "inventory", label: "Inventory", icon: Box, headline: "Never run out by surprise", text: "Every sale takes stock off the shelf. Running low? You see it first.", Demo: InventoryDemo },
  { key: "reports", label: "Reports", icon: BarChart3, headline: "Know how the shop is doing", text: "Revenue, profit and trends for any day, week or month.", Demo: ReportsDemo },
];

function QuickInfo({ onNext, onBack }) {
  const [active, setActive] = useState(0);
  useEffect(() => {
    const id = setTimeout(() => setActive((a) => (a + 1) % FEATURES.length), SLIDE_MS);
    return () => clearTimeout(id);
  }, [active]);
  const feature = FEATURES[active];
  const Demo = feature.Demo;

  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-white" style={{ animation: `obRise .6s ${EASE} both` }}>
          Everything your shop needs
        </h1>
        <p className="text-sm text-neutral-400 text-center mt-1.5 mb-6" style={{ animation: `obRise .6s ${EASE} .1s both` }}>
          One app for the whole counter.
        </p>

        <div
          className="relative h-[250px] rounded-3xl border border-white/10 bg-white/[0.04] overflow-hidden p-5 mb-4"
          style={{ boxShadow: "0 30px 80px -30px rgba(99,102,241,.5)", animation: `obPop .6s ${EASE} .15s both` }}
        >
          <div key={feature.key} className="h-full" style={{ animation: `obSlide .55s ${EASE} both` }}>
            <Demo />
          </div>
        </div>

        <div key={`${feature.key}-caption`} className="text-center mb-5 min-h-[60px]" style={{ animation: "obFade .5s ease-out both" }}>
          <div className="text-white font-semibold">{feature.headline}</div>
          <div className="text-sm text-neutral-400 mt-1">{feature.text}</div>
        </div>

        <div role="tablist" className="grid grid-cols-4 gap-2 mb-8">
          {FEATURES.map((f, i) => {
            const Icon = f.icon;
            const on = i === active;
            return (
              <button
                key={f.key}
                role="tab"
                aria-selected={on}
                onClick={() => setActive(i)}
                className={`relative overflow-hidden flex flex-col items-center gap-1 py-2.5 rounded-xl text-[11px] font-medium transition-colors duration-300 ${
                  on ? "bg-white text-black" : "bg-white/[0.06] text-neutral-300 hover:bg-white/10"
                }`}
              >
                <Icon className="w-4 h-4" />
                {f.label}
                {on && (
                  <span
                    aria-hidden="true"
                    className="absolute left-0 bottom-0 h-[3px] bg-black/25"
                    style={{ animation: `obBar ${SLIDE_MS}ms linear both` }}
                  />
                )}
              </button>
            );
          })}
        </div>

        <button
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold bg-white text-black shadow-[0_12px_40px_-14px_rgba(255,255,255,.5)] active:scale-[.98] transition-transform"
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={onBack} className="w-full mt-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors">
          Back
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------- reminders and growth

const ALERTS = [
  { dot: "bg-emerald-400", title: "Ade made a sale", text: `${naira(12500)} · 2 × Screen guard`, at: 300 },
  { dot: "bg-amber-400", title: "Mr Bello hasn't paid", text: `${naira(15000)} owed since Monday`, at: 1300 },
  { dot: "bg-sky-400", title: "Mrs Okafor's laptop is ready", text: "Not collected yet · TCK-0117", at: 2300 },
];

function RemindersDemo() {
  const phase = usePhase(ALERTS.map((a) => a.at));
  return (
    <div className="h-full flex flex-col justify-center gap-3 px-1">
      {ALERTS.map((a, i) =>
        phase > i ? (
          <div
            key={a.title}
            className="flex items-start gap-3 rounded-2xl bg-white/[0.07] border border-white/10 p-3"
            style={{ animation: `obNotify .55s ${SPRING} both` }}
          >
            <div className="w-9 h-9 rounded-xl bg-white/10 flex items-center justify-center shrink-0 relative">
              <Bell className="w-4 h-4 text-white" />
              <span className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ${a.dot}`} />
            </div>
            <div className="min-w-0">
              <div className="text-[13px] font-semibold text-white">{a.title}</div>
              <div className="text-[11px] text-neutral-400 truncate">{a.text}</div>
            </div>
          </div>
        ) : (
          <div key={a.title} className="h-[62px]" />
        ),
      )}
    </div>
  );
}

const BRANCHES = ["Ikeja", "Yaba", "Lekki"];

function GrowthDemo() {
  const phase = usePhase([400, 1100, 1800, 2600]);
  return (
    <div className="h-full flex flex-col justify-between">
      <div
        className="mx-auto flex items-center gap-2 rounded-2xl bg-white text-neutral-900 px-4 py-2.5 shadow-xl"
        style={{ animation: `obPop .6s ${SPRING} both` }}
      >
        <Building2 className="w-4 h-4" />
        <span className="text-[13px] font-bold">Head office</span>
        <span className="text-[11px] font-semibold text-emerald-600 tabular-nums">{naira(Math.min(3, Math.max(0, phase - 1)) * 165000)}</span>
      </div>
      <div className="relative flex justify-between px-2">
        {BRANCHES.map((b, i) => (
          <div key={b} className="flex flex-col items-center gap-2 w-[30%]">
            <span
              className="w-0.5 h-8 rounded bg-gradient-to-t from-sky-400/0 to-sky-400"
              style={{ opacity: phase > i + 1 ? 1 : 0.15, transition: "opacity .5s" }}
            />
            <div
              className="w-full rounded-xl bg-white/[0.07] border border-white/10 py-2 text-center"
              style={{ animation: `obRise .5s ${EASE} ${0.1 + i * 0.12}s both` }}
            >
              <div className="text-[12px] font-semibold text-white">{b}</div>
              <div className="text-[10px] text-neutral-400 flex items-center justify-center gap-1">
                <Users className="w-3 h-3" /> {i + 2} staff
              </div>
            </div>
          </div>
        ))}
      </div>
      <div
        className="mx-auto flex items-center gap-1.5 text-[11px] text-neutral-300 rounded-full bg-white/[0.06] px-3 py-1.5"
        style={{ animation: `obFade .5s ease-out 2.4s both` }}
      >
        <WifiOff className="w-3.5 h-3.5" /> Works offline · catches up when you're back
      </div>
    </div>
  );
}

function StoryPage({ title, subtitle, Demo, headline, text, onNext, onBack }) {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-white" style={{ animation: `obRise .6s ${EASE} both` }}>
          {title}
        </h1>
        <p className="text-sm text-neutral-400 text-center mt-1.5 mb-6" style={{ animation: `obRise .6s ${EASE} .1s both` }}>
          {subtitle}
        </p>
        <div
          className="relative h-[250px] rounded-3xl border border-white/10 bg-white/[0.04] overflow-hidden p-5 mb-4"
          style={{ boxShadow: "0 30px 80px -30px rgba(14,165,233,.45)", animation: `obPop .6s ${EASE} .15s both` }}
        >
          <Demo />
        </div>
        <div className="text-center mb-8 min-h-[60px]" style={{ animation: "obFade .5s ease-out .3s both" }}>
          <div className="text-white font-semibold">{headline}</div>
          <div className="text-sm text-neutral-400 mt-1">{text}</div>
        </div>
        <button
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl font-semibold bg-white text-black shadow-[0_12px_40px_-14px_rgba(255,255,255,.5)] active:scale-[.98] transition-transform"
        >
          Next <ArrowRight className="w-4 h-4" />
        </button>
        <button onClick={onBack} className="w-full mt-3 py-2 text-sm text-neutral-400 hover:text-white transition-colors">
          Back
        </button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------- shell

function ObStyles() {
  return (
    <style>{`
      @keyframes obRise { from { opacity: 0; transform: translateY(16px); } to { opacity: 1; transform: none; } }
      @keyframes obFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes obPop { from { opacity: 0; transform: scale(.82); } to { opacity: 1; transform: none; } }
      @keyframes obLogo { from { opacity: 0; transform: scale(.55) rotate(-10deg); } to { opacity: 1; transform: none; } }
      @keyframes obRing { 0% { opacity: .6; transform: scale(1); } 100% { opacity: 0; transform: scale(2.15); } }
      @keyframes obBob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }
      @keyframes obShimmer { from { background-position: 0% center; } to { background-position: 200% center; } }
      @keyframes obShine { 0% { transform: translateX(-120%) skewX(-20deg); } 55%, 100% { transform: translateX(360%) skewX(-20deg); } }
      @keyframes obStep { from { opacity: 0; transform: translateX(var(--ob-dir, 28px)); } to { opacity: 1; transform: none; } }
      @keyframes obSlide { from { opacity: 0; transform: translateX(34px) scale(.98); } to { opacity: 1; transform: none; } }
      @keyframes obPrint { from { transform: translateY(104%); } to { transform: none; } }
      @keyframes obStamp { from { opacity: 0; transform: rotate(-14deg) scale(2.3); } to { opacity: 1; transform: rotate(-14deg) scale(1); } }
      @keyframes obShake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-4px); } 40% { transform: translateX(4px); } 60% { transform: translateX(-3px); } 80% { transform: translateX(3px); } }
      @keyframes obGrow { from { transform: scaleY(0); } to { transform: scaleY(1); } }
      @keyframes obBar { from { width: 0; } to { width: 100%; } }
      @keyframes obNotify { from { opacity: 0; transform: translateY(-18px) scale(.94); } to { opacity: 1; transform: none; } }
      @keyframes obDrift1 { to { transform: translate(90px, 70px) scale(1.12); } }
      @keyframes obDrift2 { to { transform: translate(-80px, -60px) scale(1.08); } }
      @keyframes obDrift3 { to { transform: translate(-110px, 40px) scale(1.2); } }
      @media (prefers-reduced-motion: reduce) {
        .ob-root *, .ob-root *::before, .ob-root *::after {
          animation-duration: .001ms !important;
          animation-delay: 0s !important;
          animation-iteration-count: 1 !important;
          transition-duration: .001ms !important;
        }
      }
    `}</style>
  );
}

function Onboarding({ onDone }) {
  const t = useThemeTokens();
  const [step, setStep] = useState(0);
  const [dir, setDir] = useState(1);
  const go = (next) => {
    setDir(next > step ? 1 : -1);
    setStep(next);
  };

  return (
    <div className={`ob-root relative min-h-screen w-full overflow-hidden ${t.bg}`}>
      <ObStyles />
      <Backdrop />
      <Dots step={step} />
      <div
        key={step}
        className="relative z-10"
        style={{ "--ob-dir": `${dir * 28}px`, animation: `obStep .55s ${EASE} both` }}
      >
        {step === 0 && <Welcome onNext={() => go(1)} />}
        {step === 1 && <QuickInfo onNext={() => go(2)} onBack={() => go(0)} />}
        {step === 2 && (
          <StoryPage
            title="Never lose track of money"
            subtitle="TechDesk tells you, so you don't have to remember."
            Demo={RemindersDemo}
            headline="Who sold what, who owes, who hasn't collected"
            text="A reminder every 5 hours until they pay or pick it up."
            onNext={() => go(3)}
            onBack={() => go(1)}
          />
        )}
        {step === 3 && (
          <StoryPage
            title="Grow without losing control"
            subtitle="Your staff, your branches, one picture."
            Demo={GrowthDemo}
            headline="Staff logins and head office"
            text="Each worker sees only what you allow. Every branch adds up at head office, even when the internet drops."
            onNext={() => go(4)}
            onBack={() => go(2)}
          />
        )}
        {step === 4 && <AccountGateScreen onDone={onDone} transparent />}
      </div>
      {step === 4 && (
        <button
          onClick={() => go(3)}
          className="fixed top-5 left-5 z-20 flex items-center gap-1 text-sm text-neutral-400 hover:text-white transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      )}
    </div>
  );
}

export default function OnboardingScreen({ onDone }) {
  return (
    <ForceDark>
      <Onboarding onDone={onDone} />
    </ForceDark>
  );
}
