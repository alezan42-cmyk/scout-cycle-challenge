-- Réglages administrables et notifications d'inscription.
create table if not exists public.app_notification_settings (
  singleton boolean primary key default true check (singleton),
  distance_enabled boolean not null default true,
  distance_interval_km integer not null default 1000 check (distance_interval_km between 1 and 100000),
  distance_title text not null default 'Nouveau palier !' check (char_length(distance_title) between 1 and 100),
  distance_body text not null default 'Tu viens de franchir le palier des {km} km cumulés. Bravo !' check (char_length(distance_body) between 1 and 300),
  weekly_enabled boolean not null default true,
  weekly_hour integer not null default 9 check (weekly_hour between 0 and 23),
  weekly_title text not null default 'Pense à tes kilomètres !' check (char_length(weekly_title) between 1 and 100),
  weekly_body text not null default 'Pense à enregistrer tes kms de la semaine.' check (char_length(weekly_body) between 1 and 300),
  updated_at timestamptz not null default now()
);

insert into public.app_notification_settings(singleton)
values (true)
on conflict (singleton) do nothing;

alter table public.app_notification_settings enable row level security;
revoke all on public.app_notification_settings from anon, authenticated;
grant select, update on public.app_notification_settings to authenticated;
grant all on public.app_notification_settings to service_role;
drop policy if exists "admins gèrent les réglages de notifications" on public.app_notification_settings;
create policy "admins gèrent les réglages de notifications" on public.app_notification_settings
  for all to authenticated
  using (public.has_role((select auth.uid()), 'admin'))
  with check (public.has_role((select auth.uid()), 'admin'));

alter table public.app_notifications drop constraint if exists app_notifications_kind_check;
alter table public.app_notifications add constraint app_notifications_kind_check
  check (kind in ('weekly_reminder', 'distance_milestone', 'manual', 'new_signup'));

create or replace function public.notify_app_distance_milestones()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  settings public.app_notification_settings%rowtype;
  total_km numeric;
  previous_km numeric;
  milestone integer;
  max_milestone integer;
  target_km integer;
begin
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then return new; end if;

  select * into settings from public.app_notification_settings where singleton = true;
  if not found or not settings.distance_enabled then return new; end if;

  select coalesce(sum(km), 0) into total_km
    from public.activities where user_id = new.user_id and status = 'approved';
  previous_km := greatest(0, total_km - coalesce(new.km, 0));
  milestone := floor(previous_km / settings.distance_interval_km)::integer + 1;
  max_milestone := floor(total_km / settings.distance_interval_km)::integer;

  while milestone <= max_milestone loop
    target_km := milestone * settings.distance_interval_km;
    insert into public.app_notifications(user_id, kind, title, body, href, dedupe_key)
    values (
      new.user_id,
      'distance_milestone',
      settings.distance_title,
      replace(settings.distance_body, '{km}', target_km::text),
      '/app/trophees',
      'distance:' || new.user_id || ':' || target_km::text
    )
    on conflict (dedupe_key) do nothing;
    milestone := milestone + 1;
  end loop;
  return new;
end;
$$;
revoke execute on function public.notify_app_distance_milestones() from public, anon, authenticated;

create or replace function public.notify_aquila_new_signup()
returns trigger language plpgsql security definer set search_path = public as $$
declare aquila_id uuid;
begin
  select id into aquila_id
    from public.profiles
   where lower(trim(coalesce(totem, ''))) = 'aquila'
     and id <> new.id
   limit 1;
  if aquila_id is null then return new; end if;

  insert into public.app_notifications(user_id, kind, title, body, href)
  values (
    aquila_id,
    'new_signup',
    'Un nouveau scout nous rejoint !',
    coalesce(nullif(trim(new.totem), ''), nullif(trim(new.full_name), ''), 'Un scout') || ' vient de s’inscrire. Bienvenue dans la troupe !',
    '/'
  );
  return new;
end;
$$;
drop trigger if exists trg_notify_aquila_new_signup on public.profiles;
create trigger trg_notify_aquila_new_signup
  after insert on public.profiles
  for each row execute function public.notify_aquila_new_signup();
revoke execute on function public.notify_aquila_new_signup() from public, anon, authenticated;
