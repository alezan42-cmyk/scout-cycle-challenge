-- Défis individuels lancés par un scout à un autre, avec points attribués par le staff.
create table public.scout_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references auth.users(id) on delete cascade,
  challenged_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text check (description is null or char_length(description) <= 500),
  proposed_points integer not null check (proposed_points between 1 and 1000),
  awarded_points integer check (awarded_points between 0 and 1000),
  status text not null default 'open' check (status in ('open','submitted','approved','rejected')),
  activity_id uuid unique references public.activities(id) on delete set null,
  created_at timestamptz not null default now(),
  validated_at timestamptz,
  constraint scout_challenges_distinct_scouts check (challenger_id <> challenged_id)
);
create index scout_challenges_target_status_idx on public.scout_challenges(challenged_id,status);
create index scout_challenges_status_idx on public.scout_challenges(status);
alter table public.scout_challenges enable row level security;
create policy "scout challenges read participants or admin" on public.scout_challenges for select to authenticated
  using (challenger_id = auth.uid() or challenged_id = auth.uid() or public.has_role(auth.uid(),'admin'));
create policy "scout challenges create as self" on public.scout_challenges for insert to authenticated
  with check (challenger_id = auth.uid() and challenged_id <> auth.uid() and status = 'open' and awarded_points is null and activity_id is null);
create policy "staff validates scout challenges" on public.scout_challenges for update to authenticated
  using (public.has_role(auth.uid(),'admin')) with check (public.has_role(auth.uid(),'admin'));
grant select,insert,update on public.scout_challenges to authenticated;

alter table public.activities add column challenge_id uuid unique references public.scout_challenges(id) on delete set null;
create index activities_challenge_id_idx on public.activities(challenge_id);

create or replace function public.link_scout_challenge_to_activity()
returns trigger language plpgsql security definer set search_path = public as $$
declare c public.scout_challenges;
begin
  if new.challenge_id is null then return new; end if;
  select * into c from public.scout_challenges where id = new.challenge_id for update;
  if not found or c.challenged_id <> new.user_id or c.status <> 'open' then
    raise exception 'Ce défi n’est pas disponible pour ce scout';
  end if;
  update public.scout_challenges set activity_id = new.id, status = 'submitted' where id = c.id;
  return new;
end;
$$;
create trigger trg_link_scout_challenge after insert on public.activities
for each row execute function public.link_scout_challenge_to_activity();

create or replace function public.prevent_activity_challenge_reassignment()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.challenge_id is distinct from old.challenge_id
     and not public.has_role(auth.uid(), 'admin') then
    raise exception 'Un défi ne peut pas être changé après son enregistrement';
  end if;
  return new;
end;
$$;
create trigger trg_prevent_activity_challenge_reassignment
before update of challenge_id on public.activities
for each row execute function public.prevent_activity_challenge_reassignment();

create or replace function public.scout_challenge_leaderboard()
returns table(user_id uuid, display_name text, patrol_name text, points bigint, challenges_won bigint)
language sql stable security definer set search_path = public as $$
  select p.id, coalesce(nullif(p.totem,''), public.public_display_name(p.full_name), 'Scout'), pt.name,
         sum(c.awarded_points)::bigint, count(*)::bigint
  from public.scout_challenges c
  join public.profiles p on p.id = c.challenged_id
  left join public.patrols pt on pt.id = p.patrol_id
  where c.status = 'approved' and c.awarded_points > 0
  group by p.id, p.totem, p.full_name, pt.name
  order by sum(c.awarded_points) desc, count(*) desc,
           coalesce(nullif(p.totem,''), public.public_display_name(p.full_name))
$$;
grant execute on function public.scout_challenge_leaderboard() to anon, authenticated;
