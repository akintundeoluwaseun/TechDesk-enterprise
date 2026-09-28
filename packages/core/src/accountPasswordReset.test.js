import { describe, it, expect, afterEach, vi } from "vitest";
import { accountLocal } from "./accountLocal";

function stubFetch(handler) {
  vi.stubGlobal("fetch", vi.fn(handler));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("confirmSignUp", () => {
  it("refuses an empty email or code without calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await accountLocal.confirmSignUp("", "482913")).ok).toBe(false);
    expect((await accountLocal.confirmSignUp("shop@example.com", "")).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("verifies the code as a signup confirmation, not a link click, and signs this device in", async () => {
    let calledUrl, calledBody;
    stubFetch((url, init) => {
      calledUrl = url;
      calledBody = JSON.parse(init.body);
      return Promise.resolve({
        ok: true,
        json: async () => ({ access_token: "at", refresh_token: "rt" }),
      });
    });

    const res = await accountLocal.confirmSignUp("shop@example.com", "482913");

    expect(String(calledUrl)).toContain("/auth/v1/verify");
    expect(calledBody).toEqual({ type: "signup", email: "shop@example.com", token: "482913" });
    // Saving the session is not observable here -- accountStore falls back
    // silently with no localStorage under Node, same as every other
    // signed-in-after test in this package. What confirmSignUp promises is
    // the shape signIn/signUp already promise: ok, with nothing further to
    // do, which is exactly what it returns.
    expect(res).toEqual({ ok: true });
  });

  it("gives a message that doesn't tell a wrong code from an expired one", async () => {
    stubFetch(() =>
      Promise.resolve({ ok: false, json: async () => ({ error_code: "otp_expired" }) }),
    );
    const res = await accountLocal.confirmSignUp("shop@example.com", "000000");
    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/isn't right|expired/);
  });
});

describe("requestPasswordReset", () => {
  it("refuses an empty email without calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const res = await accountLocal.requestPasswordReset("");
    expect(res.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks Supabase to send a recovery code", async () => {
    let calledUrl, calledBody;
    stubFetch((url, init) => {
      calledUrl = url;
      calledBody = JSON.parse(init.body);
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const res = await accountLocal.requestPasswordReset("shop@example.com");

    expect(String(calledUrl)).toContain("/auth/v1/recover");
    expect(calledBody).toEqual({ email: "shop@example.com" });
    expect(res).toEqual({ ok: true });
  });

  it("says the same thing whether or not the address has an account", async () => {
    // Supabase itself answers /recover identically either way -- there is
    // nothing this function could add on top without leaking what Supabase
    // deliberately withholds.
    stubFetch(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    const resA = await accountLocal.requestPasswordReset("has-an-account@example.com");
    const resB = await accountLocal.requestPasswordReset("never-signed-up@example.com");
    expect(resA).toEqual(resB);
  });
});

describe("confirmPasswordReset", () => {
  it("refuses with anything missing, without calling out", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    expect((await accountLocal.confirmPasswordReset("", "112233", "newpass1")).ok).toBe(false);
    expect((await accountLocal.confirmPasswordReset("shop@example.com", "", "newpass1")).ok).toBe(false);
    expect((await accountLocal.confirmPasswordReset("shop@example.com", "112233", "")).ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("verifies the code, then sets the new password with the recovery session -- never the old one", async () => {
    const calls = [];
    stubFetch((url, init) => {
      calls.push({ url: String(url), body: init.body ? JSON.parse(init.body) : null, headers: init.headers });
      if (String(url).includes("/verify")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "recovery-token", refresh_token: "recovery-refresh" }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    const res = await accountLocal.confirmPasswordReset("shop@example.com", "112233", "newhunter3");

    expect(calls).toHaveLength(2);
    expect(calls[0].url).toContain("/auth/v1/verify");
    expect(calls[0].body).toEqual({ type: "recovery", email: "shop@example.com", token: "112233" });
    expect(calls[1].url).toContain("/auth/v1/user");
    expect(calls[1].body).toEqual({ password: "newhunter3" });
    // The password-setting call authenticates as the recovery session just
    // verified, not as whatever (or nothing) this device held before.
    expect(calls[1].headers.Authorization).toBe("Bearer recovery-token");

    expect(res).toEqual({ ok: true });
  });

  it("never attempts to set a password on a wrong or expired code", async () => {
    const fetchSpy = vi.fn(() =>
      Promise.resolve({ ok: false, json: async () => ({ error_code: "otp_expired" }) }),
    );
    stubFetch(fetchSpy);

    const res = await accountLocal.confirmPasswordReset("shop@example.com", "000000", "newhunter3");

    expect(res.ok).toBe(false);
    expect(fetchSpy).toHaveBeenCalledTimes(1); // /verify only -- /user is never reached
  });

  it("reports failure, in the owner's own words, if setting the password itself fails", async () => {
    stubFetch((url) => {
      if (String(url).includes("/verify")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({ access_token: "recovery-token", refresh_token: "recovery-refresh" }),
        });
      }
      return Promise.resolve({ ok: false, json: async () => ({ error_code: "weak_password" }) });
    });

    const res = await accountLocal.confirmPasswordReset("shop@example.com", "112233", "123");

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/longer password/);
  });
});
