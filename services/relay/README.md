# TechDesk email relay

Lets shop owners set up the daily digest by typing only their email address.
The app never holds real email-sending credentials — this small Cloudflare
Worker does, and every installed copy of TechDesk talks to it instead of an
SMTP server.

## One-time setup (you, the developer — not each shop)

You need a Cloudflare account (free), a Resend account (free tier: 3,000
emails/month, 100/day), Node installed locally, and — realistically — a
domain you own.

**About the domain.** Resend lets you send from the shared `onboarding@resend.dev`
sender without verifying anything, but that shared sender is meant for testing
and Resend restricts who it will deliver to (expect it to reach only the address
you signed up with). That is fine for proving the pipe works end to end; it is
not fine for real shops, whose digests would silently never arrive. Before any
customer turns the digest on, verify a domain you own in Resend and send from
that. Check the current restriction on your own Resend dashboard rather than
taking this paragraph's word for it — their free-tier rules change.

Total cost: Cloudflare Workers, KV and Resend all have free tiers that comfortably
cover this. The domain (roughly $10–15/year) is the only real expense.

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

5. **Set the from-address — this one is not optional.** `wrangler.toml` ships
   with the placeholder `FROM_ADDRESS = "TechDesk <digest@yourdomain.com>"`.
   That domain does not exist, so if you deploy without touching it **every
   send fails** with a Resend "domain is not verified" error. Set it to either:
   - `onboarding@resend.dev` — works immediately, no DNS, testing only (see the
     delivery restriction noted above), or
   - an address on a domain you verified in step 1, e.g.
     `TechDesk <digest@yourdomain.com>` — what you want for real use.

   (`worker.js` falls back to `digest@techdesk.app` only when `FROM_ADDRESS` is
   *unset*. Since `wrangler.toml` sets it, that fallback never fires — and it is
   not a domain you own either. Set the var.)

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
Enterprise only — the daily digest is an Enterprise feature, and Business and
Solo ship no `relayConfig.js` at all. If the digest is ever added to Business,
it reuses this same Worker URL and client key.

Rebuild/repackage the app. Every shop that installs it from then on can turn
on the daily digest by typing only their email address — no SMTP setup.

## Wiring it into the website

The website calls the same Worker for HQ signup. In `techdesk-website-/app.js`,
`API_BASE` is currently the literal placeholder
`https://REPLACE-WITH-YOUR-WORKER.workers.dev`, so the form on `hq.html` fails
for anyone who fills it in. Replace it with the Worker URL from step 6.

(The Activate page is unaffected — it calls a relative `/api/activate/lookup`
that Vercel serves, not the Worker.)

## Checking it actually works

Before rebuilding anything, confirm the deployed Worker can send. From any
machine:

```
curl -X POST https://techdesk-email-relay.<you>.workers.dev/send-test \
  -H "Content-Type: application/json" \
  -d '{"clientKey":"<your CLIENT_KEY>","to":"<your email>","shopName":"Test"}'
```

- `{"ok":true}` and an email arrives — done.
- `{"ok":false,...}` mentioning the domain — `FROM_ADDRESS` is wrong (step 5).
- `Unauthorized` — the `CLIENT_KEY` you sent doesn't match the secret you set.
- Nothing arrives but you got `ok:true` — check Resend → Logs; this is usually
  the shared-sender delivery restriction described at the top.

If anything is wrong, fix it and `wrangler deploy` again. Only once this passes
is it worth rebuilding the desktop apps, since a bad value means re-cutting
every installer.

## Changing the rate limit

`MAX_SENDS_PER_RECIPIENT_PER_DAY` in `worker.js` defaults to 4 (1 daily
digest + a little headroom for test sends). Raise it if that's too tight for
your use case, but keep some cap — it's the main thing stopping the relay
from being abused as a generic spam tool if `CLIENT_KEY` ever leaks.

## Loading activation codes (PIN → code lookup)

The website's Activate page (`POST /activate/lookup`) looks up a code by
PIN against the *same* `RATE_LIMIT` KV namespace, under keys shaped
`actpin:<version>:<pin>` (e.g. `actpin:solo:819865`), each holding a JSON
array of one or more matching codes (an array because a 6-digit PIN space
only has 1,000,000 possible values, so a handful of collisions among 5,000
random PINs is expected — a couple of the 5,000 will share a PIN and map
to two different codes; the lookup returns all of them and the app's own
offline check rejects whichever one doesn't match).

**The actual PIN/code pairs are never committed to this repo** — like
`RESEND_API_KEY`, they're a real, valuable secret (5,000 license codes),
and git history is forever, so a value that shouldn't leak shouldn't ever
be a commit away from leaking. They live only in KV.

To load them (after creating the `RATE_LIMIT` namespace above):
```
wrangler kv bulk put --binding=RATE_LIMIT solo_activation_kv_bulk.json
```
using the bulk-upload JSON file generated from your activation sheet
(`[{"key": "actpin:solo:<pin>", "value": "[\"<code>\", ...]"}, ...]`) —
keep that file itself out of git too once you've run this, the same as
you would a password file.

Repeat with a differently-prefixed file (`actpin:business:...`,
`actpin:enterprise:...`) whenever those editions get their own codes, and
add `"business"` / `"enterprise"` to the `ACTIVATION_VERSIONS` set at the
top of `worker.js` once they're loaded — the lookup rejects any version
not in that set so the UI can't be pointed at codes that don't exist yet.

The lookup itself is public (no `CLIENT_KEY`, since the website has no
embedded secret) and rate-limited by IP and by PIN
(`MAX_ACTIVATION_LOOKUPS_PER_IP_PER_DAY` / `_PER_PIN_PER_DAY` in
`worker.js`) — this is the main real defense here, since with no purchase
proof at lookup time, an unlimited endpoint would let someone script
through the PIN space and harvest codes.
