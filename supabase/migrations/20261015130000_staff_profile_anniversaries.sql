-- Le thème anniversaire se base sur les anniversaires renseignés dans les profils
-- de la patrouille Staff troupe. Seuls le jour et le mois sont renvoyés.

create or replace function public.staff_birthday_dates()
returns table (birth_day smallint, birth_month smallint)
language sql
stable
security definer
set search_path = public
as $$
  select distinct p.birth_day, p.birth_month
  from public.profiles p
  join public.patrols pa on pa.id = p.patrol_id
  where auth.uid() is not null
    and p.birth_day is not null
    and p.birth_month is not null
    and lower(btrim(pa.name)) in ('staff troupe', 'staff');
$$;

revoke execute on function public.staff_birthday_dates() from public, anon;
grant execute on function public.staff_birthday_dates() to authenticated;

-- Réaffirme la prise en charge du thème Anniversaire sur les bases où la première
-- migration de calendrier avait déjà été appliquée.
alter table public.site_settings drop constraint if exists site_settings_valeurs_valides;
alter table public.site_settings
  add constraint site_settings_valeurs_valides check (
    (key = 'theme' and value in (
      'default', 'automne', 'halloween', 'noel', 'valentin', 'paques', 'printemps', 'ete',
      'course24h', 'hiver', 'carnaval', 'nationale', 'foot', 'tennis', 'anniversaire'))
    or (key = 'theme_mode' and value in ('auto', 'manuel'))
    or (key = 'theme_intensity' and value in ('festif', 'discret'))
    or (key ~ '^background:(default|automne|halloween|noel|valentin|paques|printemps|ete|course24h|hiver|carnaval|nationale|foot|tennis|anniversaire)$'
        and value ~ '^https://')
    or case when key = 'theme_calendar'
       then jsonb_typeof(value::jsonb) = 'object'
       else false end
    or case when key = 'theme_staff_birthdays'
       then jsonb_typeof(value::jsonb) = 'array'
       else false end
  );
