-- Défis individuels entre scouts. Les points ne sont crédités qu'après validation du staff.
create table public.scout_challenges (
  id uuid primary key default gen_random_uuid(),
  challenger_id uuid not null references public.profiles(id) on delete cascade,
  challenged_id uuid not null references public.profiles(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 3 and 100),
  description text not null check (char_length(btrim(description)) between 3 and 600),
  proposed_points integer not null check (proposed_points between 1 and 100),
  status text not null default 'pending'
    check (status in ('pending', 'accepted', 'declined', 'submitted', 'approved', 'rejected')),
  completion_note text,
  awarded_points integer check (awarded_points between 1 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  accepted_at timestamptz,
  submitted_at timestamptz,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  constraint scout_challenges_different_scouts check (challenger_id <> challenged_id),
  constraint scout_challenges_award_state check (
    (status = 'approved' and awarded_points is not null and reviewed_at is not null)
    or (status <> 'approved' and awarded_points is null)
  )
);

create index scout_challenges_challenger_created_idx
  on public.scout_challenges (challenger_id, created_at desc);
create index scout_challenges_challenged_created_idx
  on public.scout_challenges (challenged_id, created_at desc);
create index scout_challenges_submitted_idx
  on public.scout_challenges (submitted_at desc) where status = 'submitted';
create index scout_challenges_approved_recipient_idx
  on public.scout_challenges (challenged_id) where status = 'approved';

alter table public.scout_challenges enable row level security;
revoke all on public.scout_challenges from anon, authenticated;
grant select on public.scout_challenges to authenticated;

create policy "scouts and staff read relevant challenges"
  on public.scout_challenges for select to authenticated
  using (
    challenger_id = (select auth.uid())
    or challenged_id = (select auth.uid())
    or public.has_role((select auth.uid()), 'admin')
  );

create or replace function public.create_scout_challenge(
  _challenged_id uuid,
  _title text,
  _description text,
  _proposed_points integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  new_id uuid;
begin
  if actor is null then raise exception using errcode = '42501', message = 'Connexion requise'; end if;
  if _challenged_id is null or _challenged_id = actor then
    raise exception using errcode = '22023', message = 'Choisis un autre scout';
  end if;
  if char_length(btrim(coalesce(_title, ''))) not between 3 and 100 then
    raise exception using errcode = '22023', message = 'Le titre doit faire entre 3 et 100 caractères';
  end if;
  if char_length(btrim(coalesce(_description, ''))) not between 3 and 600 then
    raise exception using errcode = '22023', message = 'La description doit faire entre 3 et 600 caractères';
  end if;
  if _proposed_points is null or _proposed_points not between 1 and 100 then
    raise exception using errcode = '22023', message = 'Les points proposés doivent être entre 1 et 100';
  end if;
  if not exists (select 1 from public.profiles where id = _challenged_id) then
    raise exception using errcode = '22023', message = 'Scout introuvable';
  end if;

  insert into public.scout_challenges (challenger_id, challenged_id, title, description, proposed_points)
  values (actor, _challenged_id, btrim(_title), btrim(_description), _proposed_points)
  returning id into new_id;
  return new_id;
end;
$$;

create or replace function public.respond_scout_challenge(_challenge_id uuid, _accept boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  challenge public.scout_challenges%rowtype;
begin
  if actor is null then raise exception using errcode = '42501', message = 'Connexion requise'; end if;
  select * into challenge from public.scout_challenges where id = _challenge_id for update;
  if not found or challenge.challenged_id <> actor then
    raise exception using errcode = '42501', message = 'Ce défi ne t’est pas destiné';
  end if;
  if challenge.status <> 'pending' then
    raise exception using errcode = '22023', message = 'Ce défi ne peut plus recevoir de réponse';
  end if;
  update public.scout_challenges
  set status = case when _accept then 'accepted' else 'declined' end,
      accepted_at = case when _accept then now() else null end,
      updated_at = now()
  where id = challenge.id;
end;
$$;

create or replace function public.submit_scout_challenge(_challenge_id uuid, _completion_note text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  challenge public.scout_challenges%rowtype;
begin
  if actor is null then raise exception using errcode = '42501', message = 'Connexion requise'; end if;
  select * into challenge from public.scout_challenges where id = _challenge_id for update;
  if not found or challenge.challenged_id <> actor then
    raise exception using errcode = '42501', message = 'Ce défi ne t’est pas destiné';
  end if;
  if challenge.status <> 'accepted' then
    raise exception using errcode = '22023', message = 'Seul un défi accepté peut être soumis';
  end if;
  if char_length(coalesce(_completion_note, '')) > 600 then
    raise exception using errcode = '22023', message = 'Le commentaire est trop long';
  end if;
  update public.scout_challenges
  set status = 'submitted',
      completion_note = nullif(btrim(coalesce(_completion_note, '')), ''),
      submitted_at = now(),
      updated_at = now()
  where id = challenge.id;
end;
$$;

create or replace function public.review_scout_challenge(
  _challenge_id uuid,
  _approve boolean,
  _awarded_points integer default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  challenge public.scout_challenges%rowtype;
begin
  if actor is null or not public.has_role(actor, 'admin') then
    raise exception using errcode = '42501', message = 'Validation réservée au staff';
  end if;
  select * into challenge from public.scout_challenges where id = _challenge_id for update;
  if not found or challenge.status <> 'submitted' then
    raise exception using errcode = '22023', message = 'Ce défi n’est pas en attente de validation';
  end if;
  if _approve and (_awarded_points is null or _awarded_points not between 1 and 100) then
    raise exception using errcode = '22023', message = 'Les points attribués doivent être entre 1 et 100';
  end if;
  update public.scout_challenges
  set status = case when _approve then 'approved' else 'rejected' end,
      awarded_points = case when _approve then _awarded_points else null end,
      reviewed_by = actor,
      reviewed_at = now(),
      updated_at = now()
  where id = challenge.id;
end;
$$;

-- Ne renvoie que le total par scout, sans exposer les détails des défis aux autres membres.
create or replace function public.scout_challenge_leaderboard()
returns table(user_id uuid, points bigint)
language sql
stable
security definer
set search_path = ''
as $$
  select c.challenged_id, sum(c.awarded_points)::bigint
  from public.scout_challenges c
  where (select auth.uid()) is not null and c.status = 'approved'
  group by c.challenged_id
  order by sum(c.awarded_points) desc, c.challenged_id;
$$;

revoke all on function public.create_scout_challenge(uuid, text, text, integer) from public, anon;
revoke all on function public.respond_scout_challenge(uuid, boolean) from public, anon;
revoke all on function public.submit_scout_challenge(uuid, text) from public, anon;
revoke all on function public.review_scout_challenge(uuid, boolean, integer) from public, anon;
revoke all on function public.scout_challenge_leaderboard() from public, anon;
grant execute on function public.create_scout_challenge(uuid, text, text, integer) to authenticated;
grant execute on function public.respond_scout_challenge(uuid, boolean) to authenticated;
grant execute on function public.submit_scout_challenge(uuid, text) to authenticated;
grant execute on function public.review_scout_challenge(uuid, boolean, integer) to authenticated;
grant execute on function public.scout_challenge_leaderboard() to authenticated;
