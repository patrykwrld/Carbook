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
