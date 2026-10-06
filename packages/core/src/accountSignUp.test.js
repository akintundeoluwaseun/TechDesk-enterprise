import { describe, it, expect, afterEach, vi } from "vitest";
import { accountLocal } from "./accountLocal";

function stubFetch(body) {
  vi.stubGlobal("fetch", vi.fn(() => Promise.resolve({ ok: true, json: async () => body })));
}

afterEach(() => {
  vi.unstubAllGlobals();
});

// Supabase will not say "that email is taken" -- answering differently would
// let anyone test which emails have accounts. It returns the same shape as a
// new signup, minus the identities. Without reading that, the app told people
// a code was on its way and none ever came.
describe("signing up with an email that already has an account", () => {
  it("says so, instead of promising a code that never arrives", async () => {
    stubFetch({ id: "u1", email: "shop@example.com", identities: [] });
    const res = await accountLocal.signUp("shop@example.com", "password1");
    expect(res.ok).toBe(false);
    expect(res.exists).toBe(true);
    expect(res.message).toMatch(/already has a TechDesk account/i);
  });

  it("reads the same answer when it arrives wrapped in a user", async () => {
    stubFetch({ user: { id: "u1", identities: [] } });
    expect((await accountLocal.signUp("shop@example.com", "password1")).exists).toBe(true);
  });

  it("still asks a genuinely new account to confirm its email", async () => {
    stubFetch({ id: "u2", email: "new@example.com", identities: [{ provider: "email" }] });
    const res = await accountLocal.signUp("new@example.com", "password1");
    expect(res).toEqual({ ok: true, needsConfirmation: true });
  });

  it("signs in straight away when confirmation is switched off", async () => {
    stubFetch({ access_token: "at", refresh_token: "rt" });
    expect(await accountLocal.signUp("new@example.com", "password1")).toEqual({ ok: true });
  });
});
