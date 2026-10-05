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
        let finalText = "";
        let interim = "";
        let started = false;
        let finished = null;
        let stopping = false;
        let failure = null;
        const all = () => `${finalText} ${interim}`.replace(/\s+/g, " ").trim();
        rec.onresult = (e) => {
          interim = "";
          for (let i = e.resultIndex; i < e.results.length; i++) {
            const r = e.results[i];
            if (r.isFinal) finalText += ` ${r[0].transcript}`;
            else interim += ` ${r[0].transcript}`;
          }
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
          if (!stopping && started && !failure) { try { rec.start(); return; } catch { /* fall through */ } }
          if (finished) finished();
        };
        try { rec.start(); } catch { reject(new Error("unavailable")); }
      });
    },
  };
}
