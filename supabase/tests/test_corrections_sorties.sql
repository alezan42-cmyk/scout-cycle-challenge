-- Tests de 20261011190000_corrections_sorties.sql (après fixture + toutes les migrations)
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(_uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(_uid, ''), false); end; $$;

delete from public.user_roles where user_id = '33333333-3333-3333-3333-333333333333' and role = 'admin';
delete from public.activity_corrections; -- entrées laissées par les tests précédents

-- Scout 1 : une sortie Strava (validée) et deux photos (en attente)
set role authenticated; select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
insert into public.activities (id, user_id, km, ride_date, strava_link, note) values
  ('eeeeeeee-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 45, '2026-10-03', 'https://strava.com/a/301', 'Tour'),
  ('eeeeeeee-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 12, '2026-10-04', null, null),
  ('eeeeeeee-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 8, '2026-10-05', null, null),
  ('eeeeeeee-0000-0000-0000-000000000004', '22222222-2222-2222-2222-222222222222', 3, '2026-10-06', 'https://strava.com/a/302', null);

-- Verrou : le scout ne peut plus changer les km de sa sortie validée…
update public.activities set km = 450, ride_date = '2026-10-04', note = '[course] Tour'
 where id = 'eeeeeeee-0000-0000-0000-000000000001';
-- … mais peut toujours modifier une sortie en attente
update public.activities set km = 13 where id = 'eeeeeeee-0000-0000-0000-000000000002';
do $$ begin
  if (select km from public.activities where id = 'eeeeeeee-0000-0000-0000-000000000001') <> 45 then raise exception 'km modifiés après validation'; end if;
  if (select ride_date from public.activities where id = 'eeeeeeee-0000-0000-0000-000000000001') <> '2026-10-03' then raise exception 'date modifiée après validation'; end if;
  if (select note from public.activities where id = 'eeeeeeee-0000-0000-0000-000000000001') like '[course]%' then raise exception 'sport modifié après validation'; end if;
  if (select km from public.activities where id = 'eeeeeeee-0000-0000-0000-000000000002') <> 13 then raise exception 'sortie en attente non modifiable'; end if;
  if exists (select 1 from public.activity_corrections) then raise exception 'modif du scout journalisée'; end if;
  raise notice 'OK verrou après validation (scout)';
end $$;
-- Le scout supprime lui-même une sortie : pas de message
delete from public.activities where id = 'eeeeeeee-0000-0000-0000-000000000004';
do $$ begin
  if exists (select 1 from public.activity_corrections) then raise exception 'suppression du scout journalisée'; end if;
  raise notice 'OK suppression par le scout non journalisée';
end $$;
reset role;

-- Admin : corrige, valide, refuse, supprime
set role authenticated; select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
update public.activities set km = 4.5, note = '[marche] Tour' where id = 'eeeeeeee-0000-0000-0000-000000000001';
update public.activities set status = 'approved' where id = 'eeeeeeee-0000-0000-0000-000000000002'; -- validation normale
update public.activities set status = 'pending' where id = 'eeeeeeee-0000-0000-0000-000000000002';  -- remise en attente
update public.activities set status = 'rejected' where id = 'eeeeeeee-0000-0000-0000-000000000003'; -- refus
delete from public.activities where id = 'eeeeeeee-0000-0000-0000-000000000002';
do $$
declare c record;
begin
  select * into c from public.activity_corrections where activity_id = 'eeeeeeee-0000-0000-0000-000000000001';
  if c is null or c.action <> 'modification' or (c.changes->'km'->>'avant')::numeric <> 45
     or (c.changes->'km'->>'apres')::numeric <> 4.5 or c.changes->'sport'->>'apres' <> 'marche'
     or c.admin_id <> '11111111-1111-1111-1111-111111111111' then
    raise exception 'correction mal journalisée : %', row_to_json(c);
  end if;
  if (select count(*) from public.activity_corrections where activity_id = 'eeeeeeee-0000-0000-0000-000000000002') <> 2 then
    raise exception 'remise en attente + suppression : 2 entrées attendues (la validation ne compte pas)';
  end if;
  if not exists (select 1 from public.activity_corrections where activity_id = 'eeeeeeee-0000-0000-0000-000000000002' and action = 'suppression') then raise exception 'suppression non journalisée'; end if;
  if not exists (select 1 from public.activity_corrections where activity_id = 'eeeeeeee-0000-0000-0000-000000000003' and action = 'refus') then raise exception 'refus non journalisé'; end if;
  if (select count(*) from public.activity_corrections) <> 4 then raise exception 'nombre d''entrées inattendu'; end if;
  raise notice 'OK admin : modification, remise en attente, refus, suppression journalisés';
end $$;
-- L'admin ne peut pas écrire dans le journal à la main
do $$ begin
  insert into public.activity_corrections (user_id, action) values ('22222222-2222-2222-2222-222222222222', 'modification');
  raise exception 'journal modifiable à la main';
exception when insufficient_privilege then raise notice 'OK journal non modifiable à la main';
end $$;
reset role;

-- Scout 2 : ne voit pas les corrections de Scout 1
set role authenticated; select pg_temp.as_user('33333333-3333-3333-3333-333333333333');
do $$ begin
  if exists (select 1 from public.activity_corrections) then raise exception 'scout voit les corrections d''un autre'; end if;
  if public.mark_corrections_seen() <> 0 then raise exception 'scout marque les messages d''un autre'; end if;
  raise notice 'OK scout 2 : ne voit rien';
end $$;
reset role;

-- Scout 1 : voit ses 4 messages et les marque comme lus
set role authenticated; select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  if (select count(*) from public.activity_corrections where seen_at is null) <> 4 then raise exception 'scout 1 ne voit pas ses messages'; end if;
  if public.mark_corrections_seen() <> 4 then raise exception 'marquage lu incorrect'; end if;
  if exists (select 1 from public.activity_corrections where seen_at is null) then raise exception 'messages non lus restants'; end if;
  raise notice 'OK scout 1 : messages vus et marqués lus';
end $$;
reset role;

-- Visiteur : rien
set role anon; select pg_temp.as_user(null);
do $$ begin
  perform count(*) from public.activity_corrections;
  raise exception 'anon lit les corrections';
exception when insufficient_privilege then raise notice 'OK anonyme : journal privé';
end $$;
reset role;

select 'TOUS LES TESTS CORRECTIONS SONT PASSÉS' as resultat;
