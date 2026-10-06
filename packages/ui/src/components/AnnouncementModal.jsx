import React from "react";
import { X, Megaphone, Rocket, AlertTriangle, Gift, ExternalLink } from "lucide-react";
import { platform } from "@techdesk/platform";
import { useThemeTokens } from "../lib/ThemeContext";
import { useCloseOnBack } from "../lib/useCloseOnBack";

// A message pushed from the TechDesk console. Same look as What's New: a dark
// header with a glow in the message's own colour, the words underneath.
const TONES = {
  info: { label: "From TechDesk", Icon: Megaphone, glow: "rgba(99,102,241,.6)", text: "text-indigo-300" },
  update: { label: "New update", Icon: Rocket, glow: "rgba(56,189,248,.6)", text: "text-sky-300" },
  warning: { label: "Heads up", Icon: AlertTriangle, glow: "rgba(251,191,36,.55)", text: "text-amber-300" },
  offer: { label: "Offer", Icon: Gift, glow: "rgba(52,211,153,.55)", text: "text-emerald-300" },
};

export default function AnnouncementModal({ announcement, onClose }) {
  const t = useThemeTokens();
  useCloseOnBack(true, onClose);
  const tone = TONES[announcement.tone] || TONES.info;
  const Icon = tone.Icon;

  return (
    <div className="td-overlay fixed inset-0 z-[66] flex items-center justify-center bg-black/60 p-4 sm:p-6" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-label={announcement.title} className={`w-full max-w-md rounded-3xl overflow-hidden ${t.cardBg}`}>
        <div className="relative overflow-hidden bg-neutral-950 px-6 pt-7 pb-6">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute rounded-full"
            style={{ width: 300, height: 300, left: -100, top: -160, background: `radial-gradient(circle, ${tone.glow}, transparent 65%)` }}
          />
          <button type="button" onClick={onClose} aria-label="Close"
            /* z-10: the card's content sits in its own positioned block below this
               in the markup, so without it that block paints over the X and takes
               the taps -- the close button looked dead on a phone. */
            className="absolute top-4 right-4 z-10 p-2 -m-0.5 rounded-full text-neutral-400 hover:text-white hover:bg-white/10">
            <X className="w-5 h-5" />
          </button>
          <div className="relative">
            <div className="w-12 h-12 rounded-2xl mb-4 flex items-center justify-center bg-white/10">
              <Icon className="w-6 h-6 text-white" />
            </div>
            <div className={`text-[11px] font-semibold tracking-[0.18em] uppercase ${tone.text}`}>{tone.label}</div>
            <h2 className="text-2xl font-bold text-white mt-1">{announcement.title}</h2>
          </div>
        </div>
        {announcement.body && (
          <div className={`px-6 pt-5 text-[15px] leading-relaxed whitespace-pre-wrap ${t.textSecondary}`}>{announcement.body}</div>
        )}
        <div className="px-6 py-6 flex flex-col gap-2">
          {announcement.link_url && (
            <button
              onClick={() => platform().openExternal(announcement.link_url)}
              className={`w-full py-3 rounded-2xl font-semibold flex items-center justify-center gap-2 ${t.pillBg}`}
            >
              Open link <ExternalLink className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={onClose}
            className={`w-full py-3.5 rounded-2xl font-semibold ${t.dark ? "bg-white text-black" : "bg-neutral-900 text-white"}`}
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
}
