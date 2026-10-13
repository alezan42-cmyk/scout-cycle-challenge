-- Nettoie les détails devenus inutiles des sorties validées après 30 jours.
-- Le délai existant des autres règles (preuves à 30 j., sorties en attente à
-- 60 j., groupes vides à 30 j.) n'est pas modifié.
-- Les kilomètres, D+, dates, statuts et marqueurs de sport sont conservés.

-- Laisser le ménage service_role effacer le lien d'une sortie validée.
-- Les comptes membres restent soumis au verrou habituel.
create or replace function public.lock_validated_activity()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if old.status = 'approved'
     and coalesce(auth.jwt() ->> 'role', '') <> 'service_role'
     and not (auth.uid() is not null and public.has_role(auth.uid(), 'admin')) then
    new.km := old.km;
    new.elevation_m := old.elevation_m;
    new.ride_date := old.ride_date;
    new.strava_link := old.strava_link;
    if public.activity_sport(new.note) <> public.activity_sport(old.note) then
      new.note := old.note;
    end if;
  end if;
  return new;
end; $$;

revoke execute on function public.lock_validated_activity() from public, anon, authenticated;

create or replace function public.cleanup_database(_dry boolean default false)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  n_groups int;
  n_countdowns int;
  n_pending int;
  n_approved_details int;
  files text[];
begin
  if _dry then
    select count(*) into n_groups from public.group_rides g
     where g.created_at < now() - interval '30 days'
       and not exists (select 1 from public.activities a where a.group_ride_id = g.id);
    select count(*) into n_countdowns from public.countdowns
     where is_active and target_date < now() - interval '1 day';
    select count(*), coalesce(array_remove(array_agg(proof_path) || array_agg(gpx_path), null), '{}')
      into n_pending, files
      from public.activities
     where status = 'pending' and created_at < now() - interval '60 days';
    select count(*) into n_approved_details
      from public.activities a
     where a.status = 'approved'
       and a.validated_at < now() - interval '30 days'
       and (a.strava_link is not null or a.note is distinct from (
         case
           when lower(coalesce(a.note, '')) like '[course]%'
             or lower(coalesce(a.note, '')) like '%#course%'
             or lower(coalesce(a.note, '')) like '%#run%' then '[course]'
           when lower(coalesce(a.note, '')) like '[marche]%'
             or lower(coalesce(a.note, '')) like '[walk]%'
             or lower(coalesce(a.note, '')) like '[rando]%'
             or lower(coalesce(a.note, '')) like '%#marche%'
             or lower(coalesce(a.note, '')) like '%#walk%' then '[marche]'
           else null
         end
       ));
  else
    delete from public.group_rides g
     where g.created_at < now() - interval '30 days'
       and not exists (select 1 from public.activities a where a.group_ride_id = g.id);
    get diagnostics n_groups = row_count;

    update public.countdowns set is_active = false
     where is_active and target_date < now() - interval '1 day';
    get diagnostics n_countdowns = row_count;

    with cleaned as (
      update public.activities a
         set strava_link = null,
             note = case
               when lower(coalesce(a.note, '')) like '[course]%'
                 or lower(coalesce(a.note, '')) like '%#course%'
                 or lower(coalesce(a.note, '')) like '%#run%' then '[course]'
               when lower(coalesce(a.note, '')) like '[marche]%'
                 or lower(coalesce(a.note, '')) like '[walk]%'
                 or lower(coalesce(a.note, '')) like '[rando]%'
                 or lower(coalesce(a.note, '')) like '%#marche%'
                 or lower(coalesce(a.note, '')) like '%#walk%' then '[marche]'
               else null
             end
       where a.status = 'approved'
         and a.validated_at < now() - interval '30 days'
         and (a.strava_link is not null or a.note is distinct from (
           case
             when lower(coalesce(a.note, '')) like '[course]%'
               or lower(coalesce(a.note, '')) like '%#course%'
               or lower(coalesce(a.note, '')) like '%#run%' then '[course]'
             when lower(coalesce(a.note, '')) like '[marche]%'
               or lower(coalesce(a.note, '')) like '[walk]%'
               or lower(coalesce(a.note, '')) like '[rando]%'
               or lower(coalesce(a.note, '')) like '%#marche%'
               or lower(coalesce(a.note, '')) like '%#walk%' then '[marche]'
             else null
           end
         ))
       returning a.id
    ) select count(*) into n_approved_details from cleaned;

    with gone as (
      delete from public.activities
       where status = 'pending' and created_at < now() - interval '60 days'
      returning proof_path, gpx_path
    )
    select count(*), coalesce(array_remove(array_agg(proof_path) || array_agg(gpx_path), null), '{}')
      into n_pending, files
      from gone;
  end if;

  return jsonb_build_object(
    'groupes_vides_supprimes', n_groups,
    'comptes_a_rebours_desactives', n_countdowns,
    'sorties_en_attente_supprimees', n_pending,
    'sorties_validees_nettoyees', n_approved_details,
    'fichiers_a_effacer', to_jsonb(files)
  );
end; $$;

revoke execute on function public.cleanup_database(boolean) from public, anon, authenticated;
grant execute on function public.cleanup_database(boolean) to service_role;
