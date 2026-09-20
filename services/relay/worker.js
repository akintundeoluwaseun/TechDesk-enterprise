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

// HQ account/branch keys are public-facing (created from the marketing
// website, not from inside an installed app), so they get their own,
// tighter limits keyed by IP+email rather than the desktop app's CLIENT_KEY.
const MAX_ACCOUNTS_PER_IP_PER_DAY = 5;
const MAX_ACCOUNTS_PER_EMAIL_PER_DAY = 3;
const MAX_BRANCHES_PER_BUSINESS_PER_DAY = 20;

// Activation code lookup is the most sensitive public endpoint here: the
// underlying data is 5,000 real, valuable license codes. A 6-digit PIN
// space (1,000,000 possible values, only 5,000 of them real) makes blind
// enumeration the actual attack to defend against, since there's no
// account or purchase proof at lookup time -- these two limits are what
// make scripting through the PIN space impractical rather than just slow.
const MAX_ACTIVATION_LOOKUPS_PER_IP_PER_DAY = 8;
const MAX_ACTIVATION_LOOKUPS_PER_PIN_PER_DAY = 20;
const PIN_RE = /^\d{6}$/;
const ACTIVATION_VERSIONS = new Set(["solo"]); // business/enterprise: no codes issued yet

// Avoids visually-ambiguous characters (0/O, 1/I/L) since these keys are
// read off a screen and typed by hand into another machine.
const KEY_ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function randomGroup(length) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => KEY_ALPHABET[b % KEY_ALPHABET.length]).join("");
}

function generateKey(prefix, groups = 3) {
  const parts = Array.from({ length: groups }, () => randomGroup(4));
  return `${prefix}-${parts.join("-")}`;
}

function escapeHtml(s) {
  return String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

async function checkAndBumpDailyLimit(env, bucket, id, max) {
  const key = `rl:${bucket}:${id}:${new Date().toISOString().slice(0, 10)}`;
  const current = Number((await env.RATE_LIMIT.get(key)) || "0");
  if (current >= max) return false;
  await env.RATE_LIMIT.put(key, String(current + 1), { expirationTtl: 60 * 60 * 26 });
  return true;
}

function checkAndBumpRateLimit(env, to) {
  return checkAndBumpDailyLimit(env, "send", to, MAX_SENDS_PER_RECIPIENT_PER_DAY);
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

function buildAccountEmail(businessKey) {
  const subject = "Your TechDesk HQ account key";
  const text = [
    "Your TechDesk HQ account has been created.",
    "",
    `Business Key: ${businessKey}`,
    "",
    "Paste this into Settings → Connect to HQ on the computer you want to use",
    "as your HQ (head office) machine. Keep it somewhere safe — anyone with",
    "this key can see combined data across your branches.",
  ].join("\n");
  const html = `
    <div style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#1e2a3a;max-width:480px;margin:0 auto">
      <h2 style="margin:0 0 12px">Your TechDesk HQ account</h2>
      <p style="color:#374151">Paste this key into <b>Settings → Connect to HQ</b> on the computer you want to
      use as your HQ (head office) machine.</p>
      <p style="margin:20px 0;padding:16px 20px;background:#f1f5f9;border-radius:12px;font:700 1.1rem/1.3 monospace;letter-spacing:1px">
        ${escapeHtml(businessKey)}
      </p>
      <p style="color:#64748b;font-size:.85rem">Keep this safe — anyone with this key can see combined data across your branches.</p>
    </div>
  `;
  return { subject, text, html };
}

async function handleCreateAccount(request, env) {
  const payload = await request.json().catch(() => null);
  const email = (payload && payload.email || "").trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: "Enter a valid email address" }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const ipOk = await checkAndBumpDailyLimit(env, "acct-ip", ip, MAX_ACCOUNTS_PER_IP_PER_DAY);
  if (!ipOk) return json({ ok: false, error: "Too many accounts created from this network today" }, 429);
  const emailOk = await checkAndBumpDailyLimit(env, "acct-email", email, MAX_ACCOUNTS_PER_EMAIL_PER_DAY);
  if (!emailOk) return json({ ok: false, error: "Too many accounts requested for this email today" }, 429);

  // vanishingly unlikely to collide, but a stored key is permanent, so check
  let businessKey;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateKey("TDHQ");
    if (!(await env.RATE_LIMIT.get(`biz:${candidate}`))) {
      businessKey = candidate;
      break;
    }
  }
  if (!businessKey) return json({ ok: false, error: "Could not generate a key, try again" }, 500);

  await env.RATE_LIMIT.put(`biz:${businessKey}`, JSON.stringify({ email, createdAt: new Date().toISOString() }));

  try {
    const { subject, text, html } = buildAccountEmail(businessKey);
    await sendViaResend(env, { to: email, subject, text, html });
  } catch (err) {
    return json({ ok: false, error: `Account created, but the email failed to send: ${err.message}` }, 502);
  }
  return json({ ok: true });
}

