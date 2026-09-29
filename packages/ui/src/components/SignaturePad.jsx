import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { useThemeTokens } from "../lib/ThemeContext";

/**
 * A place to sign, on whatever the shop signs on.
 *
 * Built on the Pointer Events API rather than touch events -- a finger on a
 * phone, a stylus, and a mouse or trackpad drag on a laptop all arrive as
 * the same pointer event, so there is no separate "desktop" code path here.
 * Signing with a mouse is clunkier than a finger, but it works exactly the
 * same way a signature pad at a delivery counter does when there is no
 * touchscreen.
 */
export default function SignaturePad({ onSave, onCancel }) {
  const t = useThemeTokens();
  const canvasRef = useRef(null);
  const drawingRef = useRef(false);
  const lastRef = useRef(null);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    // The backing store is scaled to the device's real pixel density, or a
    // signature drawn on a phone comes out visibly blurry -- a line one CSS
    // pixel wide is two or three DEVICE pixels wide on most phones.
    const ratio = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));
    const ctx = canvas.getContext("2d");
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "#111827";
  }, []);

  function pointFor(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function start(e) {
    e.preventDefault();
    // Not implemented in every WebView; drawing still works without it, just
    // without the guarantee that a pointer that strays off the canvas keeps
    // reporting to it.
    canvasRef.current.setPointerCapture?.(e.pointerId);
    drawingRef.current = true;
    lastRef.current = pointFor(e);
  }

  function move(e) {
    if (!drawingRef.current) return;
    e.preventDefault();
    const ctx = canvasRef.current.getContext("2d");
    const point = pointFor(e);
    ctx.beginPath();
    ctx.moveTo(lastRef.current.x, lastRef.current.y);
    ctx.lineTo(point.x, point.y);
    ctx.stroke();
    lastRef.current = point;
    setHasDrawn(true);
  }

  function end() {
    drawingRef.current = false;
  }

  function clear() {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setHasDrawn(false);
  }

  function save() {
    if (!hasDrawn) return;
    // The pad's own canvas is transparent, so flattened onto white first --
    // a PDF viewer would otherwise show whatever happened to sit behind a
    // transparent image, which is not what a customer just signed.
    const canvas = canvasRef.current;
    const flattened = document.createElement("canvas");
    flattened.width = canvas.width;
    flattened.height = canvas.height;
    const ctx = flattened.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, flattened.width, flattened.height);
    ctx.drawImage(canvas, 0, 0);
    onSave(flattened.toDataURL("image/png"));
  }

  return (
    <div data-tour="signature-pad" className="td-overlay fixed inset-0 z-[80] flex items-center justify-center bg-black/60 p-4">
      <div className={`w-full max-w-md rounded-2xl p-5 ${t.cardBg}`}>
        <div className="flex items-center justify-between mb-3">
          <h3 className={`font-semibold ${t.textPrimary}`}>Sign here</h3>
          <button type="button" onClick={onCancel} className={t.textMuted} aria-label="Cancel">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className={`text-xs mb-3 ${t.textSecondary}`}>
          Use a finger, a stylus, or a mouse/trackpad to sign below.
        </p>
        <canvas
          ref={canvasRef}
          role="img"
          aria-label="Signature area"
          onPointerDown={start}
          onPointerMove={move}
          onPointerUp={end}
          onPointerLeave={end}
          onPointerCancel={end}
          className={`w-full h-40 rounded-xl touch-none bg-white border ${t.dark ? "border-white/10" : "border-black/10"}`}
        />
        <div className="flex items-center gap-3 mt-4">
          <button
            type="button"
            onClick={clear}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold ${t.pillBg}`}
          >
            Clear
          </button>
          <button
            type="button"
            onClick={save}
            disabled={!hasDrawn}
            className={`flex-1 py-2.5 rounded-xl text-sm font-semibold disabled:opacity-50 ${
              t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"
            }`}
          >
            Save signature
          </button>
        </div>
      </div>
    </div>
  );
}
