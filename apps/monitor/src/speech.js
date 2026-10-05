// Talking to the assistant: the phone's own speech-to-text.
//
// In a browser (Monitor on the web, Chrome on a phone): the Web Speech API.
// In the Android app: the phone's recogniser through
// @capacitor-community/speech-recognition. Either way, listen(onText) starts
// and returns stop() -> Promise<final text>. null when neither is there --
// the mic button simply doesn't show.
const Web = typeof window !== "undefined" ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

export function canListen() {
  return !!(Web || (typeof window !== "undefined" && window.Capacitor?.isNativePlatform?.()));
}

const squash = (t) => t.toLowerCase().replace(/[^a-z0-9]+/g, "");
/** Android Chrome repeats each step as a new result ("how", "how much"...): keep the longest. */
function merge(list) {
  const out = [];
  for (const raw of list) {
    const t = String(raw || "").trim();
    if (!t) continue;
    const last = out[out.length - 1];
    if (last != null && squash(t).startsWith(squash(last))) { out[out.length - 1] = t; continue; }
    if (last != null && squash(last).startsWith(squash(t))) continue;
    out.push(t);
  }
  return out.join(" ");
}

export async function listen(onText) {
  if (Web) {
    const rec = new Web();
    rec.lang = "en-NG";
    rec.interimResults = true;
    rec.continuous = true;
    let text = "";
    rec.onresult = (e) => { text = merge(Array.from(e.results, (r) => r[0]?.transcript || "")); onText?.(text); };
    await new Promise((resolve, reject) => {
      rec.onstart = resolve;
      rec.onerror = (e) => reject(new Error(e.error === "not-allowed" ? "not-allowed" : "unavailable"));
      try { rec.start(); } catch { reject(new Error("unavailable")); }
    });
    return () => new Promise((done) => { rec.onend = () => done(text); try { rec.stop(); } catch { done(text); } });
  }
  const { SpeechRecognition } = await import("@capacitor-community/speech-recognition");
  let perm = await SpeechRecognition.checkPermissions().catch(() => null);
  if (perm?.speechRecognition !== "granted") perm = await SpeechRecognition.requestPermissions().catch(() => null);
  if (perm?.speechRecognition !== "granted") throw new Error("not-allowed");
  let text = "";
  await SpeechRecognition.removeAllListeners().catch(() => {});
  await SpeechRecognition.addListener("partialResults", (d) => { text = d?.matches?.[0] || text; onText?.(text); });
  await SpeechRecognition.start({ language: "en-NG", maxResults: 1, partialResults: true, popup: false });
  return async () => {
    await SpeechRecognition.stop().catch(() => {});
    await new Promise((r) => setTimeout(r, 300));
    await SpeechRecognition.removeAllListeners().catch(() => {});
    return text;
  };
}
