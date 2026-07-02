grant select on public.profiles to anon, authenticated;
grant select on public.plates to anon, authenticated;
grant select on public.comments to anon, authenticated;

create policy profiles_select_all on public.profiles for select to public using (true);
create policy plates_select_all on public.plates for select to public using (true);
create policy comments_select_visible on public.comments for select to public using (hidden = false);
