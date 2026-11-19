create table if not exists public.distance_awards (
  id uuid primary key default gen_random_uuid(),
  sport text not null check (sport in ('velo', 'course', 'marche')),
  kind text not null check (kind in ('single_ride', 'cumulative')),
  threshold_km numeric(8,2) not null check (threshold_km > 0),
  created_at timestamptz not null default now(),
  unique (sport, kind, threshold_km)
);

alter table public.distance_awards enable row level security;
revoke all on table public.distance_awards from anon, authenticated;
grant select on table public.distance_awards to anon, authenticated;
grant insert, update, delete on table public.distance_awards to authenticated;

create policy "Everyone can read distance awards"
  on public.distance_awards for select to anon, authenticated using (true);
create policy "Admins create distance awards"
  on public.distance_awards for insert to authenticated
  with check (public.has_role((select auth.uid()), 'admin'));
create policy "Admins update distance awards"
  on public.distance_awards for update to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));
create policy "Admins delete distance awards"
  on public.distance_awards for delete to authenticated
  using (public.has_role((select auth.uid()), 'admin'));

insert into public.distance_awards (sport, kind, threshold_km) values
  ('velo', 'single_ride', 1), ('velo', 'single_ride', 5), ('velo', 'single_ride', 10), ('velo', 'single_ride', 25), ('velo', 'single_ride', 50), ('velo', 'single_ride', 100),
  ('course', 'single_ride', 1), ('course', 'single_ride', 5), ('course', 'single_ride', 10), ('course', 'single_ride', 21), ('course', 'single_ride', 42),
  ('marche', 'single_ride', 1), ('marche', 'single_ride', 5), ('marche', 'single_ride', 10), ('marche', 'single_ride', 20), ('marche', 'single_ride', 40),
  ('velo', 'cumulative', 25), ('velo', 'cumulative', 50), ('velo', 'cumulative', 100), ('velo', 'cumulative', 250), ('velo', 'cumulative', 500), ('velo', 'cumulative', 1000),
  ('course', 'cumulative', 10), ('course', 'cumulative', 25), ('course', 'cumulative', 50), ('course', 'cumulative', 100), ('course', 'cumulative', 200),
  ('marche', 'cumulative', 10), ('marche', 'cumulative', 25), ('marche', 'cumulative', 50), ('marche', 'cumulative', 100), ('marche', 'cumulative', 200)
on conflict (sport, kind, threshold_km) do nothing;
