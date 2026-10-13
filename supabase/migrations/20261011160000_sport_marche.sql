-- =====================================================================
-- Troisième sport : la marche
--
-- Comme pour la course, le sport d'une sortie est une étiquette au début
-- de la note : « [marche] » (sans étiquette = vélo, « [course] » = course).
--  * sorties à plusieurs : sport 'marche' autorisé ;
--  * rattachement à un groupe : le sport « marche » est reconnu ;
--  * vue publique : l'étiquette « [marche] » est visible (le texte libre
--    de la note reste privé).
-- Remplace une contrainte et deux définitions (aucune donnée supprimée).
-- =====================================================================

alter table public.group_rides drop constraint if exists group_rides_sport_check;
alter table public.group_rides
  add constraint group_rides_sport_check check (sport in ('velo', 'course', 'marche'));

create or replace function public.check_activity_group()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  g record;
  act_sport text;
begin
  if new.group_ride_id is null then
    return new;
  end if;
  act_sport := 'velo';
  if lower(coalesce(new.note, '')) like '[course]%' then
    act_sport := 'course';
  elsif lower(coalesce(new.note, '')) like '[marche]%' then
    act_sport := 'marche';
  end if;
  select * into g from public.group_rides where id = new.group_ride_id;
  if g is null
     or g.ride_date <> new.ride_date
     or not exists (select 1 from public.group_ride_members m
                    where m.group_id = new.group_ride_id and m.user_id = new.user_id)
     or g.sport <> act_sport
     or exists (select 1 from public.activities a
                where a.group_ride_id = new.group_ride_id and a.user_id = new.user_id
                  and a.id <> new.id)
  then
    new.group_ride_id := null;
  end if;
  return new;
end; $$;

revoke execute on function public.check_activity_group() from public, anon, authenticated;

create or replace view public.activities_public as
  select id, user_id, km, elevation_m, ride_date, created_at, status,
         case when lower(coalesce(note, '')) like '[course]%'
                or lower(coalesce(note, '')) like '%#course%'
                or lower(coalesce(note, '')) like '%#run%'
              then '[course]'
              when lower(coalesce(note, '')) like '[marche]%'
                or lower(coalesce(note, '')) like '%#marche%'
              then '[marche]' end as note,
         group_ride_id
  from public.activities;

revoke all on public.activities_public from anon, authenticated;
grant select on public.activities_public to anon, authenticated;
