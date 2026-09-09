# TechDesk website

A single static page: what TechDesk is, downloads for both editions, and the
"Create HQ account" sign-up for multi-branch. No build step — it's one
`index.html` you can deploy as-is.

## Before you deploy

Open `index.html` and fill in the three constants near the bottom (search
for "Configuration"):

```js
const HQ_API_BASE = "https://REPLACE-WITH-YOUR-WORKER.workers.dev";
const BUSINESS_DOWNLOAD_URL = "#";
const ENTERPRISE_DOWNLOAD_URL = "#";
```

- **`HQ_API_BASE`** — the Worker URL from `relay/README.md` (the same
  Worker that sends the daily digest email now also issues HQ accounts —
  see "The `/hq/*` endpoints" below). Deploy/update the Worker first with
  `wrangler deploy` from `relay/`, then paste its URL here.
- **`BUSINESS_DOWNLOAD_URL` / `ENTERPRISE_DOWNLOAD_URL`** — direct links to
  your installers. The simplest option is a GitHub Release with the built
  `.exe`/`.dmg` attached as release assets; point these at those asset
  URLs. Until real installers are attached somewhere, leave them as `#` —
  the buttons just won't go anywhere yet.

## Deploying

Any static host works. The easiest is Cloudflare Pages, since you already
have a Cloudflare account for the email relay:

```
cd website
npx wrangler pages deploy . --project-name=techdesk-site
```

That prints a `*.pages.dev` URL. Point your own domain at it later from the
Cloudflare Pages dashboard if you want `techdesk.yourdomain.com` instead.

## The `/hq/*` endpoints

Two new routes were added to the same Worker as the email relay
(`relay/worker.js`) — no second Worker to deploy or pay for:

- `POST /hq/create-account` — `{ email }` → generates a **Business Key**
  (format `TDHQ-XXXX-XXXX-XXXX`), stores it in the same `RATE_LIMIT` KV
  namespace as `biz:<key>`, and emails it via Resend. This is what the
  website's form calls.
- `POST /hq/create-branch` — `{ businessKey, branchName }` → generates a
  **Branch Code** (`TDBR-XXXX-XXXX`) tied to that business, stored as
  `branch:<code>`. This one isn't called from the website — it's meant to
  be called from inside the Enterprise app once "Connect to HQ" is built,
  so an owner can generate a code per shop without leaving the app.

Both are public (no `CLIENT_KEY` needed, since the website has no embedded
secret to send) and rate-limited by IP and by email/business key instead —
see `MAX_ACCOUNTS_PER_IP_PER_DAY`, `MAX_ACCOUNTS_PER_EMAIL_PER_DAY`, and
`MAX_BRANCHES_PER_BUSINESS_PER_DAY` in `worker.js` if you need to adjust
them.

Redeploy the Worker after pulling this change:
```
cd relay
wrangler deploy
```

## What's not built yet

This covers the website + the Worker's account/branch creation. Still
needed before HQ sync actually works end-to-end:
- The "Connect to HQ" screen inside Enterprise's Settings (paste a
  Business Key or Branch Code, toggle what syncs).
- The actual sync engine (push/pull inventory, customers, sales, repairs).
- The combined "All Branches" report/dashboard view.
