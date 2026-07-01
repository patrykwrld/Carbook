-- Carbook on Supabase: plates + comments, with abuse control and moderation
-- enforced entirely in Postgres (RLS + triggers) since there's no custom
-- backend anymore. The frontend talks directly to Supabase's REST API.

create table public.plates (
  plate text primary key check (plate ~ '^[A-Z0-9]{2,10}$'),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  comment_count int not null default 0
);

create table public.comments (
  id bigint generated always as identity primary key,
  plate text not null references public.plates(plate) check (plate ~ '^[A-Z0-9]{2,10}$'),
  author_name text check (author_name is null or char_length(author_name) <= 40),
  body text not null check (char_length(body) between 3 and 1000),
  tag text check (tag is null or tag in ('SAFE_DRIVING', 'AGGRESSIVE_DRIVING', 'LET_MERGE', 'PHONE_USE', 'OTHER')),
  image_path text,
  user_hash text not null,
  flag_count int not null default 0,
  hidden boolean not null default false,
  created_at timestamptz not null default now()
);

create index comments_plate_created_idx on public.comments (plate, created_at desc);
create index comments_created_idx on public.comments (created_at);
create index comments_user_hash_idx on public.comments (user_hash);
create index plates_last_seen_idx on public.plates (last_seen_at desc);

create table public.flags (
  comment_id bigint not null references public.comments(id),
  user_hash text not null,
  created_at timestamptz not null default now(),
  primary key (comment_id, user_hash)
);

-- Ensures the referenced plate row exists before the comment's FK check
-- runs (comments.plate -> plates.plate).
create function public.upsert_plate_before_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.plates (plate, first_seen_at, last_seen_at, comment_count)
  values (new.plate, now(), now(), 0)
  on conflict (plate) do nothing;
  return new;
end;
$$;

create trigger before_comment_insert_upsert_plate
before insert on public.comments
for each row execute function public.upsert_plate_before_comment();

create function public.bump_plate_stats_after_comment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.plates
  set comment_count = comment_count + 1, last_seen_at = new.created_at
  where plate = new.plate;
  return new;
end;
$$;

create trigger after_comment_insert_bump_plate
after insert on public.comments
for each row execute function public.bump_plate_stats_after_comment();

-- Auto-hide once enough distinct people report a comment. The flags PK
-- (comment_id, user_hash) makes re-flagging by the same person a no-op
-- (unique violation), so this count is always distinct reporters.
create function public.handle_new_flag()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  update public.comments
  set flag_count = flag_count + 1
  where id = new.comment_id
  returning flag_count into v_count;

  if v_count >= 3 then
    update public.comments set hidden = true where id = new.comment_id;
  end if;

  return new;
end;
$$;

create trigger after_flag_insert
after insert on public.flags
for each row execute function public.handle_new_flag();

-- Rate-limit / anti-targeting check used by the comments INSERT policy.
-- This has to be SECURITY DEFINER: it reads comments.user_hash, which
-- anon is deliberately never granted SELECT on (see the column grants
-- below), so the check can't be an inline subquery in the policy itself.
create function public.check_comment_rate_limit(p_user_hash text, p_plate text)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select
    (select count(*) from public.comments c
       where c.user_hash = p_user_hash and c.created_at > now() - interval '1 day') < 10
    and (select count(*) from public.comments c
       where c.user_hash = p_user_hash and c.plate = p_plate and c.created_at > now() - interval '1 day') < 5
    and not exists (select 1 from public.comments c
       where c.user_hash = p_user_hash and c.created_at > now() - interval '10 seconds');
$$;

grant execute on function public.check_comment_rate_limit(text, text) to anon, authenticated;

-- These trigger functions only exist to be called by triggers (which run
-- as the function owner regardless of role grants); direct execution via
-- PostgREST's /rpc/<function> endpoint is not intended.
revoke execute on function public.upsert_plate_before_comment() from public, anon, authenticated;
revoke execute on function public.bump_plate_stats_after_comment() from public, anon, authenticated;
revoke execute on function public.handle_new_flag() from public, anon, authenticated;

alter table public.plates enable row level security;
alter table public.comments enable row level security;
alter table public.flags enable row level security;

create policy plates_select_all on public.plates for select using (true);

create policy comments_select_visible on public.comments for select using (hidden = false);

create policy comments_insert_rate_limited on public.comments for insert with check (
  public.check_comment_rate_limit(user_hash, plate)
);

-- Only allow flagging comments that exist and aren't already hidden.
create policy flags_insert_public on public.flags for insert with check (
  exists (select 1 from public.comments c where c.id = comment_id and c.hidden = false)
);

-- Column-level grants: anon/authenticated can read public comment fields
-- but never user_hash (no identity linking), and can only insert the
-- columns a commenter actually supplies — flag_count/hidden always take
-- their column defaults, so a client can never set them directly.
revoke all on public.plates from anon, authenticated;
grant select on public.plates to anon, authenticated;

revoke all on public.comments from anon, authenticated;
grant select (id, plate, author_name, body, tag, image_path, flag_count, hidden, created_at)
  on public.comments to anon, authenticated;
grant insert (plate, author_name, body, tag, image_path, user_hash)
  on public.comments to anon, authenticated;

revoke all on public.flags from anon, authenticated;
grant insert (comment_id, user_hash) on public.flags to anon, authenticated;

-- Storage bucket for comment photos. Size/type limits are enforced by
-- Supabase Storage itself at the bucket level. Public buckets serve
-- objects via a direct public URL that bypasses RLS entirely, so no
-- SELECT policy on storage.objects is needed (or wanted — it would only
-- expose bucket listing via the authenticated storage API).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('comment-images', 'comment-images', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update set
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy comment_images_public_upload on storage.objects for insert with check (bucket_id = 'comment-images');
