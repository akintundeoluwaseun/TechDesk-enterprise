// Speech to text on Android: the phone's own recogniser (the one the
// keyboard's mic uses), through @capacitor-community/speech-recognition.
// Words arrive while the person talks. Android stops listening after a
// pause, so while the button is still held it starts again and keeps what
// was already heard.
import { SpeechRecognition } from "@capacitor-community/speech-recognition";

export const capacitorSpeech = {
  name: "android",
  async available() {
    try {
      return (await SpeechRecognition.available()).available === true;
    } catch {
      return false;
    }
  },
  async start({ lang = "en-NG", onText } = {}) {
    let perm = await SpeechRecognition.checkPermissions().catch(() => null);
    if (perm?.speechRecognition !== "granted") perm = await SpeechRecognition.requestPermissions().catch(() => null);
    if (perm?.speechRecognition !== "granted") throw new Error("not-allowed");

    let kept = "";      // what earlier sessions heard
    let current = "";   // what this session has heard so far
    let holding = true;
    let ended = null;
    const all = () => `${kept} ${current}`.replace(/\s+/g, " ").trim();
    const go = () => SpeechRecognition.start({ language: lang, maxResults: 1, partialResults: true, popup: false });

    await SpeechRecognition.removeAllListeners().catch(() => {});
    await SpeechRecognition.addListener("partialResults", (d) => {
      current = d?.matches?.[0] || current;
      onText?.(all());
    });
    await SpeechRecognition.addListener("listeningState", (d) => {
      if (d?.status !== "stopped") return;
      kept = all();
      current = "";
      if (holding) go().catch(() => {});
      else ended?.();
    });
    try {
      await go();
    } catch {
      throw new Error("unavailable");
    }
    const finish = async () => {
      holding = false;
      await new Promise((resolve) => {
        ended = resolve;
        SpeechRecognition.stop().catch(() => resolve());
        setTimeout(resolve, 1200); // never wait on a stop event that doesn't come
      });
      await SpeechRecognition.removeAllListeners().catch(() => {});
      return all();
    };
    return {
      stop: finish,
      cancel: () => { finish().catch(() => {}); },
    };
  },
};
