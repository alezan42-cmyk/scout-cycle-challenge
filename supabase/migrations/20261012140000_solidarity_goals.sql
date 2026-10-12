create table if not exists public.solidarity_goals (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(btrim(title)) between 1 and 80),
  subtitle text check (subtitle is null or char_length(subtitle) <= 100),
  description text not null default '' check (char_length(description) <= 500),
  goal_km numeric(9, 1) not null check (goal_km > 0),
  icon text not null default 'target' check (icon in ('bike', 'walk', 'target')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

alter table public.solidarity_goals enable row level security;

grant select on public.solidarity_goals to anon, authenticated;
grant insert, update, delete on public.solidarity_goals to authenticated;
grant all on public.solidarity_goals to service_role;

drop policy if exists solidarity_goals_public_read on public.solidarity_goals;
create policy solidarity_goals_public_read
  on public.solidarity_goals for select to anon, authenticated
  using (true);

drop policy if exists solidarity_goals_admin_insert on public.solidarity_goals;
create policy solidarity_goals_admin_insert
  on public.solidarity_goals for insert to authenticated
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists solidarity_goals_admin_update on public.solidarity_goals;
create policy solidarity_goals_admin_update
  on public.solidarity_goals for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

drop policy if exists solidarity_goals_admin_delete on public.solidarity_goals;
create policy solidarity_goals_admin_delete
  on public.solidarity_goals for delete to authenticated
  using (public.has_role(auth.uid(), 'admin'));

insert into public.solidarity_goals (id, title, subtitle, description, goal_km, icon, sort_order)
values
  ('b54d24b8-6b87-4e7c-8f90-24e6cb37f001', 'Défi des 24h', 'Objectif de dons & kilomètres', 'Cumulons un maximum de kilomètres lors des 24h pour déclencher un don exceptionnel au profit de l''ASBL Profitivisme !', 1000, 'target', 0),
  ('b54d24b8-6b87-4e7c-8f90-24e6cb37f002', 'Marche Parrainée', 'Effort collectif & parrainage', 'Chaque entraînement et chaque kilomètre validé sur la plateforme renforce l''impact de notre marche parrainée.', 500, 'walk', 1)
on conflict (id) do nothing;
