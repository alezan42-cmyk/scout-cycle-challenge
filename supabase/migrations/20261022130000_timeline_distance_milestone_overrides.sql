-- Permet au staff de personnaliser ou masquer les paliers de distance
-- générés à partir des sorties validées, sans effacer l'historique des sorties.
create table if not exists public.timeline_distance_milestone_overrides (
  milestone_km integer primary key check (milestone_km > 0 and milestone_km % 1000 = 0),
  title text,
  description text,
  date_str date,
  is_hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  check (title is null or char_length(title) between 1 and 160),
  check (description is null or char_length(description) <= 2000)
);

alter table public.timeline_distance_milestone_overrides enable row level security;
revoke all on public.timeline_distance_milestone_overrides from anon, authenticated;
grant select on public.timeline_distance_milestone_overrides to anon, authenticated;
grant insert, update, delete on public.timeline_distance_milestone_overrides to authenticated;
grant all on public.timeline_distance_milestone_overrides to service_role;

drop policy if exists "paliers timeline lecture publique" on public.timeline_distance_milestone_overrides;
create policy "paliers timeline lecture publique"
  on public.timeline_distance_milestone_overrides for select to anon, authenticated
  using (true);

drop policy if exists "paliers timeline gestion admin" on public.timeline_distance_milestone_overrides;
create policy "paliers timeline gestion admin"
  on public.timeline_distance_milestone_overrides for all to authenticated
  using (
    public.has_role(auth.uid(), 'admin')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'baudeletgauthier@gmail.com'
  )
  with check (
    public.has_role(auth.uid(), 'admin')
    or exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_admin)
    or lower(coalesce(auth.jwt() ->> 'email', '')) = 'baudeletgauthier@gmail.com'
  );
