# TechDesk email relay

Lets shop owners set up the daily digest by typing only their email address.
The app never holds real email-sending credentials — this small Cloudflare
Worker does, and every installed copy of TechDesk talks to it instead of an
SMTP server.

## One-time setup (you, the developer — not each shop)

You need a Cloudflare account (free) and a Resend account (free tier: 3,000
emails/month, 100/day).

1. **Resend** — sign up at https://resend.com, then either:
   - Quick start: skip domain verification and use the shared sender
     `onboarding@resend.dev` (fine for testing, may land in spam more often), or
   - Verify your own sending domain under Resend → Domains (recommended for
     real use — better deliverability, and lets `FROM_ADDRESS` below use
     your own domain).
   Grab an API key from Resend → API Keys.

2. **Cloudflare Workers** — install Wrangler and log in:
   ```
   npm install -g wrangler
   wrangler login
   ```

3. **Create the KV namespace** (used for per-recipient rate limiting):
   ```
   cd relay
   wrangler kv namespace create RATE_LIMIT
   ```
   Copy the `id` it prints into `wrangler.toml`'s `[[kv_namespaces]]` block.

4. **Set the secrets:**
   ```
   wrangler secret put RESEND_API_KEY
   # paste your Resend API key when prompted

   wrangler secret put CLIENT_KEY
   # paste any long random string you generate yourself, e.g.:
   #   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   # this is the shared secret the desktop app sends to prove a request came
   # from a real TechDesk install -- it's baked into the app itself, so it's
   # not truly secret (anyone could extract it from an installed copy), but
   # it keeps the relay from being an open, unauthenticated internet-wide
   # send-email endpoint. Real abuse resistance comes from the per-recipient
   # rate limit in worker.js, not from this key.
   ```

5. **(Optional) Set your own from-address** in `wrangler.toml`'s `[vars]`
   block — must be on a domain you verified in Resend, otherwise leave it
   as the default and Resend will reject sends from an unverified domain.

6. **Deploy:**
   ```
   wrangler deploy
   ```
   This prints your Worker's URL, e.g. `https://techdesk-email-relay.<you>.workers.dev`.

## Wiring it into the app

Open `electron/relayConfig.js` in the main repo and fill in:
```js
module.exports = {
  RELAY_URL: "https://techdesk-email-relay.<you>.workers.dev",
  CLIENT_KEY: "the same random string you set as the CLIENT_KEY secret above",
};
```
Rebuild/repackage the app. Every shop that installs it from then on can turn
on the daily digest by typing only their email address — no SMTP setup.

## Changing the rate limit

`MAX_SENDS_PER_RECIPIENT_PER_DAY` in `worker.js` defaults to 4 (1 daily
digest + a little headroom for test sends). Raise it if that's too tight for
your use case, but keep some cap — it's the main thing stopping the relay
from being abused as a generic spam tool if `CLIENT_KEY` ever leaks.
