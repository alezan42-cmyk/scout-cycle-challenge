-- Les profils consultables par les scouts et visiteurs ne révèlent plus le
-- prénom ni le nom, même pour les membres connectés. Le totem reste affiché.
create or replace function public.public_display_name(_full_name text)
returns text
language sql
stable
set search_path = public
as $$
  select null::text;
$$;

-- Conserve la colonne full_name pour compatibilité avec les clients existants,
-- mais elle est désormais toujours NULL dans la vue publique.
create or replace view public.profiles_public as
  select id,
         public.public_display_name(full_name) as full_name,
         totem, quali, scout_year, patrol_id, is_admin,
         case when auth.uid() is not null then strava_url end as strava_url,
         created_at
  from public.profiles;

revoke all on public.profiles_public from anon, authenticated;
grant select on public.profiles_public to anon, authenticated;
