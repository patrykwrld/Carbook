# Carbook — Build Blueprint

> A self-contained execution plan. A future session should be able to build the entire
> app from this document alone, using the Supabase and Vercel MCP connectors already
> authenticated in this workspace.

---

## 1. Product definition

**One sentence:** A public guestbook for cars — anyone can look up a registration plate and read or leave comments tied to that plate.

**Core loop:**

1. User sees a car (parked, driving, at work, anywhere).
2. Opens Carbook, types the plate number.
3. Reads what others have said about that car; leaves their own comment.
4. Plate owners can claim their plate and reply.

**What Carbook is:** playful, community-driven, about *cars and driving behavior*.

**What Carbook is not:** a tool for identifying, doxxing, or harassing *people*. This is a product-defining constraint, not an afterthought — plates map to humans, so the moderation layer in §5 is a launch blocker, not a post-launch nice-to-have. No comment may contain personal names, addresses, workplaces, or photos of people. Enforced at three levels: content policy, automated filtering, and community reporting.

---

## 2. Provisioned infrastructure (Phase 0 done 2026-07-02)

Both MCP connectors are authenticated and working. Do **not** ask the user to set up accounts.

| Fact | Value |
|---|---|
| Supabase org | `pepe30kg's projects` (`vercel_icfg_i6dg9uiY4uN2siZmAfcGnTGI`) |
| Supabase project | `carbook` — ref `ncjuttxaxbfbafkocemx`, us-east-1, Postgres 17 (pre-existing project reused; free-tier limit blocks creating new ones) |
| API URL | `https://ncjuttxaxbfbafkocemx.supabase.co` |
| Anon key | via `mcp__Supabase__get_publishable_keys` (legacy `anon` JWT key in use for `@supabase/ssr` compatibility) |
| Schema | Migration `reset_to_blueprint_schema` applied: §4 schema live, prior prototype schema (empty) dropped. Security advisors: 0 findings. RLS smoke test passed (anon read OK, anon write rejected). |
| Storage | Bucket `car-photos` (public read, 5 MB, jpeg/png/webp) — repurposed from empty prototype bucket |
| Realtime | `public.comments` added to `supabase_realtime` publication |
| Vercel deploy target | Team `pepe30kg's projects` (`team_O1LzWIK2xJjt6ICEj7hqmd8k`), project `carbook` |

⚠️ Sandbox note: this container's network policy blocks direct HTTPS to `*.supabase.co` — use MCP tools (`execute_sql` with `set local role anon` for RLS tests), not curl.

---

## 3. Architecture

```
Browser
  │
  ▼
Next.js 15 (App Router, RSC) ──────────── Vercel (hosting, edge network)
  │            │
  │ @supabase/ssr (server components / route handlers)
  ▼            ▼
Supabase ── Postgres + RLS  ← single source of truth
         ── Auth (email OTP + Google OAuth)
         ── Realtime (live comment feed on plate pages)
         ── Storage (car photos, bucket: `car-photos`)
```

Decisions locked in:

- **No custom backend server.** Route handlers + RSC talk to Supabase directly. RLS is the authorization layer — every table gets policies, no exceptions.
- **`@supabase/ssr`** for cookie-based auth in the App Router (not the deprecated auth-helpers).
- **Plate normalization happens in Postgres** (generated column), so `abc 123`, `ABC-123`, and `abc123` are the same plate everywhere.
- **Country code is part of plate identity** (`PL`, `DE`, `US-CA`, …). Default `PL` in the UI, changeable.

---

## 4. Data model

Apply as a single migration named `initial_schema` via `mcp__Supabase__apply_migration`.

```sql
-- Profiles: 1:1 with auth.users, created by trigger
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null check (char_length(username) between 3 and 24),
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Plates: created lazily the first time someone comments on them
create table public.plates (
  id uuid primary key default gen_random_uuid(),
  country_code text not null default 'PL',
  raw_plate text not null,
  normalized_plate text generated always as (
    upper(regexp_replace(raw_plate, '[^a-zA-Z0-9]', '', 'g'))
  ) stored,
  claimed_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (country_code, normalized_plate)
);

-- Comments: the heart of the app
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  plate_id uuid not null references public.plates(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  vibe text not null default 'neutral' check (vibe in ('praise','neutral','gripe','warning')),
  photo_url text,
  is_hidden boolean not null default false,  -- set by moderation, never by users
  created_at timestamptz not null default now()
);

-- Reactions: one per user per comment
create table public.reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  kind text not null check (kind in ('up','down','funny')),
  primary key (comment_id, user_id)
);

-- Reports: community moderation input
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.comments(id) on delete cascade,
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  reason text not null check (reason in ('harassment','doxxing','spam','other')),
  note text,
  created_at timestamptz not null default now(),
  unique (comment_id, reporter_id)
);

create index comments_plate_idx on public.comments (plate_id, created_at desc);
create index plates_lookup_idx on public.plates (country_code, normalized_plate);
```

### RLS policies (same migration)

- `profiles`: readable by everyone; users update only their own row.
- `plates`: readable by everyone; insert by any authenticated user; `claimed_by` updatable only via a `security definer` function that verifies plate-ownership evidence (v2 — leave unclaimed in v1).
- `comments`: `select` where `is_hidden = false` (or author is viewer); `insert` by authenticated users with `author_id = auth.uid()`; `delete` only by author; **no `update`** (edits create ambiguity in a reputational app — delete and repost instead).
- `reactions`, `reports`: insert/delete own rows only; reports readable only by service role.
- Auto-hide trigger: when a comment accumulates **3 distinct reports**, set `is_hidden = true` pending review.
- Rate limit: `security definer` function `can_comment(uid)` — max 10 comments per user per hour, checked in an insert trigger. Cheap, DB-enforced, no extra infra.

