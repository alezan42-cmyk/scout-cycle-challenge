-- =====================================================================
-- Alerte e-mail : trop de sorties en attente de validation
--
-- Réglages (une seule ligne, admins seulement) : activée ou non, seuil
-- (« plus de N sorties en attente »), destinataires, délai minimum entre
-- deux e-mails. À chaque nouvelle sortie en attente, si le seuil est
-- dépassé et que le délai est écoulé, la base appelle la fonction Edge
-- `alerte-attente` (pg_net) qui envoie l'e-mail.
-- Une erreur d'alerte ne bloque jamais l'enregistrement d'une sortie.
-- Migration sans suppression, rejouable.
-- =====================================================================

create or replace function public.emails_valides(_emails text[])
returns boolean language sql immutable as $$
  select coalesce(bool_and(e ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'), true)
    from unnest(_emails) as e;
$$;

create table if not exists public.alert_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default false,
  threshold integer not null default 5 check (threshold between 1 and 500),
  emails text[] not null default '{}'
    check (cardinality(emails) <= 10 and public.emails_valides(emails)),
  cooldown_hours integer not null default 12 check (cooldown_hours between 1 and 168),
  last_sent_at timestamptz,
  last_count integer,
  updated_at timestamptz not null default now()
);

insert into public.alert_settings (id) values (true) on conflict (id) do nothing;

alter table public.alert_settings enable row level security;
grant select, update on public.alert_settings to authenticated;

drop policy if exists "alerte lecture admin" on public.alert_settings;
create policy "alerte lecture admin" on public.alert_settings
  for select to authenticated using (public.has_role(auth.uid(), 'admin'));

drop policy if exists "alerte modification admin" on public.alert_settings;
create policy "alerte modification admin" on public.alert_settings
  for update to authenticated
  using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Réservation atomique d'un envoi (évite deux e-mails si deux sorties
-- arrivent en même temps). Renvoie true si l'e-mail doit partir.
create or replace function public.pending_alert_claim(_count integer)
returns boolean language plpgsql security definer set search_path = public as $$
declare claimed boolean;
begin
  update public.alert_settings
     set last_sent_at = now(), last_count = _count
   where id
     and enabled
     and _count > threshold
     and cardinality(emails) > 0
     and (last_sent_at is null or last_sent_at < now() - make_interval(hours => cooldown_hours))
  returning true into claimed;
  return coalesce(claimed, false);
end; $$;

revoke execute on function public.pending_alert_claim(integer) from public, anon, authenticated;
grant execute on function public.pending_alert_claim(integer) to service_role;

-- Après chaque nouvelle sortie en attente : appel de la fonction Edge si utile
create or replace function public.notify_pending_alert()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  s public.alert_settings;
  n integer;
begin
  select * into s from public.alert_settings where id;
  if s is null or not s.enabled or cardinality(s.emails) = 0 then
    return null;
  end if;
  if s.last_sent_at is not null
     and s.last_sent_at > now() - make_interval(hours => s.cooldown_hours) then
    return null;
  end if;
  select count(*) into n from public.activities where status = 'pending';
  if n <= s.threshold then
    return null;
  end if;
  -- pg_net absent (base locale de test) : on n'envoie rien
  if to_regnamespace('net') is null then
    return null;
  end if;
  begin
    execute $sql$
      select net.http_post(
        url := 'https://civblymnwigeayfecujp.supabase.co/functions/v1/alerte-attente',
        headers := jsonb_build_object('Content-Type', 'application/json',
                                      'x-cron-secret', (select valeur from menage_prive.cle)),
        body := '{}'::jsonb,
        timeout_milliseconds := 30000)
    $sql$;
  exception when others then
    raise warning 'alerte sorties en attente : %', sqlerrm;
  end;
  return null;
end; $$;

revoke execute on function public.notify_pending_alert() from public, anon, authenticated;

drop trigger if exists trg_notify_pending_alert on public.activities;
create trigger trg_notify_pending_alert
  after insert on public.activities
  for each row when (new.status = 'pending')
  execute function public.notify_pending_alert();
