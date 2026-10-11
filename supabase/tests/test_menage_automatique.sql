-- Tests de 20261009210000_menage_automatique.sql (après fixture + toutes les migrations)
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(_uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(_uid, ''), false); end; $$;

-- Données (en superutilisateur)
-- (dates des sorties >= 27/09/2026, début du défi ; l'ancienneté se juge sur created_at)
delete from public.user_roles where user_id = '33333333-3333-3333-3333-333333333333' and role = 'admin';
insert into public.activities (id, user_id, km, ride_date, status, proof_path, created_at) values
  ('cccccccc-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 10, greatest(current_date - 70, date '2026-09-27'), 'pending', 'https://x/storage/v1/object/public/proofs/vieille.jpg', now() - interval '70 days'),
  ('cccccccc-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 11, greatest(current_date - 40, date '2026-09-27'), 'pending', 'https://x/storage/v1/object/public/proofs/recente.jpg', now() - interval '40 days');
insert into public.group_rides (id, created_by, ride_date, sport, created_at) values
  ('dddddddd-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', greatest(current_date - 40, date '2026-09-27'), 'velo', now() - interval '40 days'),
  ('dddddddd-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', greatest(current_date - 5, date '2026-09-27'), 'velo', now() - interval '5 days'),
  ('dddddddd-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', greatest(current_date - 40, date '2026-09-27'), 'velo', now() - interval '40 days');
insert into public.group_ride_members (group_id, user_id) values ('dddddddd-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222');
insert into public.activities (id, user_id, km, ride_date, status, strava_link, group_ride_id, created_at) values
  ('cccccccc-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 20, greatest(current_date - 40, date '2026-09-27'), 'approved', 'https://strava.com/a/1', 'dddddddd-0000-0000-0000-000000000003', now() - interval '40 days');
insert into public.countdowns (title, target_date, is_active) values
  ('Passé', now() - interval '3 days', true), ('À venir', now() + interval '3 days', true);

-- validated_at : posé à la validation par un admin
set role authenticated; select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update public.activities set status = 'approved' where id = 'cccccccc-0000-0000-0000-000000000002';
do $$ begin
  if (select validated_at from public.activities where id = 'cccccccc-0000-0000-0000-000000000002') is null then
    raise exception 'validated_at non posé à la validation';
  end if;
  update public.activities set status = 'pending' where id = 'cccccccc-0000-0000-0000-000000000002';
  if (select validated_at from public.activities where id = 'cccccccc-0000-0000-0000-000000000002') is not null then
    raise exception 'validated_at gardé après retour en attente';
  end if;
  raise notice 'OK validated_at suit la validation';
end $$;

-- Un scout ou un admin ne peut pas lancer la fonction directement (réservée à la fonction Edge)
do $$ begin
  begin
    perform public.cleanup_database();
    raise exception 'cleanup_database appelable par un membre';
  exception when insufficient_privilege then null; end;
  raise notice 'OK cleanup_database réservée au service';
end $$;
reset role;

-- Exécution (rôle service)
set role service_role;
do $$ declare r jsonb; begin
  r := public.cleanup_database(true);
  if (r->>'sorties_en_attente_supprimees')::int <> 1 or (r->>'groupes_vides_supprimes')::int <> 1 then raise exception 'aperçu : %', r; end if;
  if not exists (select 1 from public.activities where id = 'cccccccc-0000-0000-0000-000000000001') then raise exception 'l''aperçu a supprimé'; end if;
  if public.cleanup_check_secret('mauvaise') then raise exception 'clé fausse acceptée'; end if;
  raise notice 'OK aperçu sans suppression, clé vérifiée';
end $$;
do $$ declare r jsonb; begin
  r := public.cleanup_database();
  if (r->>'sorties_en_attente_supprimees')::int <> 1 then raise exception 'attente : %', r; end if;
  if (r->>'groupes_vides_supprimes')::int <> 1 then raise exception 'groupes : %', r; end if;
  if (r->>'comptes_a_rebours_desactives')::int <> 1 then raise exception 'comptes à rebours : %', r; end if;
  if not (r->'fichiers_a_effacer') ? 'https://x/storage/v1/object/public/proofs/vieille.jpg' then raise exception 'fichiers : %', r; end if;
  raise notice 'OK ménage : %', r;
end $$;
reset role;
do $$ begin
  if exists (select 1 from public.activities where id = 'cccccccc-0000-0000-0000-000000000001') then raise exception 'vieille attente gardée'; end if;
  if not exists (select 1 from public.activities where id = 'cccccccc-0000-0000-0000-000000000002') then raise exception 'attente récente supprimée'; end if;
  if not exists (select 1 from public.group_rides where id = 'dddddddd-0000-0000-0000-000000000002') then raise exception 'groupe récent supprimé'; end if;
  if not exists (select 1 from public.group_rides where id = 'dddddddd-0000-0000-0000-000000000003') then raise exception 'groupe utilisé supprimé'; end if;
  if (select is_active from public.countdowns where title = 'À venir') is not true then raise exception 'compte à rebours futur désactivé'; end if;
  raise notice 'OK rien de récent ni d''utile n''est touché';
end $$;

-- Journal : lisible par un admin seulement
insert into public.cleanup_runs (details) values ('{"test": true}');
set role authenticated; select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  if exists (select 1 from public.cleanup_runs) then raise exception 'journal visible par un scout'; end if;
end $$;
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ begin
  if not exists (select 1 from public.cleanup_runs) then raise exception 'journal invisible pour un admin'; end if;
  raise notice 'OK journal réservé aux admins';
end $$;
reset role;
do $$ begin
  if not public.cleanup_check_secret((select valeur from menage_prive.cle)) then raise exception 'bonne clé refusée'; end if;
end $$;
set role authenticated;
do $$ begin
  begin
    perform 1 from menage_prive.cle;
    raise exception 'clé lisible par un membre';
  exception when insufficient_privilege then null; end;
  raise notice 'OK clé privée';
end $$;
reset role;
delete from public.cleanup_runs; delete from public.countdowns;
delete from public.activities where id::text like 'cccccccc%';
delete from public.group_rides where id::text like 'dddddddd%';
\echo 'TOUS LES TESTS MÉNAGE SONT PASSÉS'
