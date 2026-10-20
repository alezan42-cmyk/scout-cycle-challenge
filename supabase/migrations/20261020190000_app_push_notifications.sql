-- Notifications push PWA : rappels hebdomadaires, paliers de 500 km et messages staff.
create table if not exists public.app_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('weekly_reminder','distance_milestone','manual')),
  title text not null check (char_length(title) between 1 and 100),
  body text not null check (char_length(body) between 1 and 300),
  href text not null default '/',
  dedupe_key text unique,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  push_sent_at timestamptz,
  push_attempts integer not null default 0 check (push_attempts >= 0),
  push_last_error text
);
create index if not exists app_notifications_user_created_idx on public.app_notifications(user_id, created_at desc);
create index if not exists app_notifications_push_queue_idx on public.app_notifications(created_at) where push_sent_at is null;
alter table public.app_notifications enable row level security;
grant select, update(read_at) on public.app_notifications to authenticated;
grant insert(user_id, kind, title, body, href) on public.app_notifications to authenticated;
grant all on public.app_notifications to service_role;
drop policy if exists "notifications: chacun lit les siennes" on public.app_notifications;
drop policy if exists "notifications: chacun marque lu" on public.app_notifications;
drop policy if exists "notifications: admin crée" on public.app_notifications;
drop policy if exists "notifications: admin supprime" on public.app_notifications;
create policy "notifications: chacun lit les siennes" on public.app_notifications
  for select to authenticated using (user_id = (select auth.uid()) or public.has_role((select auth.uid()), 'admin'));
create policy "notifications: chacun marque lu" on public.app_notifications
  for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "notifications: admin crée" on public.app_notifications
  for insert to authenticated with check (
    kind = 'manual' and public.has_role((select auth.uid()), 'admin')
    and href like '/%' and href not like '//%' and position(chr(92) in href) = 0
  );
create policy "notifications: admin supprime" on public.app_notifications
  for delete to authenticated using (public.has_role((select auth.uid()), 'admin'));
grant delete on public.app_notifications to authenticated;

create table if not exists public.app_push_subscriptions (
  endpoint text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  subscription jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists app_push_subscriptions_user_idx on public.app_push_subscriptions(user_id);
alter table public.app_push_subscriptions enable row level security;
revoke all on public.app_push_subscriptions from anon, authenticated;
grant all on public.app_push_subscriptions to service_role;

-- Le centre se met à jour en temps réel dans l’application.
do $$ begin
  if not exists (
    select 1 from pg_publication_tables where pubname = 'supabase_realtime'
      and schemaname = 'public' and tablename = 'app_notifications'
  ) then
    alter publication supabase_realtime add table public.app_notifications;
  end if;
end $$;

-- Évite de rejouer les notifications qui étaient en attente avant la réactivation.
update public.app_notifications
set push_sent_at = now(), push_last_error = null
where push_sent_at is null;

-- À appliquer après déploiement de la fonction Edge `app-notifications`.
create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;
do $$
declare scheduled_job_id bigint;
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    select jobid into scheduled_job_id from cron.job where jobname = 'app-notifications-push' limit 1;
    if scheduled_job_id is not null then perform cron.unschedule(scheduled_job_id); end if;
  end if;
end $$;
select cron.schedule(
  'app-notifications-push',
  '* * * * *',
  $job$
    select net.http_post(
      url := 'https://civblymnwigeayfecujp.supabase.co/functions/v1/app-notifications',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-cron-secret', (select valeur from menage_prive.cle where id = true)
      ),
      body := '{}'::jsonb,
      timeout_milliseconds := 30000
    );
  $job$
);

-- Un avis à chaque nouveau palier de 500 km validés, même si plusieurs paliers
-- sont franchis lors d’une seule activité.
create or replace function public.notify_app_distance_milestones()
returns trigger language plpgsql security definer set search_path = public as $$
declare total_km numeric; previous_km numeric; milestone integer; max_milestone integer;
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then return new; end if;
  select coalesce(sum(km),0) into total_km from public.activities where user_id=new.user_id and status='approved';
  previous_km := greatest(0, total_km - coalesce(new.km,0));
  milestone := floor(previous_km / 500)::integer + 1;
  max_milestone := floor(total_km / 500)::integer;
  while milestone <= max_milestone loop
    insert into public.app_notifications(user_id,kind,title,body,href,dedupe_key)
    values(new.user_id,'distance_milestone','Nouveau palier !','Tu viens de franchir le palier des ' || (milestone * 500)::text || ' km cumulés. Bravo !','/app/trophees','distance:' || new.user_id || ':' || (milestone * 500)::text)
    on conflict (dedupe_key) do nothing;
    milestone := milestone + 1;
  end loop;
  return new;
end;
$$;
drop trigger if exists trg_notify_app_distance_milestones on public.activities;
create trigger trg_notify_app_distance_milestones after insert or update of status on public.activities
  for each row execute function public.notify_app_distance_milestones();
revoke execute on function public.notify_app_distance_milestones() from public, anon, authenticated;

-- Les inscriptions PWA et les notifications restent accessibles uniquement
-- à la fonction Edge utilisant service_role.
