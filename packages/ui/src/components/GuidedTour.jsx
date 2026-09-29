import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { MousePointerClick, ArrowRight, Check } from "lucide-react";
import { useSettings } from "../lib/SettingsContext";
import { useCloseOnBack } from "../lib/useCloseOnBack";

// The app, dimmed, with a spotlight on one thing at a time and a card saying
// what it is. A "click" step leaves exactly that element usable -- every other
// pixel is covered -- so the shop learns the menu by actually using it rather
// than by reading about it. A "next" step is look-only.
//
// Targets are found by data-tour="..." attributes on the real components, and
// followed every frame, so a drawer opening, a page loading or the window
// resizing just moves the spotlight with them.
//
// Step kinds (step.action):
//   next    look only; a Next button moves on
//   click   the target stays usable; clicking it moves on
//   do      the target stays usable (type in it, sign it) and Next moves on
//           once step.ready() says it's done
//   wait    the tour steps aside -- nothing drawn -- while the shop uses
//           something the target opened (a signature pad), until step.until()
//           is true; if the target goes away first, back to step.fallback
// A step with `center` has no target: the whole screen, one card, a button.
// A step with `route` opens that page first.

const FIND_TIMEOUT = 3000;
const LOST_TIMEOUT = 1500;
const PAD = 8;
const EASE = "cubic-bezier(.2,.8,.2,1)";

export function defaultTourSteps({ desktop, repairsLabel = "Repairs" }) {
  const newSale = {
    target: "new-sale",
    title: "Every sale starts here",
    body: "Add items, take payment, then print the receipt or send it on WhatsApp.",
    action: "next",
  };
  const newRepair = {
    target: "new-repair",
    title: "Book in a repair",
    body: "Each device gets a ticket you can print, and you can track it all the way to collection.",
    action: "next",
  };
  const newProduct = {
    target: "new-product",
    title: "Add what you sell",
    body: "Add a product once. Every sale takes it off the shelf, and you're warned when it runs low.",
    action: "next",
  };
  const stats = {
    target: "dash-stats",
    title: "Today, at a glance",
    body: `Today's sales, ${repairsLabel.toLowerCase()} and low stock. ${desktop ? "Click" : "Tap"} any box to jump straight to it.`,
    action: "next",
  };

  if (desktop) {
    return [
      { target: "sidebar-nav", title: "This is your menu", body: "Every part of TechDesk lives here, one click away wherever you are.", action: "next" },
      stats,
      { target: "nav-sales", title: "Sales", body: "Click Sales to open the till.", action: "click" },
      newSale,
      { target: "nav-repairs", title: repairsLabel, body: `Now click ${repairsLabel}.`, action: "click" },
      newRepair,
      { target: "nav-inventory", title: "Inventory", body: "And Inventory, where your stock lives.", action: "click" },
      newProduct,
      { target: "nav-settings", title: "Make it yours", body: "Settings holds your shop name, logo and receipt details. Worth a visit before your first sale.", action: "next" },
    ];
  }

  return [
    { target: "menu-button", title: "This is your menu", body: "Tap here to open it. Every part of TechDesk lives inside.", action: "click" },
    // If the drawer gets shut before Sales is tapped, go back and ask for the menu again.
    { target: "drawer-sales", title: "Sales", body: "Tap Sales to open the till.", action: "click", fallback: 0 },
    newSale,
    { target: "tab-repairs", title: "Your shortcuts", body: `The bar along the bottom holds what you'll use all day. Tap ${repairsLabel}.`, action: "click" },
    newRepair,
    { target: "tab-inventory", title: "Inventory", body: "Now tap Inventory.", action: "click" },
    newProduct,
    { target: "tab-dashboard", title: "Back to today", body: "Tap Dashboard any time to see how the day is going.", action: "click" },
    stats,
  ];
}

function findTarget(name) {
  for (const el of document.querySelectorAll(`[data-tour="${name}"]`)) {
    const r = el.getBoundingClientRect();
    if (r.width > 0 && r.height > 0) return el;
  }
  return null;
}

