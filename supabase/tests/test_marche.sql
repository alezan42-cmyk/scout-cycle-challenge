-- Tests de 20261011160000_sport_marche.sql (après fixture + toutes les migrations)
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(_uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(_uid, ''), false); end; $$;

-- Scout 1 crée une marche à plusieurs avec Scout 2
set role authenticated; select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
insert into public.group_rides (id, ride_date, sport) values ('99999999-0000-0000-0000-0000000000a1', '2026-10-12', 'marche');
insert into public.group_ride_members (group_id, user_id) values
  ('99999999-0000-0000-0000-0000000000a1', '22222222-2222-2222-2222-222222222222'),
  ('99999999-0000-0000-0000-0000000000a1', '33333333-3333-3333-3333-333333333333');
-- Marche rattachée -> acceptée
insert into public.activities (id, user_id, km, ride_date, strava_link, note, group_ride_id)
  values ('bbbbbbbb-0000-0000-0000-0000000000a1', '22222222-2222-2222-2222-222222222222', 8, '2026-10-12', 'https://strava.com/a/101', '[marche] Balade texte privé', '99999999-0000-0000-0000-0000000000a1');
-- Vélo dans un groupe marche -> ignoré
insert into public.activities (id, user_id, km, ride_date, strava_link, group_ride_id)
  values ('bbbbbbbb-0000-0000-0000-0000000000a2', '22222222-2222-2222-2222-222222222222', 20, '2026-10-12', 'https://strava.com/a/102', '99999999-0000-0000-0000-0000000000a1');
do $$ begin
  if (select group_ride_id from public.activities where id = 'bbbbbbbb-0000-0000-0000-0000000000a1') is null then raise exception 'marche non rattachée'; end if;
  if (select group_ride_id from public.activities where id = 'bbbbbbbb-0000-0000-0000-0000000000a2') is not null then raise exception 'vélo rattaché à une marche'; end if;
  raise notice 'OK marche à plusieurs : rattachement selon le sport';
end $$;
-- Sport inconnu refusé
do $$ begin
  insert into public.group_rides (ride_date, sport) values ('2026-10-12', 'natation');
  raise exception 'sport inconnu accepté';
exception when check_violation then raise notice 'OK sport inconnu refusé';
end $$;
reset role;

-- Visiteur : voit l'étiquette [marche], jamais le texte libre
set role anon; select pg_temp.as_user(null);
do $$ begin
  if (select note from public.activities_public where id = 'bbbbbbbb-0000-0000-0000-0000000000a1') is distinct from '[marche]' then raise exception 'étiquette marche absente'; end if;
  if (select note from public.activities_public where id = 'bbbbbbbb-0000-0000-0000-0000000000a2') is not null then raise exception 'vélo étiqueté'; end if;
  if exists (select 1 from public.activities_public where note ilike '%privé%') then raise exception 'texte libre visible'; end if;
  raise notice 'OK vue publique : étiquette marche seule';
end $$;
reset role;

select 'TOUS LES TESTS MARCHE SONT PASSÉS' as resultat;