### Profile bootstrap trigger

```sql
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, username)
  values (new.id, 'driver_' || substr(new.id::text, 1, 8));
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
```

---

## 5. Safety & moderation (launch blocker)

1. **Content policy page** (`/rules`): comments describe cars and driving, never people. No names, workplaces, addresses, phone numbers, or photos with identifiable faces.
2. **Ingest filter**: on comment insert (route handler, before DB write), reject bodies matching phone/address/URL patterns and a slur list. Keep it simple — regex + blocklist, no LLM dependency in v1.
3. **Report flow**: one tap on any comment → reason picker → auto-hide at 3 distinct reports (trigger from §4).
4. **Vibe labels** (`praise/neutral/gripe/warning`) nudge structure onto comments and let the UI de-emphasize gripes visually rather than amplifying pile-ons.
5. **No search-by-person, ever.** Lookup is plate → comments only. No reverse direction, no "most-griped plates" leaderboard in v1 (pile-on machine).

---

## 6. Pages & routes

| Route | Purpose |
|---|---|
| `/` | Cinematic landing: full-bleed hero, plate-input as the single CTA |
| `/plate/[country]/[plate]` | The plate page — comment feed (realtime), composer, vibe filter |
| `/login` | Email OTP + Google OAuth (Supabase Auth UI is fine for v1) |
| `/me` | Own profile: username, avatar, your comments, delete account |
| `/rules` | Content policy |
| `/api/comments` (POST) | Comment creation with ingest filter from §5.2 |

The plate page is the product. Budget 60% of frontend effort there.

---

## 7. Design language — "cinematic and smooth"

- **Palette:** near-black asphalt base (`#0A0A0B`), warm white text, one accent — headlight amber (`#FFB800`). Plate chips rendered as skeuomorphic EU-style plates (white field, blue country band).
- **Type:** a wide grotesk for headings (e.g. Space Grotesk), system stack for body. Plate numbers in a tabular/mono cut, letter-spaced.
- **Motion (Framer Motion):**
  - Landing hero: plate input sits center-stage; on submit the plate chip *drives off* left as the route transitions.
  - Comment feed: staggered fade-up on load (`staggerChildren: 0.05`), spring physics on new realtime arrivals.
  - Page transitions via `AnimatePresence` — crossfade + 8px vertical drift, 250–350ms, `easeOut`. Nothing bounces except reactions.
  - Respect `prefers-reduced-motion` globally.
- **Texture:** subtle film grain overlay on the landing page only; soft radial vignette behind the hero. Keep the app pages clean — cinematic is the landing, smooth is the app.

---

## 8. Execution phases

Each phase ends with a commit. Push after every phase, not just at the end.

### Phase 0 — Provision (connectors, in this order)
1. `mcp__Supabase__get_cost` (type: project) → `mcp__Supabase__confirm_cost` → `mcp__Supabase__create_project` (name: `carbook`, org from §2).
2. Wait for project `ACTIVE_HEALTHY` (`mcp__Supabase__get_project`).
3. `mcp__Supabase__apply_migration` with §4 schema (single migration: `initial_schema`).
4. `mcp__Supabase__get_advisors` (security + performance) — fix every finding before writing app code.
5. `mcp__Supabase__get_project_url` + `mcp__Supabase__get_publishable_keys` → note for `.env.local` / Vercel env vars.
6. Create Storage bucket `car-photos` (public read, authenticated write, 5 MB limit) via `mcp__Supabase__execute_sql` on `storage.buckets`.

### Phase 1 — Scaffold
- `create-next-app` (TS, Tailwind, App Router, `src/` dir), add `@supabase/ssr @supabase/supabase-js framer-motion`.
- Supabase client utilities (browser + server), auth middleware, typed DB client via `mcp__Supabase__generate_typescript_types`.

### Phase 2 — Auth + plate lookup
- Login page, OTP + Google flows, profile bootstrap verified end-to-end.
- Plate input → normalize → find-or-create plate → route to plate page.

### Phase 3 — The plate page
- Comment feed (RSC initial load + Realtime subscription), composer with vibe picker, reactions, report flow. Ingest filter route handler.

### Phase 4 — Polish pass
- §7 motion system, landing hero, empty states ("This car has a clean record… so far"), loading skeletons, `prefers-reduced-motion`.

### Phase 5 — Deploy
1. `mcp__Vercel__deploy_to_vercel` (team from §2, project name `carbook`).
2. Set env vars: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` (publishable key only — service role key never ships to Vercel env accessible to the client).
3. Add the Vercel deployment URL to Supabase Auth redirect allowlist (`mcp__Supabase__execute_sql` won't do this — use the auth config; if no MCP tool covers it, flag to user as the one manual step).
4. `mcp__Vercel__get_deployment_build_logs` on failure; `mcp__Vercel__get_runtime_errors` after first traffic.
5. Re-run `mcp__Supabase__get_advisors` post-launch.

### Verification gate (every phase)
- `npm run build` passes clean.
- RLS smoke test after Phase 0: anonymous `select` on `comments` works, anonymous `insert` fails.
- After Phase 5: full loop in production — sign up, look up plate `TEST123`, comment, react, report — via the deployed URL, not localhost.

---

## 9. Known risks

| Risk | Mitigation |
|---|---|
| Harassment of identifiable owners | §5 in full; auto-hide; no person-search |
| Plate collisions across countries | Country code in unique key (§4) |
| Supabase free-tier pause on idle | Acceptable for v1; note in README |
| Realtime connection limits | One channel per open plate page; unsubscribe on unmount |
| Legal (GDPR — plates can be personal data in the EU) | Delete-account flow in v1 (`/me`), cascading deletes already in schema; comment deletion by author |