async function handleCreateBranch(request, env) {
  const payload = await request.json().catch(() => null);
  const businessKey = (payload && payload.businessKey || "").trim().toUpperCase();
  const branchName = (payload && payload.branchName || "").trim().slice(0, 80);
  if (!businessKey) return json({ ok: false, error: "Business Key is required" }, 400);

  const bizRecord = await env.RATE_LIMIT.get(`biz:${businessKey}`);
  if (!bizRecord) return json({ ok: false, error: "Unknown Business Key" }, 404);

  const branchesOk = await checkAndBumpDailyLimit(env, "branch-create", businessKey, MAX_BRANCHES_PER_BUSINESS_PER_DAY);
  if (!branchesOk) return json({ ok: false, error: "Too many branches created today" }, 429);

  let branchCode;
  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateKey("TDBR", 2);
    if (!(await env.RATE_LIMIT.get(`branch:${candidate}`))) {
      branchCode = candidate;
      break;
    }
  }
  if (!branchCode) return json({ ok: false, error: "Could not generate a code, try again" }, 500);

  await env.RATE_LIMIT.put(
    `branch:${branchCode}`,
    JSON.stringify({ businessKey, branchName, createdAt: new Date().toISOString() })
  );
  return json({ ok: true, branchCode });
}

async function handleActivationLookup(request, env) {
  const payload = await request.json().catch(() => null);
  const version = String((payload && payload.version) || "").toLowerCase();
  const pin = String((payload && payload.pin) || "").trim();

  if (!ACTIVATION_VERSIONS.has(version)) {
    return json({ ok: false, error: "Codes for this edition aren't available yet" }, 400);
  }
  if (!PIN_RE.test(pin)) return json({ ok: false, error: "Enter the 6-digit PIN shown on your Activate screen" }, 400);

  const ip = request.headers.get("cf-connecting-ip") || "unknown";
  const ipOk = await checkAndBumpDailyLimit(env, "actlookup-ip", ip, MAX_ACTIVATION_LOOKUPS_PER_IP_PER_DAY);
  if (!ipOk) return json({ ok: false, error: "Too many lookups from this network today. Try again tomorrow, or contact us." }, 429);
  const pinOk = await checkAndBumpDailyLimit(env, "actlookup-pin", `${version}:${pin}`, MAX_ACTIVATION_LOOKUPS_PER_PIN_PER_DAY);
  if (!pinOk) return json({ ok: false, error: "Too many lookups for this PIN today. Try again tomorrow, or contact us." }, 429);

  const raw = await env.RATE_LIMIT.get(`actpin:${version}:${pin}`);
  if (!raw) return json({ ok: false, error: "No code found for that PIN. Double-check it against your Activate screen." }, 404);

  let codes;
  try {
    codes = JSON.parse(raw);
  } catch {
    codes = [raw];
  }
  return json({ ok: true, codes });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
      });
    }
    if (request.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

    let response;
    if (url.pathname === "/send-digest") response = await handleSendDigest(request, env);
    else if (url.pathname === "/send-test") response = await handleSendTest(request, env);
    else if (url.pathname === "/hq/create-account") response = await handleCreateAccount(request, env);
    else if (url.pathname === "/hq/create-branch") response = await handleCreateBranch(request, env);
    else if (url.pathname === "/activate/lookup") response = await handleActivationLookup(request, env);
    else response = json({ ok: false, error: "Not found" }, 404);

    // /hq/* and /activate/* routes are called directly from the public
    // website's browser JS (not from the desktop app), so they need CORS.
    if (url.pathname.startsWith("/hq/") || url.pathname.startsWith("/activate/")) {
      response.headers.set("Access-Control-Allow-Origin", "*");
    }
    return response;
  },
};
