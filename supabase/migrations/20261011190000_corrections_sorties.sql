-- =====================================================================
-- Corrections des sorties par les admins
--
--  * Journal `activity_corrections` : chaque modification ou suppression
--    d'une sortie par un admin (sur la sortie d'un autre membre) est notée
--    automatiquement : qui, quand, anciennes et nouvelles valeurs.
--    Un refus (sortie en attente refusée) est noté aussi.
--  * Le scout concerné voit ses corrections (message sur « Mes km ») et les
--    marque comme lues avec `mark_corrections_seen()`. Les admins voient tout.
--  * Verrou : une fois une sortie validée, seul un admin peut changer ses
--    km, D+, date, sport et lien Strava (le scout peut encore la supprimer).
-- Migration sans suppression de données, rejouable.
-- =====================================================================

create table if not exists public.activity_corrections (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid,                       -- pas de clé étrangère : la sortie peut avoir été supprimée
  user_id uuid not null references auth.users(id) on delete cascade, -- scout propriétaire
  admin_id uuid references auth.users(id) on delete set null,
  action text not null check (action in ('modification', 'suppression', 'refus')),
  ride_date date,                         -- date de la sortie (avant correction)
  km numeric,                             -- km avant correction
  changes jsonb not null default '{}'::jsonb, -- { champ: { "avant": …, "apres": … } }
  created_at timestamptz not null default now(),
  seen_at timestamptz
);

create index if not exists activity_corrections_user_idx
  on public.activity_corrections (user_id, created_at desc);

alter table public.activity_corrections enable row level security;
grant select on public.activity_corrections to authenticated;

drop policy if exists "corrections lecture soi ou admin" on public.activity_corrections;
create policy "corrections lecture soi ou admin" on public.activity_corrections
  for select to authenticated
  using (user_id = auth.uid() or public.has_role(auth.uid(), 'admin'));

-- Sport d'une sortie d'après l'étiquette de la note
create or replace function public.activity_sport(_note text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(_note, '')) like '[course]%' then 'course'
    when lower(coalesce(_note, '')) like '[marche]%' then 'marche'
    else 'velo' end;
$$;

-- Journal des modifications faites par un admin
create or replace function public.log_activity_correction()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  actor uuid := auth.uid();
  ch jsonb := '{}'::jsonb;
begin
  if actor is null or not public.has_role(actor, 'admin') then
    return null;
  end if;

  if tg_op = 'DELETE' then
    if old.user_id = actor then return null; end if;
    insert into public.activity_corrections (activity_id, user_id, admin_id, action, ride_date, km, changes)
    values (old.id, old.user_id, actor,
            -- appelé depuis le trigger de refus (statut « rejected » → suppression)
            case when pg_trigger_depth() > 1 then 'refus' else 'suppression' end,
            old.ride_date, old.km,
            jsonb_build_object('sport', public.activity_sport(old.note)));
    return null;
  end if;

  if new.user_id = actor then return null; end if;
  if new.km is distinct from old.km then
    ch := ch || jsonb_build_object('km', jsonb_build_object('avant', old.km, 'apres', new.km));
  end if;
  if new.elevation_m is distinct from old.elevation_m then
    ch := ch || jsonb_build_object('elevation_m', jsonb_build_object('avant', old.elevation_m, 'apres', new.elevation_m));
  end if;
  if new.ride_date is distinct from old.ride_date then
    ch := ch || jsonb_build_object('ride_date', jsonb_build_object('avant', old.ride_date, 'apres', new.ride_date));
  end if;
  if public.activity_sport(new.note) <> public.activity_sport(old.note) then
    ch := ch || jsonb_build_object('sport', jsonb_build_object('avant', public.activity_sport(old.note), 'apres', public.activity_sport(new.note)));
  end if;
  -- Remise en attente d'une sortie validée (la validation normale n'est pas une correction)
  if old.status = 'approved' and new.status = 'pending' then
    ch := ch || jsonb_build_object('status', jsonb_build_object('avant', 'approved', 'apres', 'pending'));
  end if;
  if ch <> '{}'::jsonb then
    insert into public.activity_corrections (activity_id, user_id, admin_id, action, ride_date, km, changes)
    values (new.id, new.user_id, actor, 'modification', old.ride_date, old.km, ch);
  end if;
  return null;
end; $$;

revoke execute on function public.log_activity_correction() from public, anon, authenticated;

drop trigger if exists trg_log_activity_correction on public.activities;
create trigger trg_log_activity_correction
  after update or delete on public.activities
  for each row execute function public.log_activity_correction();

-- Verrou après validation : un non-admin ne change plus les données qui comptent
-- (nom choisi pour passer avant trg_check_activity_group, ordre alphabétique)
create or replace function public.lock_validated_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'approved'
     and not (auth.uid() is not null and public.has_role(auth.uid(), 'admin')) then
    new.km := old.km;
    new.elevation_m := old.elevation_m;
    new.ride_date := old.ride_date;
    new.strava_link := old.strava_link;
    if public.activity_sport(new.note) <> public.activity_sport(old.note) then
      new.note := old.note;
    end if;
  end if;
  return new;
end; $$;

revoke execute on function public.lock_validated_activity() from public, anon, authenticated;

drop trigger if exists trg_activity_lock_validated on public.activities;
create trigger trg_activity_lock_validated
  before update on public.activities
  for each row execute function public.lock_validated_activity();

-- Le scout marque ses messages de correction comme lus
create or replace function public.mark_corrections_seen()
returns integer language plpgsql security definer set search_path = public as $$
declare n integer;
begin
  update public.activity_corrections set seen_at = now()
   where user_id = auth.uid() and seen_at is null;
  get diagnostics n = row_count;
  return n;
end; $$;

revoke execute on function public.mark_corrections_seen() from public, anon;
grant execute on function public.mark_corrections_seen() to authenticated;
