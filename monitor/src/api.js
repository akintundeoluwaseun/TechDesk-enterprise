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
  loginStart: (phone) => post("hq-login-start", { phone }),
  loginVerify: (phone, code) => post("hq-login-verify", { phone, code }),
  summary: (token) => post("hq-data", { token, action: "summary" }),
  branch: (token, branchId, kind, limit) =>
    post("hq-data", { token, action: "branch", branchId, kind, limit }),
  logout: (token) => post("hq-data", { token, action: "logout" }),
};
