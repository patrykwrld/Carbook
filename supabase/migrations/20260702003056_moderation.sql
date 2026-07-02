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

grant insert on public.flags to authenticated;

create policy flags_insert_authenticated on public.flags for insert to authenticated
with check (
  user_id = auth.uid()
  and exists (select 1 from public.comments c where c.id = flags.comment_id and c.hidden = false)
);
