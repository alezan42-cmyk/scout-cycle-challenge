-- État privé pour envoyer un seul email lorsque le nombre d'activités passe
-- au-dessus de cinq, puis réarmer l'alerte quand il redescend à cinq ou moins.
create schema if not exists menage_prive;
revoke all on schema menage_prive from public, anon, authenticated;

create table if not exists menage_prive.pending_activity_alert_state (
  id boolean primary key default true check (id),
  is_active boolean not null default false,
  last_pending_count integer not null default 0,
  last_notified_at timestamptz
);
revoke all on menage_prive.pending_activity_alert_state from public, anon, authenticated;

create or replace function public.claim_pending_activity_alert(_pending_count integer)
returns jsonb
language plpgsql
security definer
set search_path = menage_prive, pg_temp
as $$
declare
  was_active boolean;
  should_send boolean := false;
begin
  insert into menage_prive.pending_activity_alert_state (id)
  values (true)
  on conflict (id) do nothing;

  select is_active into was_active
    from menage_prive.pending_activity_alert_state
   where id = true
   for update;

  if _pending_count > 5 then
    should_send := not was_active;
    update menage_prive.pending_activity_alert_state
       set is_active = true,
           last_pending_count = _pending_count,
           last_notified_at = case when should_send then now() else last_notified_at end
     where id = true;
  else
    update menage_prive.pending_activity_alert_state
       set is_active = false,
           last_pending_count = _pending_count
     where id = true;
  end if;

  return jsonb_build_object(
    'should_send', should_send,
    'pending_count', _pending_count
  );
end;
$$;

create or replace function public.release_pending_activity_alert()
returns void
language sql
security definer
set search_path = menage_prive, pg_temp
as $$
  update menage_prive.pending_activity_alert_state
     set is_active = false
   where id = true;
$$;

revoke execute on function public.claim_pending_activity_alert(integer) from public, anon, authenticated;
revoke execute on function public.release_pending_activity_alert() from public, anon, authenticated;
grant execute on function public.claim_pending_activity_alert(integer) to service_role;
grant execute on function public.release_pending_activity_alert() to service_role;

-- Vérifie le seuil toutes les cinq minutes avec la même clé privée que le ménage.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

select cron.unschedule(jobid)
  from cron.job
 where jobname = 'pending-activity-email-alert';

select cron.schedule(
  'pending-activity-email-alert',
  '*/5 * * * *',
  $job$
    select net.http_post(
      url := 'https://civblymnwigeayfecujp.supabase.co/functions/v1/pending-activity-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select valeur from menage_prive.cle where id = true)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);
