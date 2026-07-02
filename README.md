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
backend logic lives entirely in Postgres, built up in this order:

1. **`schema`** — the four tables (`profiles`, `plates`, `comments`,
   `flags`), their constraints, and RLS turned on for all of them (deny
   by default until a policy says otherwise).
2. **`read_access`** — `SELECT` grants plus policies so plates and
   non-hidden comments are browsable by anyone, signed in or not.
3. **`auth_profiles`** — `profiles` is populated automatically by an
   `AFTER INSERT` trigger on `auth.users` (`handle_new_user`) when
   someone signs up, pulling `display_name` from the signup metadata;
   users can update their own profile row.
4. **`posting_and_rate_limits`** — `check_comment_rate_limit(plate)` is
   called from the `comments` table's `INSERT` policy, comparing
   `auth.uid()` against recent posts. Since `auth.uid()` comes from a
   verified JWT (not client input), this can be a plain function — no
   elevated privileges needed.
5. **`plate_stats`** — a `BEFORE INSERT` trigger creates the `plates`
   row if it doesn't exist yet (so the FK from `comments.plate` doesn't
   fail), and an `AFTER INSERT` trigger bumps `comment_count` /
   `last_seen_at`.
6. **`moderation`** — a `flags` table with primary key
   `(comment_id, user_id)` makes re-flagging a no-op (unique violation);
   an `AFTER INSERT` trigger increments `comments.flag_count` and sets
   `hidden = true` past a threshold. Hidden posts disappear immediately
   because the `SELECT` policy filters `hidden = false`.
7. **`storage_bucket`** — the `comment-images` bucket, public to read,
   restricted to `authenticated` to upload into.
8. **`harden_trigger_function_execute`** — the trigger functions above
   are `SECURITY DEFINER`; Postgres grants `EXECUTE` on new functions to
   `PUBLIC` by default, which would let anyone call them directly as an
   RPC instead of only via their trigger. This revokes that.

Posting requires login, reading doesn't: `anon` only ever gets `SELECT`
grants (not just an RLS check — the `INSERT` grant itself doesn't exist
for `anon` on `comments`/`flags`/the storage bucket), while `SELECT`
stays open to everyone so plates are browsable without an account.

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
connector / dashboard SQL editor, and verified by inspecting
`pg_policies` / table grants (`pg_class.relacl`) directly — table-level
`GRANT`s matter as much as RLS policies, since a role with no grant at
all on a table is denied before RLS is ever evaluated.
`supabase/migrations/` mirrors what was applied, for reproducibility —
if you have the Supabase CLI linked to the project, `supabase db push`
applies it the same way.

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
