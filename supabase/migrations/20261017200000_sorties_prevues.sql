-- =====================================================================
-- « Sorties prévues » : les membres proposent une sortie (date, heure,
-- lieu de rendez-vous, sport, distance, niveau…) et chacun répond
-- « Je viens », « Peut-être » ou « Je ne peux pas ».
-- Réservé aux membres connectés (les scouts sont mineurs : un lieu et une
-- heure de rendez-vous ne doivent pas être publics).
-- =====================================================================

create table if not exists public.planned_rides (
  id uuid primary key default gen_random_uuid(),
  created_by uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 80),
  sport text not null default 'velo' check (sport in ('velo', 'course', 'marche')),
  ride_date date not null,
  start_time time not null,
  meeting_point text not null check (char_length(btrim(meeting_point)) between 2 and 160),
  meeting_url text check (meeting_url is null or meeting_url ~* '^https://'),
  distance_km numeric(6,1) check (distance_km is null or distance_km between 0.5 and 400),
  elevation_m integer check (elevation_m is null or elevation_m between 0 and 8000),
  level text not null default 'tous' check (level in ('tous', 'tranquille', 'sportif')),
  notes text check (notes is null or char_length(notes) <= 600),
  max_participants integer check (max_participants is null or max_participants between 2 and 100),
  cancelled boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists planned_rides_date_idx on public.planned_rides (ride_date);
create index if not exists planned_rides_created_by_idx on public.planned_rides (created_by);

create table if not exists public.planned_ride_responses (
  ride_id uuid not null references public.planned_rides(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null check (status in ('yes', 'maybe', 'no')),
  updated_at timestamptz not null default now(),
  primary key (ride_id, user_id)
);

create index if not exists planned_ride_responses_user_idx on public.planned_ride_responses (user_id);

-- Garde-fous : pas de sortie dans le passé à la création, créateur = soi,
-- l'auteur ne peut pas être changé.
create or replace function public.planned_ride_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if tg_op = 'INSERT' then
    if new.ride_date < (now() at time zone 'Europe/Brussels')::date then
      raise exception 'La date de la sortie est déjà passée';
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if new.ride_date <> old.ride_date
       and new.ride_date < (now() at time zone 'Europe/Brussels')::date then
      raise exception 'La date de la sortie est déjà passée';
    end if;
  end if;
  new.title := btrim(new.title);
  new.meeting_point := btrim(new.meeting_point);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_planned_ride_guard on public.planned_rides;
create trigger trg_planned_ride_guard
  before insert or update on public.planned_rides
  for each row execute function public.planned_ride_guard();

-- Réponses : uniquement sur une sortie à venir, non annulée, et dans la limite des places.
create or replace function public.planned_ride_response_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r public.planned_rides;
  taken integer;
begin
  select * into r from public.planned_rides where id = new.ride_id;
  if not found then
    raise exception 'Sortie introuvable';
  end if;
  if r.cancelled then
    raise exception 'Cette sortie a été annulée';
  end if;
  if r.ride_date < (now() at time zone 'Europe/Brussels')::date then
    raise exception 'Cette sortie est déjà passée';
  end if;
  if new.status = 'yes' and r.max_participants is not null then
    select count(*) into taken from public.planned_ride_responses
      where ride_id = new.ride_id and status = 'yes' and user_id <> new.user_id;
    if taken >= r.max_participants then
      raise exception 'La sortie est complète';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_planned_ride_response_guard on public.planned_ride_responses;
create trigger trg_planned_ride_response_guard
  before insert or update on public.planned_ride_responses
  for each row execute function public.planned_ride_response_guard();

-- ---------- Droits ----------
alter table public.planned_rides enable row level security;
alter table public.planned_ride_responses enable row level security;

revoke all on public.planned_rides from anon;
revoke all on public.planned_ride_responses from anon;
grant select, insert, update, delete on public.planned_rides to authenticated;
grant select, insert, update, delete on public.planned_ride_responses to authenticated;

drop policy if exists "sorties prevues lecture membres" on public.planned_rides;
create policy "sorties prevues lecture membres" on public.planned_rides
  for select to authenticated using (true);

drop policy if exists "sorties prevues creation soi" on public.planned_rides;
create policy "sorties prevues creation soi" on public.planned_rides
  for insert to authenticated with check (created_by = (select auth.uid()));

drop policy if exists "sorties prevues modif auteur ou admin" on public.planned_rides;
create policy "sorties prevues modif auteur ou admin" on public.planned_rides
  for update to authenticated
  using (created_by = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'))
  with check (created_by = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

drop policy if exists "sorties prevues suppression auteur ou admin" on public.planned_rides;
create policy "sorties prevues suppression auteur ou admin" on public.planned_rides
  for delete to authenticated
  using (created_by = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

drop policy if exists "reponses lecture membres" on public.planned_ride_responses;
create policy "reponses lecture membres" on public.planned_ride_responses
  for select to authenticated using (true);

drop policy if exists "reponses ajout soi" on public.planned_ride_responses;
create policy "reponses ajout soi" on public.planned_ride_responses
  for insert to authenticated with check (user_id = (select auth.uid()));

drop policy if exists "reponses modif soi" on public.planned_ride_responses;
create policy "reponses modif soi" on public.planned_ride_responses
  for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop policy if exists "reponses suppression soi ou admin" on public.planned_ride_responses;
create policy "reponses suppression soi ou admin" on public.planned_ride_responses
  for delete to authenticated
  using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));

-- Le créateur participe d'office
create or replace function public.planned_ride_creator_joins()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.planned_ride_responses (ride_id, user_id, status)
  values (new.id, new.created_by, 'yes')
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_planned_ride_creator_joins on public.planned_rides;
create trigger trg_planned_ride_creator_joins
  after insert on public.planned_rides
  for each row execute function public.planned_ride_creator_joins();

revoke execute on function public.planned_ride_guard() from public, anon, authenticated;
revoke execute on function public.planned_ride_response_guard() from public, anon, authenticated;
revoke execute on function public.planned_ride_creator_joins() from public, anon, authenticated;
