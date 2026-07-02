-- Real accounts: profiles table + auto-provisioning trigger on signup.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null check (char_length(display_name) between 1 and 40),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy profiles_select_all on public.profiles for select using (true);
create policy profiles_update_own on public.profiles for update to authenticated
  using (auth.uid() = id) with check (auth.uid() = id);

revoke all on public.profiles from anon, authenticated;
grant select on public.profiles to anon, authenticated;
grant update (display_name) on public.profiles to authenticated;

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), split_part(new.email, '@', 1))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_user();

-- Only meant to be invoked by the trigger above; direct RPC access isn't
-- intended (same pattern as the plates/flags trigger functions).
revoke execute on function public.handle_new_user() from public, anon, authenticated;

-- Drop the anonymous-era rate-limit machinery: it existed only because
-- anon couldn't be trusted with a real identity. Real accounts replace
-- the client-supplied user_hash with auth.uid(), which the client cannot
-- spoof (it's derived from the verified JWT), so the check can now be a
-- plain (non-elevated) function.
drop policy comments_insert_rate_limited on public.comments;
drop policy flags_insert_public on public.flags;
drop function if exists public.check_comment_rate_limit(text, text);

-- comments: drop the anonymous identity columns, add a real user_id.
alter table public.comments drop column user_hash;
alter table public.comments drop column author_name;
alter table public.comments add column user_id uuid not null references public.profiles(id) default auth.uid();
create index comments_user_id_idx on public.comments (user_id);

-- flags: same swap, and the primary key moves from user_hash to user_id.
alter table public.flags drop constraint flags_pkey;
alter table public.flags drop column user_hash;
alter table public.flags add column user_id uuid not null references public.profiles(id) default auth.uid();
alter table public.flags add primary key (comment_id, user_id);

create function public.check_comment_rate_limit(p_plate text)
returns boolean
language sql
stable
set search_path = public
as $$
  select
    (select count(*) from public.comments c
       where c.user_id = auth.uid() and c.created_at > now() - interval '1 day') < 10
    and (select count(*) from public.comments c
       where c.user_id = auth.uid() and c.plate = p_plate and c.created_at > now() - interval '1 day') < 5
    and not exists (select 1 from public.comments c
       where c.user_id = auth.uid() and c.created_at > now() - interval '10 seconds');
$$;

grant execute on function public.check_comment_rate_limit(text) to authenticated;

-- Posting/flagging now requires a real account: no insert policy (and no
-- insert grant at all, see below) exists for anon on either table.
create policy comments_insert_authenticated on public.comments for insert to authenticated with check (
  user_id = auth.uid()
  and public.check_comment_rate_limit(plate)
);

create policy flags_insert_authenticated on public.flags for insert to authenticated with check (
  user_id = auth.uid()
  and exists (select 1 from public.comments c where c.id = comment_id and c.hidden = false)
);

-- Column grants: user_id is now public (it's a real, intentional identity
-- feature, not something to hide) so anon can read it too for the
-- profiles embed; only authenticated can insert, and only into the
-- columns a poster actually supplies (user_id always takes its
-- auth.uid() default; flag_count/hidden always take their defaults).
revoke all on public.comments from anon, authenticated;
grant select (id, plate, body, tag, image_path, flag_count, hidden, created_at, user_id)
  on public.comments to anon, authenticated;
grant insert (plate, body, tag, image_path) on public.comments to authenticated;

revoke all on public.flags from anon, authenticated;
grant insert (comment_id) on public.flags to authenticated;

-- Posting requires an account now, so uploading a comment image should
-- too — otherwise anon could spam-upload to storage independently of the
-- comments table's own auth requirement.
drop policy comment_images_public_upload on storage.objects;
create policy comment_images_authenticated_upload on storage.objects for insert to authenticated with check (bucket_id = 'comment-images');
