-- Repère une même URL Strava soumise plusieurs fois par la même personne,
-- pour la même date. La seconde sortie passe en attente pour révision du staff.
alter table public.activities
  add column if not exists duplicate_of_activity_id uuid
  references public.activities(id) on delete set null;

create or replace function public.normalize_strava_url(_url text)
returns text
language sql
immutable
set search_path = public
as $$
  select nullif(
    regexp_replace(
      regexp_replace(
        replace(
          replace(lower(btrim(_url)), 'https://www.strava.com/', 'https://strava.com/'),
          'http://www.strava.com/', 'http://strava.com/'
        ),
        '[?#].*$', ''
      ),
      '/+$', ''
    ),
    ''
  );
$$;

create or replace function public.flag_duplicate_strava_activity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_duplicate_id uuid;
begin
  new.duplicate_of_activity_id := null;
  if nullif(btrim(coalesce(new.strava_link, '')), '') is null then
    return new;
  end if;

  select a.id into v_duplicate_id
    from public.activities a
   where a.user_id = new.user_id
     and a.ride_date = new.ride_date
     and a.id is distinct from new.id
     and public.normalize_strava_url(a.strava_link) = public.normalize_strava_url(new.strava_link)
   order by a.created_at, a.id
   limit 1;

  if v_duplicate_id is not null then
    new.duplicate_of_activity_id := v_duplicate_id;
    new.status := 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_z_flag_duplicate_strava_activity on public.activities;
create trigger trg_z_flag_duplicate_strava_activity
  before insert or update of user_id, ride_date, strava_link on public.activities
  for each row execute function public.flag_duplicate_strava_activity();

revoke execute on function public.flag_duplicate_strava_activity() from public, anon, authenticated;
