# Carbook

A website where people comment on specific vehicle license plates —
built on Supabase (Postgres + Row Level Security + Storage) with a static
frontend on Vercel. There is no custom backend: the browser talks
directly to Supabase's REST API, and Postgres itself enforces everything
that would normally live in server code.

## Features

- Search any plate and read/post comments about it
- Optional tag per comment (Safe Driving, Aggressive Driving, Let Merge,
  Phone Use, Other) for a quick at-a-glance signal
- Optional display name and photo per comment
- Homepage lists recently active plates
- Anonymous by design: no accounts, no login
- Abuse controls enforced by Postgres Row Level Security at insert time:
  a daily comment cap, a per-plate-per-day cap (blunts single-plate
  pile-ons), and a minimum interval between comments
- Community moderation: anyone can report a comment; it's auto-hidden
  once enough distinct people report it (a unique constraint stops one
  person from forcing a hide by reporting repeatedly)

## Architecture

```
public/            static frontend (search, plate thread, comment form)
  index.html        all UI + logic, loads @supabase/supabase-js from a CDN
  config.js          Supabase project URL + publishable key (safe to expose —
                      access is controlled by RLS, not by keeping this secret)
supabase/migrations/ the schema, as a single SQL file (tables, RLS, triggers)
vercel.json          serves public/ as a static site, no build step
.github/workflows/    deploys the frontend to Vercel on push
```

There's no `src/`, no API routes, no server runtime. What used to be
backend logic now lives entirely in Postgres:

- **Rate limiting / anti-targeting** — a `SECURITY DEFINER` function
  (`check_comment_rate_limit`) is called from the `comments` table's
  `INSERT` policy. It has to be `SECURITY DEFINER` because it reads
  `user_hash`, which the `anon` role is deliberately never granted
  `SELECT` on directly.
- **Plate stats** — a `BEFORE INSERT` trigger creates the `plates` row if
  it doesn't exist yet (so the FK from `comments.plate` doesn't fail),
  and an `AFTER INSERT` trigger bumps `comment_count` / `last_seen_at`.
- **Moderation** — a `flags` table with primary key
  `(comment_id, user_hash)` makes re-flagging a no-op (unique
  violation); an `AFTER INSERT` trigger increments `comments.flag_count`
  and sets `hidden = true` past a threshold. Hidden comments disappear
  immediately because the `SELECT` policy filters `hidden = false`.
- **No identity linking** — `user_hash` is excluded from the `SELECT`
  column grant on `comments`, so it's never returned to any client no
  matter what query is run against the REST API.

## Anonymous identity, and its trade-off

There's no server, so there's no IP address to hash. Rate limiting keys
off a random UUID the browser generates on first visit and persists in
`localStorage` (see `getUserHash()` in `public/index.html`). This is
weaker than the previous server-side design: clearing site data resets
someone's limits. That's an inherent trade-off of having zero backend —
if this needs to be harder to evade, the next step would be Supabase
Edge Functions checking IP/headers server-side.

A second, smaller trade-off: `check_comment_rate_limit` must be
`EXECUTE`-able by `anon` for the RLS policy to invoke it, which also
makes it directly callable via `/rest/v1/rpc/check_comment_rate_limit`.
It only returns a boolean (never raw counts), and calling it usefully
requires already knowing a specific `user_hash` UUID, so the exposure is
minimal — documented here rather than solved, since removing it would
require moving the check into a real backend.

## Local development

There's no build step. Serve `public/` with anything static, e.g.:

```bash
npx serve public
```

## Database changes

Made directly against the Supabase project via the Supabase MCP
connector / dashboard SQL editor. `supabase/migrations/` mirrors what
was applied, for reproducibility — if you have the Supabase CLI linked
to the project, `supabase db push` will apply it the same way.

## Deploying the frontend to Vercel

`vercel.json` serves `public/` as-is with no build step.

```bash
npx vercel login
npx vercel --prod
```

### CI deploys (GitHub Actions)

`.github/workflows/deploy.yml` deploys on push, or on manual dispatch.
Add these as **repository secrets** (Settings → Secrets and variables →
Actions):

- `VERCEL_TOKEN`
- `VERCEL_ORG_ID` / `VERCEL_PROJECT_ID` — optional; the workflow creates
  the `carbook` project on first run if it doesn't exist yet

## Notes on scope

- No accounts/login — comments are anonymous by design.
- Moderation is fully automated (report → auto-hide past a threshold).
  There's no admin review queue or unhide path — that's the natural
  next thing to add if abuse becomes an issue in practice.
- Rate-limit identity is a client-side random ID, not IP-based (see
  "Anonymous identity" above) — an inherent trade-off of running with no
  backend at all.
