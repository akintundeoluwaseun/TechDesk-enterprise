// Speech to text, done by the device itself, as the person talks.
//
// Sending a recording to the AI and waiting for it to listen took most of a
// voice note's 10-15 seconds. Where the browser or phone can turn speech
// into words on its own, the words appear live while the shop talks and only
// that short line of text is sent -- a second or two instead.
//
// One shape for every engine:
//   available()                  -> Promise<boolean>
//   start({ lang, onText })      -> Promise<{ stop(): Promise<string>, cancel() }>
// onText(textSoFar) is called as words come in. start() rejects with
// Error("not-allowed") when the microphone or speech service is refused,
// and Error("unavailable") when speech can't be used here at all.

/** The browser's own recogniser (Chrome, Edge, Safari). Not Electron: it has no speech service behind it. */
export function webSpeech() {
  const Ctor = typeof window !== "undefined" && (window.SpeechRecognition || window.webkitSpeechRecognition);
  if (!Ctor) return null;
  return {
    name: "web",
    async available() { return true; },
    start({ lang = "en-NG", onText } = {}) {
      return new Promise((resolve, reject) => {
        const rec = new Ctor();
        rec.lang = lang;
        rec.continuous = true;
        rec.interimResults = true;
        rec.maxAlternatives = 1;
        let kept = "";     // what earlier sessions heard (Chrome restarts after a pause)
        let current = "";  // what this session has heard so far
        let started = false;
        let finished = null;
        let stopping = false;
        let failure = null;
        const all = () => `${kept} ${current}`.replace(/\s+/g, " ").trim();
        rec.onresult = (e) => {
          // Read the whole session each time rather than adding pieces on:
          // Chrome on Android reports every step as a new result ("add",
          // "add iPhone", "add iPhone 11"...), which added up to repeats.
          current = mergeResults(Array.from(e.results, (r) => r[0]?.transcript || ""));
          onText?.(all());
        };
        rec.onerror = (e) => {
          const code = e.error === "not-allowed" || e.error === "service-not-allowed" ? "not-allowed"
            : e.error === "no-speech" || e.error === "aborted" ? null : "unavailable";
          if (!started && code) reject(new Error(code));
          else if (code) failure = code;
        };
        rec.onstart = () => {
          started = true;
          resolve({
            stop: () => new Promise((done, fail) => {
              finished = () => (failure && !all() ? fail(new Error(failure)) : done(all()));
              stopping = true;
              try { rec.stop(); } catch { finished(); }
            }),
            cancel: () => { stopping = true; finished = () => {}; try { rec.abort(); } catch { /* fine */ } },
          });
        };
        rec.onend = () => {
          // Chrome ends a session after a pause; keep listening until the
          // person lets go of the button.
          kept = all();
          current = "";
          if (!stopping && started && !failure) { try { rec.start(); return; } catch { /* fall through */ } }
          if (finished) finished();
        };
        try { rec.start(); } catch { reject(new Error("unavailable")); }
      });
    },
  };
}

const squash = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");

/**
 * One line from a session's results. Where a result just repeats the one
 * before it with more words (or fewer), keep the longer one only.
 */
export function mergeResults(list) {
  const out = [];
  for (const raw of list) {
    const t = String(raw || "").trim();
    if (!t) continue;
    const last = out[out.length - 1];
    if (last != null) {
      const a = squash(last), b = squash(t);
      if (b.startsWith(a)) { out[out.length - 1] = t; continue; }
      if (a.startsWith(b)) continue;
    }
    out.push(t);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}