function sameRect(a, b) {
  return (
    a &&
    Math.abs(a.top - b.top) < 0.5 &&
    Math.abs(a.left - b.left) < 0.5 &&
    Math.abs(a.width - b.width) < 0.5 &&
    Math.abs(a.height - b.height) < 0.5
  );
}

/** The lit-up hole: a circle around anything icon-sized, a rounded box around the rest. */
function holeFor(rect) {
  if (!rect) {
    return { top: window.innerHeight / 2, left: window.innerWidth / 2, width: 0, height: 0, radius: 999 };
  }
  if (rect.width <= 72 && rect.height <= 72) {
    const d = Math.max(rect.width, rect.height) + PAD * 2;
    return { top: rect.top + rect.height / 2 - d / 2, left: rect.left + rect.width / 2 - d / 2, width: d, height: d, radius: d / 2 };
  }
  return { top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2, radius: 18 };
}

/** Where the card goes: under the target, else over it, else beside it. */
function placeCard(hole, w, h) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const M = 12;
  const G = 16;
  const clampX = (x) => Math.max(M, Math.min(vw - w - M, x));
  const clampY = (y) => Math.max(M, Math.min(vh - h - M, y));
  const cx = hole.left + hole.width / 2;
  const cy = hole.top + hole.height / 2;

  const below = hole.top + hole.height + G;
  if (below + h <= vh - M) return { top: below, left: clampX(cx - w / 2), side: "bottom", cx, cy };
  const above = hole.top - G - h;
  if (above >= M) return { top: above, left: clampX(cx - w / 2), side: "top", cx, cy };
  const right = hole.left + hole.width + G;
  if (right + w <= vw - M) return { top: clampY(cy - h / 2), left: right, side: "right", cx, cy };
  const left = hole.left - G - w;
  if (left >= M) return { top: clampY(cy - h / 2), left, side: "left", cx, cy };
  return { top: vh - h - M, left: clampX(cx - w / 2), side: "none", cx, cy };
}

function Arrow({ place, w, h }) {
  const base = "absolute w-3.5 h-3.5 bg-white rotate-45";
  const x = Math.max(18, Math.min(w - 18, place.cx - place.left)) - 7;
  const y = Math.max(18, Math.min(h - 18, place.cy - place.top)) - 7;
  if (place.side === "bottom") return <span className={base} style={{ top: -6, left: x }} />;
  if (place.side === "top") return <span className={base} style={{ bottom: -6, left: x }} />;
  if (place.side === "right") return <span className={base} style={{ left: -6, top: y }} />;
  if (place.side === "left") return <span className={base} style={{ right: -6, top: y }} />;
  return null;
}

function TourStyles() {
  return (
    <style>{`
      @keyframes tourPulse { 0% { opacity: .9; transform: scale(1); } 100% { opacity: 0; transform: scale(1.35); } }
      @keyframes tourIn { from { opacity: 0; transform: translateY(8px) scale(.96); } to { opacity: 1; transform: none; } }
      @keyframes tourFade { from { opacity: 0; } to { opacity: 1; } }
      @keyframes tourShake { 0%, 100% { transform: translateX(0); } 20% { transform: translateX(-6px); } 40% { transform: translateX(6px); } 60% { transform: translateX(-4px); } 80% { transform: translateX(4px); } }
      @keyframes tourTap { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3px); } }
      @keyframes tourPop { from { opacity: 0; transform: scale(.5); } to { opacity: 1; transform: none; } }
      @media (prefers-reduced-motion: reduce) {
        .tour-root *, .tour-root *::before, .tour-root *::after {
          animation-duration: .001ms !important;
          animation-iteration-count: 1 !important;
          transition-duration: .001ms !important;
        }
      }
    `}</style>
  );
}

