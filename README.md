# Driver Signal

A mobile-first, structured, aggregated driver feedback system built entirely
on Cloudflare (Workers + Hono, D1, KV). Not a social platform — no identities,
no raw report visibility, no free-form feedback categories.

## Product rules (enforced in code, not just docs)

- Feedback types are limited to `LET_MERGE`, `SAFE_DRIVING`, `AGGRESSIVE_DRIVING`, `PHONE_USE`.
- No identity linking: the only "user" concept stored is a one-way SHA-256
  hash of IP + User-Agent + server salt (`src/hash.ts`), used solely for
  abuse control.
- No raw report visibility: `GET /api/plate/:plate` never returns individual
  comments, images, or events — only the computed aggregate (`src/aggregate.ts`).
- A plate is only visible once it has ≥5 unique reporters AND ≥2 distinct
  report days in the trailing 30 days (`VISIBILITY_MIN_UNIQUE_USERS` /
  `VISIBILITY_MIN_DISTINCT_DAYS` in `src/aggregate.ts`).
- Abuse controls (`src/abuse.ts`, KV-backed with 24h TTL):
  - Max 5 submissions per user per day.
  - Duplicate (user + plate + feedback type) blocked for 24h — enforced in
    KV up front, and backstopped by a D1 unique index in case of races.
  - Max 2 submissions per user against the same plate per day, to blunt
    single-plate targeting/spam.

## Stack

- Cloudflare Workers (API), routed with Hono
- D1 for `plates` and `feedback_events`
- KV for rate limiting/dedupe counters (`RATE_LIMIT_KV`) and image blobs (`IMAGES_KV`)
- Static frontend served via Workers Assets (`public/`)

## Project layout

```
src/
  index.ts        Hono app: API routes + static asset fallback
  routes/         submit / plate / claim handlers
  aggregate.ts    score, trend, visibility (pure, unit-tested)
  abuse.ts        KV rate-limit / dedupe / anti-targeting (pure, unit-tested)
  db.ts           D1 queries
  plate.ts        plate normalization/validation
  hash.ts         anonymous user hashing
  image.ts        image validation + KV storage
migrations/       D1 schema
public/           static frontend (submit + search flows)
test/             vitest unit tests
```

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # local-only USER_HASH_SALT, git-ignored
npm run db:migrate:local         # applies migrations/ to the local D1 shim
npm run dev                      # wrangler dev, serves API + frontend on :8787
```

## Tests

```bash
npm test         # vitest: aggregation, abuse control, plate validation
npm run typecheck
```

## Deploying to Cloudflare

The D1 database (`driver_signal_db`) and both KV namespaces
(`RATE_LIMIT_KV`, `IMAGES_KV`) are already provisioned in the target
Cloudflare account, with real IDs committed in `wrangler.toml` and the
schema from `migrations/0001_init.sql` already applied. To deploy fresh
elsewhere, or to redeploy:

1. If starting over, create the D1 database and KV namespaces and paste
   the returned IDs into `wrangler.toml`:
   ```bash
   npx wrangler d1 create driver_signal_db
   npx wrangler kv namespace create RATE_LIMIT_KV
   npx wrangler kv namespace create IMAGES_KV
   ```
2. Apply the schema to the remote database (safe to re-run, all
   statements are `IF NOT EXISTS`):
   ```bash
   npm run db:migrate:remote
   ```
3. Set the production secret for user hashing:
   ```bash
   npx wrangler secret put USER_HASH_SALT
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```

See "CI deploys" below to do all of this from GitHub Actions instead.

## API

- `POST /api/submit` — `{ plate, feedbackType, comment?, imageBase64?, imageContentType? }`
- `GET /api/plate/:plate` — aggregate result only (no raw events)
- `POST /api/claim` — placeholder, validates input, persists nothing, no auth yet

## Deploying the frontend to Vercel

The API (Workers + D1 + KV) can only run on Cloudflare — Vercel has no
equivalent for D1 or Workers KV. What Vercel *can* host is the static
frontend in `public/`, calling the Cloudflare Worker as a separate API
origin. `vercel.json` is already configured to serve `public/` as-is with
no build step, and `src/index.ts` enables permissive CORS on `/api/*` so
the Worker accepts requests from the Vercel domain.

1. Deploy the Worker first (see "Deploying to Cloudflare" above) and note
   its URL, e.g. `https://driver-signal.<subdomain>.workers.dev`.
2. Point the frontend at it by editing `public/config.js`:
   ```js
   window.DRIVER_SIGNAL_API_BASE = 'https://driver-signal.<subdomain>.workers.dev';
   ```
3. Deploy to Vercel:
   ```bash
   npx vercel login       # one-time, interactive
   npx vercel --prod
   ```

If you'd rather keep everything on Cloudflare, skip this section — the
Worker already serves `public/` itself via the `ASSETS` binding, and
`config.js` defaults to same-origin requests.

## CI deploys (GitHub Actions)

`.github/workflows/deploy.yml` deploys both halves on every push to
`main`/`claude/driver-signal-mvp-1knsvs`, or on manual dispatch. It exists
because this repo is developed in a network-restricted sandbox that can't
reach `cloudflare.com` or `vercel.com` directly — GitHub's own runners can.

Add these as **repository secrets** (Settings → Secrets and variables →
Actions), not in the codebase:

- `CLOUDFLARE_API_TOKEN` — scoped to Workers Scripts:Edit, D1:Edit, Workers KV Storage:Edit
- `CLOUDFLARE_ACCOUNT_ID` — only needed if the token has access to more than one account
- `USER_HASH_SALT` — a random string; the workflow pushes it via `wrangler secret put` before each deploy (never stored in the repo)
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` — populate after the first `vercel` deploy links a project (read from the generated `.vercel/project.json`, or `vercel project ls`)

The D1 database (`driver_signal_db`) and both KV namespaces
(`RATE_LIMIT_KV`, `IMAGES_KV`) referenced in `wrangler.toml` are already
provisioned in the target Cloudflare account with the schema applied —
the workflow's migration step is idempotent (`CREATE ... IF NOT EXISTS`)
and safe to re-run.
