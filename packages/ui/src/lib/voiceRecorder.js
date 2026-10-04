// Records a voice note and hands it back as a small WAV file.
//
// Browsers record WebM/Opus, which Gemini doesn't accept, so the recording is
// decoded and written out as 16 kHz mono WAV: plenty for speech, and about
// 1.9 MB a minute -- small enough to send in one request.
export const MAX_SECONDS = 60;
const RATE = 16000;

export function canRecord() {
  return typeof navigator !== "undefined" && !!navigator.mediaDevices?.getUserMedia && typeof window !== "undefined" && "MediaRecorder" in window;
}

/** Starts recording. Resolves to {stop(): Promise<Blob>, cancel()}; rejects if the mic is refused. */
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
  const rec = new MediaRecorder(stream);
  const chunks = [];
  rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
  rec.start();
  const release = () => stream.getTracks().forEach((t) => t.stop());
  return {
    stop: () =>
      new Promise((resolve) => {
        rec.onstop = () => {
          release();
          resolve(new Blob(chunks, { type: rec.mimeType || "audio/webm" }));
        };
        if (rec.state !== "inactive") rec.stop();
        else rec.onstop();
      }),
    cancel: () => {
      rec.onstop = release;
      if (rec.state !== "inactive") rec.stop();
      else release();
    },
  };
}

function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  str(0, "RIFF");
  v.setUint32(4, 36 + samples.length * 2, true);
  str(8, "WAVE");
  str(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true); // PCM
  v.setUint16(22, 1, true); // mono
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return buf;
}

function toBase64(buf) {
  const bytes = new Uint8Array(buf);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

/** The recording as base64 WAV, at most MAX_SECONDS long. */
export async function blobToWavBase64(blob) {
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  try {
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    const length = Math.min(Math.ceil(decoded.duration * RATE), MAX_SECONDS * RATE);
    const off = new OfflineAudioContext(1, Math.max(length, 1), RATE);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const out = await off.startRendering();
    return { audio: toBase64(encodeWav(out.getChannelData(0), RATE)), seconds: decoded.duration };
  } finally {
    ctx.close?.();
  }
}

export { encodeWav as _encodeWav };