export default function GuidedTour({
  onFinish,
  steps: stepsProp,
  findTimeout = FIND_TIMEOUT,
  start = "/",
  finale,
  skipLabel = "Skip tour",
}) {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [desktop] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(min-width: 768px)").matches : true
  );
  const [steps] = useState(
    () => stepsProp || defaultTourSteps({ desktop, repairsLabel: settings?.labels?.navRepairs || "Repairs" })
  );
  const [index, setIndex] = useState(0);
  const [rect, setRect] = useState(null);
  const [nudge, setNudge] = useState(0);
  const [ready, setReady] = useState(false);
  const [cardSize, setCardSize] = useState({ w: 320, h: 170 });
  const cardRef = useRef(null);
  const done = index >= steps.length;
  const step = steps[index];

  // Always from the top, so a replay from Help starts where the tour expects.
  // A tour started from somewhere particular passes start={null} and stays put.
  useEffect(() => {
    if (start) navigate(start);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A step that lives on another page opens it.
  useEffect(() => {
    if (!done && step.route) navigate(step.route);
    setReady(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index]);

  // No ending card asked for: finishing just finishes.
  useEffect(() => {
    if (done && finale === null) onFinish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [done]);

  // Android's back gesture ends the tour rather than closing the app under it.
  useCloseOnBack(true, onFinish);

  // Follow the target every frame. Not found in time: move on (or back, for
  // a step that only exists while something else is open).
  useEffect(() => {
    if (done || step.center) return undefined;
    let raf;
    let lastSeen = null;
    let scrolled = false;
    const started = performance.now();
    const tick = () => {
      if (step.action === "wait") {
        if (step.until?.()) {
          setIndex((i) => (i === index ? i + 1 : i));
          return;
        }
        const open = findTarget(step.target);
        if (open) lastSeen = performance.now();
        else if (lastSeen !== null || performance.now() > started + findTimeout) {
          // Closed without doing it: back to the step that opened it.
          setIndex((i) => (i === index ? (step.fallback !== undefined ? step.fallback : i - 1) : i));
          return;
        }
        raf = requestAnimationFrame(tick);
        return;
      }
      if (step.action === "do" && step.ready) {
        const ok = !!step.ready();
        setReady((prev) => (prev === ok ? prev : ok));
      }
      const el = findTarget(step.target);
      const now = performance.now();
      if (el) {
        lastSeen = now;
        const r = el.getBoundingClientRect();
        if (!scrolled) {
          scrolled = true;
          if (r.top < 0 || r.bottom > window.innerHeight) el.scrollIntoView?.({ block: "center" });
        }
        const next = { top: r.top, left: r.left, width: r.width, height: r.height };
        setRect((prev) => (sameRect(prev, next) ? prev : next));
      } else {
        setRect(null);
        const limit = lastSeen === null ? started + findTimeout : lastSeen + Math.min(LOST_TIMEOUT, findTimeout);
        if (now > limit) {
          setIndex((i) => (i !== index ? i : step.fallback !== undefined ? step.fallback : i + 1));
          return;
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [index, done, step, findTimeout]);

  // A click step moves on once the real element has handled the click.
  useEffect(() => {
    if (done || step.action !== "click") return undefined;
    function onClick(e) {
      const el = findTarget(step.target);
      if (el && el.contains(e.target)) setTimeout(() => setIndex((i) => (i === index ? i + 1 : i)), 0);
    }
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [index, done, step]);

  useLayoutEffect(() => {
    const el = cardRef.current;
    if (!el) return;
    const w = el.offsetWidth || 320;
    const h = el.offsetHeight || 170;
    setCardSize((s) => (s.w === w && s.h === h ? s : { w, h }));
  });

  const blocked = () => setNudge((n) => n + 1);

  if (done && finale === null) return null;

  // Stepping aside: the pad (or whatever the target opened) has the screen.
  if (!done && step.action === "wait") return null;

  const fin = finale || {
    title: "You\u2019re all set",
    body: "That\u2019s the tour. Everything else is in the menu, and you can take this tour again any time from Help.",
    button: "Start using TechDesk",
  };

  if (!done && step.center) {
    const Icon = step.icon;
    return createPortal(
      <div className="tour-root fixed inset-0 flex items-center justify-center p-6 bg-neutral-950/95" style={{ zIndex: 1000, animation: "tourFade .3s ease-out both" }}>
        <TourStyles />
        <div role="dialog" aria-label={step.title} className="w-full max-w-md text-center text-white" style={{ animation: `tourIn .5s ${EASE} both` }}>
          {Icon && (
            <div className="relative mx-auto mb-6 w-20 h-20">
              <span className="absolute inset-0 rounded-3xl bg-white/20" style={{ animation: "tourPulse 2s ease-out .4s infinite" }} />
              <span className="relative flex w-20 h-20 rounded-3xl bg-white items-center justify-center" style={{ animation: "tourPop .55s cubic-bezier(.3,1.5,.5,1) both" }}>
                <Icon className="w-10 h-10 text-neutral-900" strokeWidth={1.8} />
              </span>
            </div>
          )}
          {step.eyebrow && <div className="text-[11px] font-semibold tracking-[0.2em] uppercase text-neutral-400 mb-2">{step.eyebrow}</div>}
          <h2 className="text-2xl sm:text-3xl font-bold leading-tight">{step.title}</h2>
          <p className="text-[15px] text-neutral-300 mt-3 leading-relaxed">{step.body}</p>
          {step.points && (
            <ul className="mt-5 space-y-2.5 text-left max-w-sm mx-auto">
              {step.points.map((pt) => (
                <li key={pt} className="flex items-start gap-3 text-sm text-neutral-200">
                  <Check className="w-4 h-4 mt-0.5 shrink-0 text-emerald-400" strokeWidth={3} /> <span>{pt}</span>
                </li>
              ))}
            </ul>
          )}
          <button
            onClick={() => setIndex((i) => i + 1)}
            className="mt-8 w-full py-3.5 rounded-2xl font-semibold bg-white text-neutral-900 active:scale-[.98] transition-transform flex items-center justify-center gap-2"
          >
            {step.button || "Next"} <ArrowRight className="w-4 h-4" />
          </button>
          <button onClick={onFinish} className="mt-3 text-sm text-neutral-400 hover:text-white transition-colors">
            {skipLabel}
          </button>
        </div>
      </div>,
      document.body
    );
  }

  if (done) {
    return createPortal(
      <div className="tour-root fixed inset-0 flex items-center justify-center p-6 bg-black/80" style={{ zIndex: 1000, animation: "tourFade .3s ease-out both" }}>
        <TourStyles />
        <div role="dialog" aria-label="Tour complete" className="w-full max-w-sm rounded-3xl bg-white p-7 text-center shadow-2xl" style={{ animation: `tourIn .45s ${EASE} both` }}>
          <div className="relative mx-auto mb-5 w-16 h-16">
            <span className="absolute inset-0 rounded-full bg-emerald-400" style={{ animation: "tourPulse 1.8s ease-out .4s infinite" }} />
            <span
              className="relative flex w-16 h-16 rounded-full bg-emerald-500 items-center justify-center"
              style={{ animation: "tourPop .5s cubic-bezier(.3,1.5,.5,1) both" }}
            >
              <Check className="w-8 h-8 text-white" strokeWidth={3} />
            </span>
          </div>
          <h3 className="text-xl font-bold text-neutral-900">{fin.title}</h3>
          <p className="text-sm text-neutral-600 mt-2 leading-relaxed">{fin.body}</p>
          <button onClick={onFinish} className="mt-6 w-full py-3.5 rounded-2xl font-semibold bg-neutral-900 text-white active:scale-[.98] transition-transform">
            {fin.button}
          </button>
        </div>
      </div>,
      document.body
    );
  }

  const hole = holeFor(rect);
  const place = rect ? placeCard(hole, cardSize.w, cardSize.h) : null;
  const clickStep = step.action === "click";
  const doStep = step.action === "do";
  const openTarget = clickStep || doStep;
  const move = `top .45s ${EASE}, left .45s ${EASE}, width .45s ${EASE}, height .45s ${EASE}, border-radius .45s ${EASE}`;

  // Everything outside the target's own box swallows clicks. The target's
  // box is left open on a click step and covered on a look-only one.
  const shields = rect
    ? [
        { top: 0, left: 0, right: 0, height: Math.max(0, rect.top) },
        { top: rect.top + rect.height, left: 0, right: 0, bottom: 0 },
        { top: rect.top, left: 0, width: Math.max(0, rect.left), height: rect.height },
        { top: rect.top, left: rect.left + rect.width, right: 0, height: rect.height },
        ...(openTarget ? [] : [{ top: rect.top, left: rect.left, width: rect.width, height: rect.height }]),
      ]
    : [{ top: 0, left: 0, right: 0, bottom: 0 }];

  // The wrapper's fade makes it its own stacking context, which would pin
  // everything inside at z-index 0 -- under the phone's header, bottom bar
  // and menu drawer. Giving it a z-index of its own lifts the whole tour
  // above them instead.
  return createPortal(
    <div className="tour-root" style={{ position: "relative", zIndex: 1000, animation: "tourFade .35s ease-out both" }}>
      <TourStyles />

      <div
        aria-hidden="true"
        className="fixed z-[200] pointer-events-none"
        style={{
          top: hole.top,
          left: hole.left,
          width: hole.width,
          height: hole.height,
          borderRadius: hole.radius,
          boxShadow: rect
            ? "0 0 0 3px rgba(255,255,255,.95), 0 0 34px 8px rgba(56,189,248,.45), 0 0 0 9999px rgba(6,6,10,.88)"
            : "0 0 0 9999px rgba(6,6,10,.88)",
          transition: move,
        }}
      />
      {rect && openTarget && (
        <div
          aria-hidden="true"
          className="fixed z-[200] pointer-events-none border-2 border-white"
          style={{ top: hole.top, left: hole.left, width: hole.width, height: hole.height, borderRadius: hole.radius, animation: "tourPulse 1.6s ease-out infinite", transition: move }}
        />
      )}

      {shields.map((s, i) => (
        <div key={i} data-testid="tour-shield" onClick={blocked} className="fixed z-[201]" style={s} />
      ))}

      {rect && (
        <div
          ref={cardRef}
          role="dialog"
          aria-label={step.title}
          className="fixed z-[202] w-[min(320px,calc(100vw-24px))]"
          style={{ top: place.top, left: place.left, transition: `top .45s ${EASE}, left .45s ${EASE}` }}
        >
          <div key={nudge} style={{ animation: nudge ? "tourShake .45s ease-in-out" : undefined }}>
            <div key={index} className="relative rounded-2xl bg-white p-5 shadow-2xl shadow-black/40" style={{ animation: `tourIn .4s ${EASE} both` }}>
              <Arrow place={place} w={cardSize.w} h={cardSize.h} />
              <div className="relative">
                <div className="flex gap-1 mb-3" aria-hidden="true">
                  {steps.map((_, i) => (
                    <span key={i} className={`h-1 flex-1 rounded-full transition-colors duration-300 ${i <= index ? "bg-neutral-900" : "bg-neutral-200"}`} />
                  ))}
                </div>
                {steps.length > 1 && (
                  <div className="text-[11px] font-semibold tracking-wider uppercase text-neutral-400">
                    Step {index + 1} of {steps.length}
                  </div>
                )}
                <h3 className="text-[17px] font-bold text-neutral-900 mt-1">{step.title}</h3>
                <p className="text-sm text-neutral-600 mt-1 leading-relaxed">{step.body}</p>
                <div className="flex items-center justify-between gap-3 mt-4">
                  <button onClick={onFinish} className="text-sm text-neutral-400 hover:text-neutral-700 transition-colors">
                    {skipLabel}
                  </button>
                  {clickStep ? (
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-sky-600">
                      <MousePointerClick className="w-4 h-4" style={{ animation: "tourTap 1.2s ease-in-out infinite" }} />
                      {desktop ? "Click" : "Tap"} the highlighted spot
                    </span>
                  ) : (
                    <button
                      onClick={() => (doStep && step.ready && !ready ? blocked() : setIndex((i) => i + 1))}
                      aria-disabled={doStep && step.ready && !ready}
                      className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold active:scale-[.97] transition-all ${
                        doStep && step.ready && !ready ? "bg-neutral-200 text-neutral-400" : "bg-neutral-900 text-white"
                      }`}
                    >
                      {step.button || "Next"} <ArrowRight className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
