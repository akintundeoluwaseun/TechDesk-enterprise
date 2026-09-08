// TechDesk email relay — a small Cloudflare Worker.
//
// Why this exists: shop owners just type a recipient email address in
// Settings, nothing else. Actually sending mail needs a real account with an
// email-sending provider, and that account's API key must never ship inside
// the desktop app (anyone could pull it out of the installed app and use it
// to send arbitrary mail through your account). So the app talks to this
// relay instead, and the relay is the only thing that holds the real
// Resend API key.
//
// This is deliberately NOT a generic "send any email" proxy: it only builds
// two fixed message shapes (a daily digest, a test email) from structured
// data the app sends, and rate-limits per recipient. That means even if
// someone extracts CLIENT_KEY from an installed copy of the app, the worst
// they can do is trigger a few digest-shaped emails to a handful of
// addresses per day — not use this as an open relay for arbitrary spam.

const MAX_SENDS_PER_RECIPIENT_PER_DAY = 4;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function checkAndBumpRateLimit(env, to) {
  const key = `rl:${to}:${new Date().toISOString().slice(0, 10)}`;
  const current = Number((await env.RATE_LIMIT.get(key)) || "0");
  if (current >= MAX_SENDS_PER_RECIPIENT_PER_DAY) return false;
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 60 * 60 * 26 });
  return true;
}

async function sendViaResend(env, { to, subject, text, html }) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: env.FROM_ADDRESS || "TechDesk <digest@techdesk.app>",
      to: [to],
      subject,
      text,
      html,
    }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 300)}`);
  }
}

function buildDigestEmail({ shopName, date, activityLines, lowStockLines, activeRepairsCount }) {
  const name = shopName || "Your shop";
  const activity = Array.isArray(activityLines) ? activityLines.slice(0, 50) : [];
  const lowStock = Array.isArray(lowStockLines) ? lowStockLines.slice(0, 50) : [];
  const activityText = activity.length ? activity.map((l) => `- ${l}`).join("\n") : "No activity recorded today.";
  const lowStockText = lowStock.length ? lowStock.map((l) => `- ${l}`).join("\n") : "None.";

  const subject = `${name} — Daily activity digest (${date || new Date().toLocaleDateString()})`;
  const text = [
    `Daily summary for ${name}`,
    "",
    `Active repairs: ${Number(activeRepairsCount) || 0}`,
    "",
    "Today's activity:",
    activityText,
    "",
    "Low stock:",
    lowStockText,
  ].join("\n");

  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1e2a3a;max-width:520px;margin:0 auto">
      <h2 style="margin:0 0 4px">${escapeHtml(name)}</h2>
      <p style="color:#64748b;margin:0 0 20px">Daily activity digest — ${escapeHtml(date || new Date().toLocaleDateString())}</p>
      <p><b>Active repairs:</b> ${Number(activeRepairsCount) || 0}</p>
      <h3 style="margin:20px 0 8px">Today's activity</h3>
      <p style="white-space:pre-line;color:#374151">${escapeHtml(activityText)}</p>
      <h3 style="margin:20px 0 8px">Low stock</h3>
      <p style="white-space:pre-line;color:#374151">${escapeHtml(lowStockText)}</p>
    </div>
  `;
  return { subject, text, html };
}

async function handleSendDigest(request, env) {
  const payload = await request.json().catch(() => null);
  if (!payload || payload.clientKey !== env.CLIENT_KEY) return json({ ok: false, error: "Unauthorized" }, 401);
  const { to, shopName, date, activityLines, lowStockLines, activeRepairsCount } = payload;
  if (typeof to !== "string" || !EMAIL_RE.test(to)) return json({ ok: false, error: "Invalid recipient address" }, 400);

  const allowed = await checkAndBumpRateLimit(env, to);
  if (!allowed) return json({ ok: false, error: "Rate limit exceeded for this recipient today" }, 429);

  const { subject, text, html } = buildDigestEmail({ shopName, date, activityLines, lowStockLines, activeRepairsCount });
  try {
    await sendViaResend(env, { to, subject, text, html });
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message }, 502);
  }
}

async function handleSendTest(request, env) {
  const payload = await request.json().catch(() => null);
  if (!payload || payload.clientKey !== env.CLIENT_KEY) return json({ ok: false, error: "Unauthorized" }, 401);
  const { to, shopName } = payload;
  if (typeof to !== "string" || !EMAIL_RE.test(to)) return json({ ok: false, error: "Invalid recipient address" }, 400);

  const allowed = await checkAndBumpRateLimit(env, to);
  if (!allowed) return json({ ok: false, error: "Rate limit exceeded for this recipient today" }, 429);

  const name = shopName || "your shop";
  try {
    await sendViaResend(env, {
      to,
      subject: "TechDesk test email",
      text: `This is a test email from TechDesk for ${name}. If you received this, your daily digest is set up correctly.`,
      html: `<p>This is a test email from TechDesk for <b>${escapeHtml(name)}</b>. If you received this, your daily digest is set up correctly.</p>`,
    });
    return json({ ok: true });
  } catch (err) {
    return json({ ok: false, error: err.message }, 502);
  }
}

export default {
  async fetch(request, env) {
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);
    const url = new URL(request.url);
    if (url.pathname === "/send-digest") return handleSendDigest(request, env);
    if (url.pathname === "/send-test") return handleSendTest(request, env);
    return json({ ok: false, error: "Not found" }, 404);
  },
};
