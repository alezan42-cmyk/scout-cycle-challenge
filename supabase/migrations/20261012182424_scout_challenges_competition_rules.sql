-- Evolve scout challenges into multi-recipient competitions.
alter table public.activities drop constraint if exists activities_challenge_id_key;
alter table public.scout_challenges alter column challenged_id drop not null;
alter table public.scout_challenges drop constraint if exists scout_challenges_distinct_scouts;
alter table public.scout_challenges drop constraint if exists scout_challenges_status_check;

alter table public.scout_challenges
  add column if not exists sport text,
  add column if not exists target_km numeric(7,2),
  add column if not exists exact_distance boolean not null default false,
  add column if not exists target_elevation integer,
  add column if not exists gpx_template_path text,
  add column if not exists manual_validation boolean not null default false,
  add column if not exists winner_id uuid references auth.users(id) on delete set null;

create table public.scout_challenge_participants (
  id uuid primary key default gen_random_uuid(),
  challenge_id uuid not null references public.scout_challenges(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'open' check (status in ('open','submitted','won','lost','rejected')),
  activity_id uuid unique references public.activities(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (challenge_id, user_id)
);
create index scout_challenge_participants_user_idx on public.scout_challenge_participants(user_id, status);
create index scout_challenge_participants_challenge_idx on public.scout_challenge_participants(challenge_id, status);
alter table public.scout_challenge_participants enable row level security;
grant select on public.scout_challenge_participants to authenticated;

-- Preserve the original one-to-one challenges and any submitted activities.
insert into public.scout_challenge_participants(challenge_id, user_id, status, activity_id)
select id, challenged_id,
       case status when 'approved' then 'won' when 'submitted' then 'submitted' when 'rejected' then 'rejected' else 'open' end,
       activity_id
from public.scout_challenges
where challenged_id is not null
on conflict (challenge_id, user_id) do nothing;

update public.scout_challenges
set winner_id = case when status = 'approved' then challenged_id else null end,
    status = case status when 'approved' then 'completed' when 'rejected' then 'cancelled' else 'open' end,
    sport = coalesce(sport, 'velo'),
    manual_validation = true;
alter table public.scout_challenges alter column sport set not null;

alter table public.scout_challenges
  add constraint scout_challenges_status_check check (status in ('open','completed','cancelled')),
  add constraint scout_challenges_sport_check check (sport in ('velo','course','marche')),
  add constraint scout_challenges_target_km_check check (target_km is null or target_km > 0),
  add constraint scout_challenges_target_elevation_check check (target_elevation is null or target_elevation > 0),
  add constraint scout_challenges_requirements_check check (
    (manual_validation and gpx_template_path is not null and target_km is null and target_elevation is null and exact_distance = false)
    or (manual_validation and gpx_template_path is null and target_km is null and target_elevation is null)
    or (not manual_validation and gpx_template_path is null
      and (target_km is not null or target_elevation is not null)
      and (not exact_distance or target_km is not null))
  ) not valid;

create or replace function public.can_read_scout_challenge(_challenge_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null and exists (
    select 1 from public.scout_challenges c
    where c.id = _challenge_id and (
      c.challenger_id = auth.uid()
      or exists (select 1 from public.scout_challenge_participants p where p.challenge_id = c.id and p.user_id = auth.uid())
    )
  );
$$;
revoke execute on function public.can_read_scout_challenge(uuid) from public, anon;
grant execute on function public.can_read_scout_challenge(uuid) to authenticated;

drop policy if exists "scout challenges read participants or admin" on public.scout_challenges;
create policy "scout challenges read participants or admin" on public.scout_challenges
  for select to authenticated using (
    public.can_read_scout_challenge(id)
    or (select public.has_role((select auth.uid()), 'admin'))
  );
drop policy if exists "scout challenges create as self" on public.scout_challenges;
drop policy if exists "staff validates scout challenges" on public.scout_challenges;
create policy "staff manages scout challenges" on public.scout_challenges
  for update to authenticated using ((select public.has_role((select auth.uid()), 'admin')))
  with check ((select public.has_role((select auth.uid()), 'admin')));
create policy "participants read their challenge entries" on public.scout_challenge_participants
  for select to authenticated using (
    user_id = (select auth.uid()) or public.can_read_scout_challenge(challenge_id)
    or (select public.has_role((select auth.uid()), 'admin'))
  );

create or replace function public.create_scout_challenge(
  _title text,
  _description text,
  _proposed_points integer,
  _sport text,
  _target_km numeric,
  _exact_distance boolean,
  _target_elevation integer,
  _gpx_template_path text,
  _participant_ids uuid[]
)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
begin
  if v_user is null then raise exception 'Connexion requise'; end if;
  if char_length(trim(coalesce(_title,''))) not between 3 and 120 then raise exception 'Titre invalide'; end if;
  if _proposed_points not between 1 and 1000 then raise exception 'Points invalides'; end if;
  if _sport not in ('velo','course','marche') then raise exception 'Type d’activité invalide'; end if;
  if coalesce(cardinality(_participant_ids),0) not between 1 and 50
     or v_user = any(_participant_ids)
     or cardinality(_participant_ids) <> (select count(distinct x) from unnest(_participant_ids) x) then
    raise exception 'Sélectionne entre 1 et 50 scouts différents';
  end if;
  if _gpx_template_path is not null then
    if _target_km is not null or _target_elevation is not null or coalesce(_exact_distance,false)
       or left(_gpx_template_path, length(v_user::text || '_challenge_')) <> (v_user::text || '_challenge_')
       or right(_gpx_template_path, 4) <> '.gpx' then
      raise exception 'Défi GPX invalide';
    end if;
  elsif (_target_km is null and _target_elevation is null)
     or (_target_km is not null and (_target_km <= 0 or _target_km > 1000))
     or (_target_elevation is not null and (_target_elevation <= 0 or _target_elevation > 20000))
     or (_target_km is null and coalesce(_exact_distance,false)) then
    raise exception 'Le défi doit demander une distance, un D+ ou les deux';
  end if;

  insert into public.scout_challenges(challenger_id, challenged_id, title, description, proposed_points, status,
    sport, target_km, exact_distance, target_elevation, gpx_template_path, manual_validation)
  values (v_user, null, trim(_title), nullif(trim(coalesce(_description,'')),''), _proposed_points, 'open',
    _sport, _target_km, coalesce(_exact_distance,false), _target_elevation, _gpx_template_path, _gpx_template_path is not null)
  returning id into v_id;

  insert into public.scout_challenge_participants(challenge_id, user_id)
  select v_id, x from unnest(_participant_ids) x;
  return v_id;
end;
$$;
revoke execute on function public.create_scout_challenge(text,text,integer,text,numeric,boolean,integer,text,uuid[]) from public, anon;
grant execute on function public.create_scout_challenge(text,text,integer,text,numeric,boolean,integer,text,uuid[]) to authenticated;

create or replace function public.link_scout_challenge_to_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_challenge public.scout_challenges;
  v_participant public.scout_challenge_participants;
  v_sport text;
begin
  if new.challenge_id is null then return new; end if;
  select * into v_challenge from public.scout_challenges where id = new.challenge_id for update;
  if not found then raise exception 'Ce défi n’existe plus'; end if;
  select * into v_participant from public.scout_challenge_participants
    where challenge_id = v_challenge.id and user_id = new.user_id for update;
  if v_challenge.status <> 'open' then
    if tg_op = 'UPDATE' and found and v_participant.activity_id = new.id then return new; end if;
    raise exception 'Ce défi n’est plus disponible';
  end if;
  if not found or v_participant.status not in ('open','submitted')
     or (v_participant.activity_id is not null and v_participant.activity_id <> new.id) then
    raise exception 'Tu ne participes pas à ce défi ou tu as déjà envoyé une sortie';
  end if;

  v_sport := case when coalesce(new.note,'') ~* '^\[(course|course_a_pied|run|running)\]' then 'course'
                  when coalesce(new.note,'') ~* '^\[(marche|walk|rando)\]' then 'marche' else 'velo' end;
  if v_sport <> v_challenge.sport then raise exception 'Le type d’activité ne correspond pas au défi'; end if;
  if v_challenge.gpx_template_path is not null then
    if new.gpx_path is null then raise exception 'Ajoute le tracé GPX pour ce défi'; end if;
  else
    if v_challenge.target_km is not null and
       ((v_challenge.exact_distance and new.km <> v_challenge.target_km)
         or (not v_challenge.exact_distance and new.km < v_challenge.target_km)) then
      raise exception 'La distance ne correspond pas au défi';
    end if;
    if v_challenge.target_elevation is not null and coalesce(new.elevation_m,0) < v_challenge.target_elevation then
      raise exception 'Le D+ ne correspond pas au défi';
    end if;
  end if;

  update public.scout_challenge_participants set status = 'submitted', activity_id = new.id where id = v_participant.id;
  if new.status = 'approved' and not v_challenge.manual_validation then
    update public.scout_challenges set status = 'completed', winner_id = new.user_id,
      awarded_points = proposed_points, validated_at = now(), activity_id = new.id
      where id = v_challenge.id and status = 'open';
    if found then
      update public.scout_challenge_participants set status = case when id = v_participant.id then 'won' else 'lost' end
        where challenge_id = v_challenge.id;
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists trg_link_scout_challenge_to_activity on public.activities;
create trigger trg_link_scout_challenge_to_activity after insert or update of status on public.activities
  for each row execute function public.link_scout_challenge_to_activity();
revoke execute on function public.link_scout_challenge_to_activity() from public, anon, authenticated;

create or replace function public.reopen_deleted_scout_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.scout_challenge_participants
     set activity_id = null, status = 'open'
   where activity_id = old.id and status = 'submitted';
  return old;
end;
$$;
drop trigger if exists trg_reopen_deleted_scout_challenge on public.activities;
create trigger trg_reopen_deleted_scout_challenge before delete on public.activities
  for each row execute function public.reopen_deleted_scout_challenge();
revoke execute on function public.reopen_deleted_scout_challenge() from public, anon, authenticated;

create or replace function public.review_scout_challenge_entry(_participant_id uuid, _approve boolean, _awarded_points integer default null)
returns void language plpgsql security definer set search_path = public as $$
declare
  v_participant public.scout_challenge_participants;
  v_challenge public.scout_challenges;
begin
  if auth.uid() is null or not public.has_role(auth.uid(), 'admin') then raise exception 'Réservé au staff'; end if;
  select * into v_participant from public.scout_challenge_participants where id = _participant_id for update;
  if not found or v_participant.status <> 'submitted' then raise exception 'Ce défi n’est plus en attente'; end if;
  select * into v_challenge from public.scout_challenges where id = v_participant.challenge_id for update;
  if v_challenge.status <> 'open' or not v_challenge.manual_validation then raise exception 'Ce défi ne requiert pas cette validation'; end if;
  if _approve and not exists (select 1 from public.activities a where a.id = v_participant.activity_id and a.status = 'approved') then
    raise exception 'La sortie doit d’abord être validée';
  end if;
  if _approve then
    if coalesce(_awarded_points, v_challenge.proposed_points) not between 0 and 1000 then raise exception 'Points invalides'; end if;
    update public.scout_challenges set status='completed', winner_id=v_participant.user_id,
      awarded_points=coalesce(_awarded_points, proposed_points), validated_at=now(), activity_id=v_participant.activity_id
      where id=v_challenge.id;
    update public.scout_challenge_participants set status=case when id=v_participant.id then 'won' else 'lost' end
      where challenge_id=v_challenge.id;
  else
    update public.scout_challenge_participants set status='open', activity_id=null where id=v_participant.id;
    update public.activities set challenge_id=null where id=v_participant.activity_id;
  end if;
end;
$$;
revoke execute on function public.review_scout_challenge_entry(uuid,boolean,integer) from public, anon;
grant execute on function public.review_scout_challenge_entry(uuid,boolean,integer) to authenticated;

create or replace function public.scout_challenge_leaderboard()
returns table(user_id uuid, display_name text, patrol_name text, points bigint, challenges_won bigint)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.totem,''), public.public_display_name(p.full_name), 'Scout'), pt.name,
         sum(c.awarded_points)::bigint, count(*)::bigint
  from public.scout_challenges c
  join public.profiles p on p.id = c.winner_id
  left join public.patrols pt on pt.id = p.patrol_id
  where c.status = 'completed' and c.awarded_points > 0
  group by p.id, p.totem, p.full_name, pt.name
  order by sum(c.awarded_points) desc, count(*) desc,
           coalesce(nullif(p.totem,''), public.public_display_name(p.full_name))
$$;
revoke execute on function public.scout_challenge_leaderboard() from public;
grant execute on function public.scout_challenge_leaderboard() to anon, authenticated;
