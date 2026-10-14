-- Tests de 20261010120000_alerte_sorties_en_attente.sql (après fixture + toutes les migrations)
\set ON_ERROR_STOP on
create or replace function pg_temp.as_user(_uid text) returns void language plpgsql as $$
begin perform set_config('request.jwt.claim.sub', coalesce(_uid, ''), false); end; $$;

delete from public.user_roles where user_id = '33333333-3333-3333-3333-333333333333' and role = 'admin';

-- Scout : ne voit ni ne modifie les réglages
set role authenticated; select pg_temp.as_user('22222222-2222-2222-2222-222222222222');
do $$ begin
  if exists (select 1 from public.alert_settings) then raise exception 'réglages visibles par un scout'; end if;
  update public.alert_settings set enabled = true;
  raise notice 'OK scout : réglages invisibles';
end $$;

-- Admin : règle l'alerte, valeurs contrôlées
select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ begin
  update public.alert_settings set enabled = true, threshold = 2, emails = array['chef@exemple.be', 'staff@exemple.be'];
  if (select threshold from public.alert_settings) <> 2 then raise exception 'admin ne peut pas régler'; end if;
  begin
    update public.alert_settings set emails = array['pas-un-email'];
    raise exception 'e-mail invalide accepté';
  exception when check_violation then null; end;
  begin
    update public.alert_settings set threshold = 0;
    raise exception 'seuil 0 accepté';
  exception when check_violation then null; end;
  raise notice 'OK admin : réglages et contrôles';
end $$;
reset role;
do $$ begin
  if (select enabled from public.alert_settings) is distinct from true then raise exception 'scout a pu désactiver ? ou admin n a pas activé'; end if;
end $$;

-- Le trigger ne bloque jamais l'insertion (pas de pg_net en local)
insert into public.activities (id, user_id, km, ride_date, proof_path) values
  ('eeeeeeee-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 5, current_date, 'p1'),
  ('eeeeeeee-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 6, current_date, 'p2'),
  ('eeeeeeee-0000-0000-0000-000000000003', '22222222-2222-2222-2222-222222222222', 7, current_date, 'p3');
do $$ begin raise notice 'OK sorties enregistrées malgré l''alerte'; end $$;

-- Réservation atomique : une seule fois par délai, seulement au-dessus du seuil
set role service_role;
do $$ begin
  if public.pending_alert_claim(2) then raise exception 'envoi au seuil exact (2 n''est pas « plus de 2 »)'; end if;
  if not public.pending_alert_claim(3) then raise exception 'premier envoi refusé'; end if;
  if public.pending_alert_claim(5) then raise exception 'deuxième envoi dans le délai accepté'; end if;
  raise notice 'OK réservation : seuil strict, un envoi par délai';
end $$;
reset role;
set role authenticated; select pg_temp.as_user('11111111-1111-1111-1111-111111111111');
do $$ begin
  begin
    perform public.pending_alert_claim(10);
    raise exception 'un admin peut réserver un envoi directement';
  exception when insufficient_privilege then null; end;
  raise notice 'OK réservation réservée au service';
end $$;
reset role;
update public.alert_settings set enabled = false, threshold = 5, emails = '{}', last_sent_at = null, last_count = null;
delete from public.activities where id::text like 'eeeeeeee%';
\echo 'TOUS LES TESTS ALERTE SONT PASSÉS'
