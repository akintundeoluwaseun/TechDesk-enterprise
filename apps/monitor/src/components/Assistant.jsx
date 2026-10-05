import React, { useEffect, useRef, useState } from "react";
import { X, Send, Mic, Square, Loader2 } from "lucide-react";
import Bot from "./Bot";
import AnswerCard from "./AnswerCard";
import { answer, fromAi, parseQuestion } from "../insights";
import { canListen, listen } from "../speech";
import { api } from "../api";
import { money } from "../currency";

const ASK = [
  "How much did we sell today?",
  "Which branch sold most this week?",
  "Profit this month",
  "Who owes us?",
  "Repairs ready for pickup",
  "What's running low?",
  "Best sellers",
  "Today's summary",
];

/**
 * Head office's assistant. Ask by typing, talking or tapping a question; the
 * answer comes from the branches' figures (insights.js). Read-only, like the
 * rest of Monitor.
 */
export default function Assistant({ insights, onNeedInsights, offline }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [chat, setChat] = useState([]);
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState("");
  const stopRef = useRef(null);
  const end = useRef(null);
  const branches = insights?.branches || [];

  useEffect(() => { if (open) onNeedInsights?.(); }, [open]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { end.current?.scrollIntoView({ block: "end", behavior: "smooth" }); }, [chat, busy]);

  async function ask(text) {
    const q = String(text || "").trim();
    if (!q || busy) return;
    setInput("");
    setChat((c) => [...c, { me: q }]);
    let parsed = /summary|brief/i.test(q) ? { intent: "brief", period: null, branch: null } : parseQuestion(q, branches);
    if (!parsed.intent) {
      // Not one we recognise: ask the AI what was meant, then answer from the figures.
      setBusy(true);
      const res = await api.askAi(q).catch(() => null);
      setBusy(false);
      const act = (res?.actions || []).find((a) => a.type === "question");
      if (act) parsed = { ...fromAi(act, branches), ...(parsed.branch ? { branch: parsed.branch } : {}) };
    }
    setChat((c) => [...c, { a: answer(parsed, insights, money, { offline }) }]);
  }

  async function mic() {
    if (listening) {
      const stop = stopRef.current;
      stopRef.current = null;
      setListening(false);
      const text = stop ? await stop().catch(() => heard) : heard;
      setHeard("");
      if (text?.trim()) ask(text);
      return;
    }
    try {
      setHeard("");
      stopRef.current = await listen(setHeard);
      setListening(true);
    } catch (e) {
      setChat((c) => [...c, { a: { title: "Microphone", sub: e?.message === "not-allowed" ? "Allow the microphone for Monitor in your phone's settings, then try again." : "Talking isn't available here. Type your question instead." } }]);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        aria-label="Ask TechDesk"
        className="fixed z-30 right-4 lg:right-8 lg:bottom-8 w-14 h-14 rounded-full grid place-items-center shadow-raised bg-gradient-to-br from-indigo-600 to-sky-500"
        style={{ bottom: "calc(96px + env(safe-area-inset-bottom))" }}
      >
        <Bot size={38} />
      </button>

      {open && (
        <div className="fixed inset-0 z-40 flex items-end lg:items-center justify-center bg-black/50" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-label="Ask TechDesk"
            onClick={(e) => e.stopPropagation()}
            className="w-full lg:max-w-lg max-h-[88vh] flex flex-col rounded-t-3xl lg:rounded-3xl bg-card border border-line shadow-raised overflow-hidden"
          >
            <div className="flex items-center gap-3 px-4 py-3 bg-gradient-to-r from-indigo-600 to-sky-500 text-white">
              <span className="w-10 h-10 rounded-full bg-white/15 grid place-items-center"><Bot size={30} listening={listening} /></span>
              <div className="flex-1 min-w-0">
                <div className="font-bold leading-tight">Ask TechDesk</div>
                <div className="text-xs text-white/80">{listening ? "Listening…" : "About all your branches"}</div>
              </div>
              <button onClick={() => setOpen(false)} aria-label="Close" className="w-9 h-9 grid place-items-center rounded-full bg-white/15"><X size={18} /></button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {chat.length === 0 && (
                <div className="text-sm text-ink-soft">Ask about sales, profit, branches, money owed, repairs or stock. Type, talk, or tap one:</div>
              )}
              {chat.map((m, i) => m.me ? (
                <div key={i} className="flex justify-end"><div className="max-w-[85%] rounded-2xl rounded-br-md px-3.5 py-2 text-sm text-white bg-gradient-to-br from-indigo-600 to-sky-500">{m.me}</div></div>
              ) : (
                <AnswerCard key={i} a={m.a} />
              ))}
              {busy && <div className="flex items-center gap-2 text-sm text-ink-faint"><Loader2 size={16} className="animate-spin" /> Thinking…</div>}
              {!insights && <div className="flex items-center gap-2 text-sm text-ink-faint"><Loader2 size={16} className="animate-spin" /> Getting the branches' figures…</div>}
              <div ref={end} />
            </div>

            <div className="px-3 pt-2 flex gap-2 overflow-x-auto no-scrollbar">
              {ASK.map((q) => (
                <button key={q} onClick={() => ask(q)} disabled={!insights || busy} className="shrink-0 text-xs font-medium px-3 py-1.5 rounded-full border border-line bg-ground disabled:opacity-50">{q}</button>
              ))}
            </div>
            <form
              className="flex items-center gap-2 px-3 py-3"
              style={{ paddingBottom: "calc(12px + env(safe-area-inset-bottom))" }}
              onSubmit={(e) => { e.preventDefault(); ask(input); }}
            >
              {listening ? (
                <div className="flex-1 min-w-0 flex items-center gap-2 text-sm px-1">
                  <span className="w-2 h-2 shrink-0 rounded-full bg-red-500 animate-pulse" />
                  <span className="truncate">{heard || "Listening… tap stop when you finish"}</span>
                </div>
              ) : (
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask about your branches…"
                  aria-label="Question"
                  className="flex-1 min-w-0 rounded-full px-4 py-2.5 text-sm bg-ground border border-line outline-none"
                />
              )}
              {!listening && input.trim() ? (
                <button type="submit" aria-label="Ask" disabled={!insights} className="w-11 h-11 shrink-0 rounded-full grid place-items-center text-white bg-gradient-to-br from-indigo-600 to-sky-500 disabled:opacity-50"><Send size={18} /></button>
              ) : canListen() ? (
                <button type="button" onClick={mic} aria-label={listening ? "Stop" : "Talk"} disabled={!insights} className={`w-11 h-11 shrink-0 rounded-full grid place-items-center text-white disabled:opacity-50 ${listening ? "bg-red-500 animate-pulse" : "bg-gradient-to-br from-indigo-600 to-sky-500"}`}>
                  {listening ? <Square size={16} /> : <Mic size={18} />}
                </button>
              ) : null}
            </form>
          </div>
        </div>
      )}
    </>
  );
}
