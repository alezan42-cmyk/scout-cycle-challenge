-- Paliers de kilomètres séparés et visibilité de l'adoption de l'application.
alter table public.app_notification_settings
  add column if not exists individual_distance_enabled boolean not null default true,
  add column if not exists individual_distance_interval_km integer not null default 100
    check (individual_distance_interval_km between 1 and 100000),
  add column if not exists individual_distance_title text not null default 'Beau palier !'
    check (char_length(individual_distance_title) between 1 and 100),
  add column if not exists individual_distance_body text not null
    default 'Tu as parcouru {km} km au total. Continue comme ça !'
    check (char_length(individual_distance_body) between 1 and 300);

update public.app_notification_settings
   set distance_title = 'La troupe avance !',
       distance_body = 'La troupe vient de franchir le palier des {km} km. Bravo à tous !'
 where singleton = true and distance_title = 'Nouveau palier !';

alter table public.app_notifications drop constraint if exists app_notifications_kind_check;
alter table public.app_notifications add constraint app_notifications_kind_check
  check (kind in (
    'weekly_reminder', 'distance_milestone', 'manual', 'new_signup',
    'individual_distance_milestone', 'troop_distance_milestone',
    'aquila_distance_milestone', 'activity_pending'
  ));

create table if not exists public.app_installations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  installation_id text not null check (char_length(installation_id) between 8 and 100),
  platform text not null check (platform in ('ios', 'android', 'desktop', 'other')),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(user_id, installation_id)
);
create index if not exists app_installations_user_idx on public.app_installations(user_id);
alter table public.app_installations enable row level security;
revoke all on public.app_installations from anon, authenticated;
grant all on public.app_installations to service_role;

create or replace function public.notify_app_distance_milestones()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  settings public.app_notification_settings%rowtype;
  user_total numeric;
  user_previous numeric;
  troop_total numeric;
  troop_previous numeric;
  milestone integer;
  max_milestone integer;
  target_km integer;
  aquila_id uuid;
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then return new; end if;

  select * into settings from public.app_notification_settings where singleton = true;
  if not found then return new; end if;

  select coalesce(sum(km), 0) into user_total
    from public.activities where user_id = new.user_id and status = 'approved';
  user_previous := greatest(0, user_total - coalesce(new.km, 0));

  if settings.individual_distance_enabled then
    milestone := floor(user_previous / settings.individual_distance_interval_km)::integer + 1;
    max_milestone := floor(user_total / settings.individual_distance_interval_km)::integer;
    while milestone <= max_milestone loop
      target_km := milestone * settings.individual_distance_interval_km;
      insert into public.app_notifications(user_id, kind, title, body, href, dedupe_key)
      values (
        new.user_id, 'individual_distance_milestone', settings.individual_distance_title,
        replace(settings.individual_distance_body, '{km}', target_km::text), '/app/trophees',
        'individual-distance:' || new.user_id || ':' || target_km::text
      ) on conflict (dedupe_key) do nothing;
      milestone := milestone + 1;
    end loop;
  end if;

  if settings.distance_enabled then
    select coalesce(sum(km), 0) into troop_total
      from public.activities where status = 'approved';
    troop_previous := greatest(0, troop_total - coalesce(new.km, 0));
    milestone := floor(troop_previous / settings.distance_interval_km)::integer + 1;
    max_milestone := floor(troop_total / settings.distance_interval_km)::integer;
    while milestone <= max_milestone loop
      target_km := milestone * settings.distance_interval_km;
      insert into public.app_notifications(user_id, kind, title, body, href, dedupe_key)
      select p.id, 'troop_distance_milestone', settings.distance_title,
             replace(settings.distance_body, '{km}', target_km::text), '/',
             'troop-distance:' || target_km::text || ':' || p.id::text
        from public.profiles p
      on conflict (dedupe_key) do nothing;
      milestone := milestone + 1;
    end loop;
  end if;

  select id into aquila_id from public.profiles
   where lower(trim(coalesce(totem, ''))) in ('aquila', 'aquilla') limit 1;
  if aquila_id is not null and aquila_id = new.user_id then
    milestone := floor(user_previous / 500)::integer + 1;
    max_milestone := floor(user_total / 500)::integer;
    while milestone <= max_milestone loop
      target_km := milestone * 500;
      insert into public.app_notifications(user_id, kind, title, body, href, dedupe_key)
      values (
        aquila_id, 'aquila_distance_milestone', 'Tu franchis un palier !',
        'Tu viens de parcourir ' || target_km::text || ' km au total. Bravo !', '/app/trophees',
        'aquila-distance:' || new.user_id || ':' || target_km::text
      ) on conflict (dedupe_key) do nothing;
      milestone := milestone + 1;
    end loop;
  end if;
  return new;
end;
$$;

create or replace function public.notify_aquila_activity_pending()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  aquila_id uuid;
  scout_name text;
begin
  if new.status <> 'pending' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'pending' then return new; end if;
  select id into aquila_id from public.profiles
   where lower(trim(coalesce(totem, ''))) in ('aquila', 'aquilla') limit 1;
  if aquila_id is null or aquila_id = new.user_id then return new; end if;
  select coalesce(nullif(trim(totem), ''), nullif(trim(full_name), ''), 'Un scout')
    into scout_name from public.profiles where id = new.user_id;
  insert into public.app_notifications(user_id, kind, title, body, href, dedupe_key)
  values (aquila_id, 'activity_pending', 'Une sortie attend ta validation',
          scout_name || ' a enregistré une sortie de ' || new.km::text || ' km.',
          '/admin', 'activity-pending:' || new.id::text)
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;
drop trigger if exists trg_notify_aquila_activity_pending on public.activities;
create trigger trg_notify_aquila_activity_pending
  after insert or update of status on public.activities
  for each row execute function public.notify_aquila_activity_pending();
revoke execute on function public.notify_app_distance_milestones() from public, anon, authenticated;
revoke execute on function public.notify_aquila_activity_pending() from public, anon, authenticated;
