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
npm run db:migrate:local      # applies migrations/ to the local D1 shim
npm run dev                   # wrangler dev, serves API + frontend on :8787
```

## Tests

```bash
npm test         # vitest: aggregation, abuse control, plate validation
npm run typecheck
```

## Deploying to Cloudflare

1. Create the D1 database and KV namespaces, then paste the returned IDs
   into `wrangler.toml`:
   ```bash
   npx wrangler d1 create driver_signal_db
   npx wrangler kv namespace create RATE_LIMIT_KV
   npx wrangler kv namespace create IMAGES_KV
   ```
2. Apply the schema to the remote database:
   ```bash
   npm run db:migrate:remote
   ```
3. Set a real production secret for user hashing (do not rely on the
   `USER_HASH_SALT` value committed in `wrangler.toml`):
   ```bash
   npx wrangler secret put USER_HASH_SALT
   ```
4. Deploy:
   ```bash
   npm run deploy
   ```

## API

- `POST /api/submit` — `{ plate, feedbackType, comment?, imageBase64?, imageContentType? }`
- `GET /api/plate/:plate` — aggregate result only (no raw events)
- `POST /api/claim` — placeholder, validates input, persists nothing, no auth yet
