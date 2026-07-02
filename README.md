# Carbook

Know who's really behind the wheel. Carbook is where drivers create an
account and post feedback on any license plate — safe merges, reckless
driving, phone use, and everything in between — built on Supabase
(Postgres + Row Level Security + Storage) with a static frontend on
Vercel. There is no custom backend: the browser talks directly to
Supabase's REST/Auth API, and Postgres itself enforces everything that
would normally live in server code.

## Features

- A landing page (headline, feature highlights, CTAs) for logged-out
  visitors; collapses to a compact search once you're signed in
- Real accounts (email/password via Supabase Auth) — sign up, log in,
  log out, session persists across visits
- Search any plate and read its posts without an account
- **Posting requires an account** — every post is tied to a real
  profile (`display_name`), not an anonymous drive-by
- Optional tag per post (Safe Driving, Aggressive Driving, Let Merge,
  Phone Use, Other) and an optional photo
- Homepage lists recently active plates
- Abuse controls enforced by Postgres Row Level Security at insert time:
  a daily post cap, a per-plate-per-day cap (blunts single-plate
  pile-ons), and a minimum interval between posts — keyed off `auth.uid()`,
  which the client cannot spoof
- Community moderation: any logged-in user can report a post; it's
  auto-hidden once enough distinct people report it (a unique constraint
  stops one person from forcing a hide by reporting repeatedly)

## Architecture

```
public/            static frontend (landing, auth modal, search, plate thread)
  index.html        all UI + logic, loads @supabase/supabase-js from a CDN
  config.js          Supabase project URL + publishable key (safe to expose —
                      access is controlled by RLS, not by keeping this secret)
supabase/migrations/ the schema, as SQL files (tables, RLS, triggers, auth)
vercel.json          serves public/ as a static site, no build step
.github/workflows/    deploys the frontend to Vercel on push
```

There's no `src/`, no API routes, no server runtime. What used to be
backend logic lives entirely in Postgres:

- **Accounts** — `profiles` (id, display_name) is populated automatically
  by an `AFTER INSERT` trigger on `auth.users` (`handle_new_user`) when
  someone signs up, pulling `display_name` from the signup metadata.
- **Rate limiting / anti-targeting** — `check_comment_rate_limit(plate)`
  is called from the `comments` table's `INSERT` policy, comparing
  `auth.uid()` against recent posts. Since `auth.uid()` comes from a
  verified JWT (not client input), this can be a plain function — no
  elevated privileges needed, unlike the anonymous-era design.
- **Plate stats** — a `BEFORE INSERT` trigger creates the `plates` row if
  it doesn't exist yet (so the FK from `comments.plate` doesn't fail),
  and an `AFTER INSERT` trigger bumps `comment_count` / `last_seen_at`.
- **Moderation** — a `flags` table with primary key
  `(comment_id, user_id)` makes re-flagging a no-op (unique violation);
  an `AFTER INSERT` trigger increments `comments.flag_count` and sets
  `hidden = true` past a threshold. Hidden posts disappear immediately
  because the `SELECT` policy filters `hidden = false`.
- **Posting requires login, reading doesn't** — `anon` has no `INSERT`
  grant at all on `comments`/`flags`/the storage bucket (not just an RLS
  check — the grant itself doesn't exist), while `SELECT` stays open to
  everyone so plates are browsable without an account.

## Local development

There's no build step. Serve `public/` with anything static, e.g.:

```bash
npx serve public
```

Email confirmation behavior on signup depends on the Supabase project's
Auth settings (dashboard → Authentication → Providers → Email). The
sign-up flow handles both cases: if a session comes back immediately,
you're logged in; otherwise it prompts to check your email.

## Database changes

Made directly against the Supabase project via the Supabase MCP
connector / dashboard SQL editor, and verified by simulating the
`anon`/`authenticated` roles (with a real JWT claim for `auth.uid()`)
directly in SQL before ever touching the frontend. `supabase/migrations/`
mirrors what was applied, for reproducibility — if you have the Supabase
CLI linked to the project, `supabase db push` applies it the same way.

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

- Moderation is fully automated (report → auto-hide past a threshold).
  There's no admin review queue or unhide path — that's the natural
  next thing to add if abuse becomes an issue in practice.
- No password reset / email change flows built yet — Supabase Auth
  supports both, just not wired into this UI.
- No profile-editing UI yet, though the RLS policy for it
  (`profiles_update_own`) already exists.
