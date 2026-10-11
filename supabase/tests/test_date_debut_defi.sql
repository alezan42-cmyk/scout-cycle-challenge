-- Tests de 20261011180000_date_debut_defi.sql (après fixture + toutes les migrations)
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(_uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(_uid, ''), false); end; $$;

do $$ begin
  if exists (select 1 from public.activities where ride_date < '2026-09-27') then raise exception 'anciennes sorties restantes'; end if;
  raise notice 'OK sorties d''avant le 27/09 supprimées';
end $$;

-- Scout : sortie du 26/09 refusée, du 27/09 acceptée
set role authenticated; select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  insert into public.activities (user_id, km, ride_date, strava_link) values ('22222222-2222-2222-2222-222222222222', 5, '2026-09-26', 'https://strava.com/a/201');
  raise exception 'sortie du 26/09 acceptée';
exception when check_violation then raise notice 'OK sortie du 26/09 refusée';
end $$;
insert into public.activities (user_id, km, ride_date, strava_link) values ('22222222-2222-2222-2222-222222222222', 5, '2026-09-27', 'https://strava.com/a/202');
do $$ begin
  insert into public.group_rides (ride_date, sport) values ('2026-09-20', 'velo');
  raise exception 'groupe avant le début accepté';
exception when check_violation then raise notice 'OK sortie à plusieurs avant le début refusée';
end $$;
reset role;

-- Admin : ne peut pas antidater non plus
set role authenticated; select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ begin
  update public.activities set ride_date = '2026-09-01' where ride_date = '2026-09-27';
  raise exception 'admin antidate une sortie';
exception when check_violation then raise notice 'OK admin : antidater refusé';
end $$;
reset role;

select 'TOUS LES TESTS DATE DE DÉBUT SONT PASSÉS' as resultat;
