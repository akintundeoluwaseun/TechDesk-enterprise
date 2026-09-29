import React, { useEffect, useRef, useState } from "react";
import { CheckCircle2, Info, Trash2 } from "lucide-react";
import { onToast } from "../lib/toast";

const LIFETIME = 3200;
const TONES = {
  success: { Icon: CheckCircle2, ring: "bg-emerald-500" },
  info: { Icon: Info, ring: "bg-sky-500" },
  danger: { Icon: Trash2, ring: "bg-red-500" },
};
const COLOURS = ["#38bdf8", "#818cf8", "#34d399", "#fbbf24", "#f472b6", "#ffffff"];

function prefersStill() {
  return !window.matchMedia || window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** One burst of confetti from just above the toasts, drawn on a throwaway canvas. */
function burst(canvas) {
  const ctx = canvas.getContext?.("2d");
  if (!ctx) return;
  const dpr = window.devicePixelRatio || 1;
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  ctx.scale(dpr, dpr);
  const originX = w / 2;
  const originY = h - 110;
  const bits = Array.from({ length: 90 }, () => {
    const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 0.9;
    const speed = 7 + Math.random() * 9;
    return {
      x: originX,
      y: originY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      size: 5 + Math.random() * 5,
      spin: (Math.random() - 0.5) * 0.4,
      turn: Math.random() * Math.PI,
      colour: COLOURS[Math.floor(Math.random() * COLOURS.length)],
      round: Math.random() < 0.3,
    };
  });
  const start = performance.now();
  function frame(now) {
    const age = now - start;
    ctx.clearRect(0, 0, w, h);
    for (const b of bits) {
      b.vy += 0.32;
      b.vx *= 0.985;
      b.x += b.vx;
      b.y += b.vy;
      b.turn += b.spin;
      ctx.save();
      ctx.globalAlpha = Math.max(0, 1 - age / 1800);
      ctx.translate(b.x, b.y);
      ctx.rotate(b.turn);
      ctx.fillStyle = b.colour;
      if (b.round) {
        ctx.beginPath();
        ctx.arc(0, 0, b.size / 2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillRect(-b.size / 2, -b.size / 4, b.size, b.size / 2);
      }
      ctx.restore();
    }
    if (age < 1800) requestAnimationFrame(frame);
    else ctx.clearRect(0, 0, w, h);
  }
  requestAnimationFrame(frame);
}

export default function Toaster() {
  const [items, setItems] = useState([]);
  const canvas = useRef(null);

  useEffect(
    () =>
      onToast((item) => {
        setItems((list) => [...list.slice(-2), item]);
        setTimeout(() => setItems((list) => list.filter((i) => i.id !== item.id)), LIFETIME);
        if (item.celebrate && canvas.current && !prefersStill()) burst(canvas.current);
      }),
    []
  );

  return (
    <>
      <canvas ref={canvas} aria-hidden="true" className="fixed inset-0 w-full h-full pointer-events-none" style={{ zIndex: 90 }} />
      <div
        className="fixed inset-x-0 flex flex-col items-center gap-2 px-4 pointer-events-none"
        style={{ zIndex: 91, bottom: "calc(80px + env(safe-area-inset-bottom))" }}
        role="status"
        aria-live="polite"
      >
        {items.map((item) => {
          const tone = TONES[item.tone] || TONES.success;
          const Icon = tone.Icon;
          return (
            <div
              key={item.id}
              className="td-toast pointer-events-auto flex items-center gap-3 w-full max-w-sm rounded-2xl bg-neutral-900 text-white pl-3 pr-4 py-3 shadow-2xl shadow-black/40"
            >
              <span className={`relative flex w-8 h-8 shrink-0 rounded-full items-center justify-center ${tone.ring}`}>
                <Icon className="w-[18px] h-[18px]" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-semibold truncate">{item.title}</div>
                {item.message && <div className="text-xs text-neutral-400 truncate">{item.message}</div>}
              </div>
              <span
                aria-hidden="true"
                className="absolute left-3 right-3 bottom-1 h-0.5 rounded-full bg-white/15 overflow-hidden"
              >
                <span className="td-toast-bar block h-full bg-white/60" style={{ animationDuration: `${LIFETIME}ms` }} />
              </span>
            </div>
          );
        })}
      </div>
    </>
  );
}
