// Everything this app asks the backend for.
//
// The session token is the only credential. It is kept by session.js and
// passed on every call; nothing else about the owner lives on the phone.

const URL_BASE = "https://wuwerzyydtvargvqjufb.supabase.co/functions/v1";

// Public by design: it gets a request to the door, and the function checks the
// session before answering. Nothing secret ships in this app.
const KEY = "sb_publishable_aiiQjedgBx4Tq-NX_jIGtw_ekAYgxV_";

async function post(fn, body) {
  let res;
  try {
    res = await fetch(`${URL_BASE}/${fn}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${KEY}`,
        apikey: KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    // A phone with no signal is the normal case, not a fault.
    return { ok: false, error: "offline", message: "No connection. Check your internet." };
  }
  const data = await res.json().catch(() => ({}));
  if (data && typeof data.ok === "boolean") return data;
  return { ok: false, error: "server_error", message: "Something went wrong. Try again." };
}

export const api = {
  // identifier is whatever the owner typed -- an email or a phone number.
  // Which one it is decides which field the server sees; it is never sent
  // as both, so a login-by-email HQ (no phone on file at all) has a real
  // code path back in, not just the one that assumes a phone exists.
  loginStart: (identifier) =>
    identifier.includes("@")
      ? post("hq-login-start", { identityEmail: identifier })
      : post("hq-login-start", { phone: identifier }),
  // otpId is the provider's id for the code that was just sent. Passing it
  // back lets the check work even on a backend that has not stored it.
  // Meaningless (and omitted) for an email login, which is always checked
  // against the stored hash.
  loginVerify: (identifier, code, otpId) =>
    identifier.includes("@")
      ? post("hq-login-verify", { identityEmail: identifier, code })
      : post("hq-login-verify", { phone: identifier, code, otpId: otpId || null }),
  summary: (token) => post("hq-data", { token, action: "summary" }),
  branch: (token, branchId, kind, limit) =>
    post("hq-data", { token, action: "branch", branchId, kind, limit }),
  logout: (token) => post("hq-data", { token, action: "logout" }),
};
