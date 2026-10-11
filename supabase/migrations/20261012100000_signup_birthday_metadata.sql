-- Persist optional birthday values from signup metadata even when email
-- confirmation prevents the newly registered user from writing their profile.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path to 'public' as $function$
declare
  target_patrol_id uuid;
begin
  if new.raw_user_meta_data->>'patrol_id' = 'staff' then
    select id into target_patrol_id from public.patrols
     where lower(name) in ('staff troupe', 'staff')
     order by (lower(name) = 'staff troupe') desc
     limit 1;
  elsif new.raw_user_meta_data->>'patrol_id' ~ '^[0-9a-fA-F-]{36}$' then
    target_patrol_id := (new.raw_user_meta_data->>'patrol_id')::uuid;
  else
    target_patrol_id := null;
  end if;

  insert into public.profiles (
    id, email, full_name, totem, quali, scout_year, patrol_id, phone,
    birth_day, birth_month, onboarded
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'name', 'Scout'),
    new.raw_user_meta_data->>'totem',
    new.raw_user_meta_data->>'quali',
    case
      when new.raw_user_meta_data->>'scout_year' ~ '^[0-9]+$' then (new.raw_user_meta_data->>'scout_year')::smallint
      else null
    end,
    target_patrol_id,
    new.raw_user_meta_data->>'phone',
    case when new.raw_user_meta_data->>'birth_day' ~ '^[0-9]+$'
      then (new.raw_user_meta_data->>'birth_day')::smallint else null end,
    case when new.raw_user_meta_data->>'birth_month' ~ '^[0-9]+$'
      then (new.raw_user_meta_data->>'birth_month')::smallint else null end,
    true
  )
  on conflict (id) do update set
    email = excluded.email,
    full_name = coalesce(excluded.full_name, profiles.full_name),
    totem = coalesce(excluded.totem, profiles.totem),
    quali = coalesce(excluded.quali, profiles.quali),
    scout_year = coalesce(excluded.scout_year, profiles.scout_year),
    patrol_id = coalesce(excluded.patrol_id, profiles.patrol_id),
    phone = coalesce(excluded.phone, profiles.phone),
    birth_day = coalesce(excluded.birth_day, profiles.birth_day),
    birth_month = coalesce(excluded.birth_month, profiles.birth_month),
    onboarded = true;

  insert into public.user_roles (user_id, role)
  values (new.id, 'user')
  on conflict (user_id, role) do nothing;

  if lower(new.email) = 'baudeletgauthier@gmail.com' then
    insert into public.user_roles (user_id, role)
    values (new.id, 'admin')
    on conflict (user_id, role) do nothing;
  end if;

  return new;
end; $function$;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
