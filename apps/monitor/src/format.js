/** "9:41 AM" for a timestamp, or an empty string for a missing one. */
export function time(at) {
  if (!at) return "";
  const d = new Date(at);
  return Number.isNaN(d.getTime())
    ? ""
    : d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

/** How long ago, in the words someone would actually use. */
export function ago(at) {
  if (!at) return "never";
  const then = new Date(at).getTime();
  if (Number.isNaN(then)) return "never";
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  return `${days} day${days === 1 ? "" : "s"} ago`;
}

/** Morning until noon, afternoon until five, evening after. */
export function greeting(now = new Date()) {
  const h = now.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

/** The first name only, so the greeting reads like a person said it. */
export function firstName(name) {
  const n = (name || "").trim();
  return n ? n.split(/\s+/)[0] : "";
}
