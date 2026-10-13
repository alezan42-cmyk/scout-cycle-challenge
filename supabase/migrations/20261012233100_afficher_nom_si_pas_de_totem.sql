-- Les membres sans totem affichent leur nom sur le profil public.
-- Avec un totem, le nom reste masqué. Les visiteurs non connectés voient
-- uniquement le prénom et l'initiale, conformément à la règle de confidentialité.
create or replace function public.public_display_name(_full_name text)
returns text
language sql
stable
set search_path = public
as $$
  select case
    when _full_name is null or btrim(_full_name) = '' then null
    when auth.uid() is not null then _full_name
    else
      split_part(btrim(_full_name), ' ', 1) || ' ' ||
      case when split_part(btrim(_full_name), ' ', 2) <> ''
           then upper(left(split_part(btrim(_full_name), ' ', 2), 1)) || '.'
           else ''
      end
  end;
$$;

create or replace view public.profiles_public as
  select id,
         case when nullif(btrim(totem), '') is null
              then public.public_display_name(full_name)
              else null
         end as full_name,
         totem, quali, scout_year, patrol_id, is_admin,
         case when auth.uid() is not null then strava_url end as strava_url,
         created_at
  from public.profiles;

revoke all on public.profiles_public from anon, authenticated;
grant select on public.profiles_public to anon, authenticated;
