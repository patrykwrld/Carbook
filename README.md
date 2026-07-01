# Carbook

A website where people comment on specific vehicle license plates — built
on Cloudflare (Workers + Hono, D1, KV).

## Features

- Search any plate and read/post comments about it
- Optional tag per comment (Safe Driving, Aggressive Driving, Let Merge,
  Phone Use, Other) for a quick at-a-glance signal
- Optional display name and photo per comment
- Homepage lists recently active plates
- Anonymous by design: no accounts, no login. Comments carry only an
  optional self-chosen display name — no other identity is stored or shown
- Abuse controls: per-commenter daily cap, per-plate-per-day cap (blunts
  single-plate pile-ons), and a minimum interval between comments, all
  enforced in KV
- Community moderation: anyone can report a comment; it's auto-hidden
  once enough distinct people report it (dedup'd so one person can't force
  a hide by reporting repeatedly)

## Stack

- Cloudflare Workers (API), routed with Hono
- D1 for `plates` and `comments`
- KV for rate limiting/dedupe counters (`RATE_LIMIT_KV`) and image blobs (`IMAGES_KV`)
- Static frontend served via Workers Assets (`public/`) — vanilla JS, hash-based routing, no build step

## Project layout

```
src/
  index.ts          Hono app: API routes + static asset fallback
  routes/
    comments.ts     create comment / list a plate's comments
    flag.ts         report a comment (auto-hide past a flag threshold)
    trending.ts     recently active plates for the homepage
    image.ts        serve uploaded comment images from KV
  abuse.ts          KV rate-limit / anti-targeting / flag dedupe (pure, unit-tested)
  moderation.ts     comment/author validation + auto-hide threshold (pure, unit-tested)
  db.ts             D1 queries
  plate.ts          plate normalization/validation
  hash.ts           anonymous commenter hashing (abuse control only)
  image.ts          image validation + KV storage
migrations/         D1 schema
public/             static frontend (search, plate thread, comment form)
test/               vitest unit tests
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
npm test         # vitest: abuse control, moderation, plate validation
npm run typecheck
```

## API

- `POST /api/comments` — `{ plate, body, tag?, authorName?, imageBase64?, imageContentType? }`
- `GET /api/plate/:plate?limit=&before=` — plate's comment count + a page of comments (newest first, cursor pagination via `before`)
- `GET /api/trending?limit=` — recently active plates
- `POST /api/comments/:id/flag` — report a comment; auto-hides once the flag threshold is reached
- `GET /api/image/:key` — serves an uploaded comment image

## Deploying to Cloudflare

The D1 database (`carbook_db`) and both KV namespaces (`RATE_LIMIT_KV`,
`IMAGES_KV`) are already provisioned in the target Cloudflare account, with
real IDs committed in `wrangler.toml` and the schema from
`migrations/0001_init.sql` already applied. To deploy fresh elsewhere:

1. Create the D1 database and KV namespaces, then paste the returned IDs
   into `wrangler.toml`:
   ```bash
   npx wrangler d1 create carbook_db
   npx wrangler kv namespace create RATE_LIMIT_KV
   npx wrangler kv namespace create IMAGES_KV
   ```
2. Apply the schema (safe to re-run, all statements are `IF NOT EXISTS`):
   ```bash
   npm run db:migrate:remote
   ```
3. Set the production secret for the anonymous commenter hash:
   ```bash
   npx wrangler secret put USER_HASH_SALT
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```

## Deploying the frontend to Vercel

Vercel has no equivalent for D1 or Workers KV, so the API can only run on
Cloudflare — but the static frontend in `public/` can be hosted on Vercel
as a separate origin. `vercel.json` serves `public/` as-is with no build
step, and `src/index.ts` enables CORS on `/api/*` so the Worker accepts
requests from the Vercel domain.

1. Deploy the Worker first and note its URL, e.g.
   `https://carbook.<subdomain>.workers.dev`.
2. Point the frontend at it in `public/config.js`:
   ```js
   window.CARBOOK_API_BASE = 'https://carbook.<subdomain>.workers.dev';
   ```
3. Deploy:
   ```bash
   npx vercel login
   npx vercel --prod
   ```

If you'd rather keep everything on Cloudflare, skip this — the Worker
already serves `public/` itself, and `config.js` defaults to same-origin.

## CI deploys (GitHub Actions)

`.github/workflows/deploy.yml` deploys both halves on push, or on manual
dispatch. Add these as **repository secrets** (Settings → Secrets and
variables → Actions):

- `CLOUDFLARE_API_TOKEN` — scoped to Workers Scripts:Edit, D1:Edit, Workers KV Storage:Edit
- `CLOUDFLARE_ACCOUNT_ID` — only needed if the token has access to more than one account
- `USER_HASH_SALT` — a random string; pushed via `wrangler secret put` before each deploy, never stored in the repo
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` — populate after the first `vercel` deploy links a project

## Notes on scope

- No accounts/login — comments are anonymous by design. This keeps the
  MVP small but also means a display name is just a free-text label, not
  a verified identity.
- Moderation is fully automated (report → auto-hide past a threshold).
  There's no admin review queue or unhide path yet — that's the natural
  next thing to add if abuse becomes an issue in practice.
