-- Test de 20261011230000_pending_activity_email_alert.sql
-- À lancer sur PostgreSQL local après la fixture et la migration.
\set ON_ERROR_STOP on
begin;
set role service_role;

do $$ declare result jsonb; begin
  result := public.claim_pending_activity_alert(5);
  if (result->>'should_send')::boolean then
    raise exception 'le seuil ne doit pas être atteint à cinq activités';
  end if;

  result := public.claim_pending_activity_alert(6);
  if not (result->>'should_send')::boolean then
    raise exception 'le premier passage au-dessus de cinq doit envoyer une alerte';
  end if;

  result := public.claim_pending_activity_alert(8);
  if (result->>'should_send')::boolean then
    raise exception 'ne pas renvoyer une alerte tant que le compteur reste au-dessus de cinq';
  end if;

  result := public.claim_pending_activity_alert(5);
  if (result->>'should_send')::boolean then
    raise exception 'le retour à cinq doit réarmer sans envoyer';
  end if;

  result := public.claim_pending_activity_alert(6);
  if not (result->>'should_send')::boolean then
    raise exception 'un nouveau passage au-dessus de cinq doit envoyer une nouvelle alerte';
  end if;

  perform public.release_pending_activity_alert();
  raise notice 'OK : seuil, anti-doublon et réarmement';
end $$;

rollback;
