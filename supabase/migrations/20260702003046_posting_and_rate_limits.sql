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

grant insert on public.comments to authenticated;

create policy comments_insert_authenticated on public.comments for insert to authenticated
with check (user_id = auth.uid() and check_comment_rate_limit(plate));
