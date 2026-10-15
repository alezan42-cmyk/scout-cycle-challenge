-- Calendrier festif administrable et dates récurrentes des anniversaires du staff.
-- Ces réglages ne contiennent que des dates MM-DD; aucun nom ni année de naissance n'est enregistré.

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

-- Les deux réglages sont publics en lecture (comme les autres thèmes) et les policies
-- de site_settings réservent déjà toutes les écritures aux admins.
