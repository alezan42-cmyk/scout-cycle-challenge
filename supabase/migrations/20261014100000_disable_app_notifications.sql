-- Coupe le traitement et l'émission des notifications de l'app sans effacer
-- les tables ni leur historique. Les données restent récupérables au besoin.
do $$
declare
  scheduled_job_id bigint;
  job_removed boolean;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    execute 'select jobid from cron.job where jobname = $1 limit 1'
      into scheduled_job_id
      using 'app-notifications-push';

    if scheduled_job_id is not null then
      execute 'select cron.unschedule($1)'
        into job_removed
        using scheduled_job_id;
    end if;
  end if;

  if to_regclass('public.scout_challenge_participants') is not null
     and exists (
       select 1 from pg_trigger
       where tgname = 'trg_notify_app_challenge_participant'
         and tgrelid = 'public.scout_challenge_participants'::regclass
         and not tgisinternal
     ) then
    execute 'alter table public.scout_challenge_participants disable trigger trg_notify_app_challenge_participant';
  end if;

  if to_regclass('public.activities') is not null
     and exists (
       select 1 from pg_trigger
       where tgname = 'trg_notify_app_activity_review'
         and tgrelid = 'public.activities'::regclass
         and not tgisinternal
     ) then
    execute 'alter table public.activities disable trigger trg_notify_app_activity_review';
  end if;

  if to_regclass('public.activities') is not null
     and exists (
       select 1 from pg_trigger
       where tgname = 'trg_notify_app_distance_milestones'
         and tgrelid = 'public.activities'::regclass
         and not tgisinternal
     ) then
    execute 'alter table public.activities disable trigger trg_notify_app_distance_milestones';
  end if;

  if to_regclass('public.app_notifications') is not null then
    execute 'revoke all on table public.app_notifications from anon, authenticated';
  end if;

  if to_regclass('public.app_push_subscriptions') is not null then
    execute 'revoke all on table public.app_push_subscriptions from anon, authenticated';
  end if;
end;
$$;
