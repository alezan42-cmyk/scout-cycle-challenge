-- Notifie chaque scout ciblé lorsqu'un défi lui est attribué.
alter table public.app_notifications drop constraint if exists app_notifications_kind_check;
alter table public.app_notifications add constraint app_notifications_kind_check
  check (kind in (
    'weekly_reminder', 'distance_milestone', 'manual', 'new_signup',
    'individual_distance_milestone', 'troop_distance_milestone',
    'aquila_distance_milestone', 'activity_pending', 'challenge_received'
  ));

create or replace function public.notify_scout_challenge_participant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_challenge public.scout_challenges;
  v_sender text;
begin
  select * into v_challenge
    from public.scout_challenges
   where id = new.challenge_id;
  if not found then return new; end if;

  select coalesce(nullif(trim(totem), ''), nullif(trim(full_name), ''), 'Un scout')
    into v_sender
    from public.profiles
   where id = v_challenge.challenger_id;

  insert into public.app_notifications(user_id, kind, title, body, href, dedupe_key)
  values (
    new.user_id,
    'challenge_received',
    'Un nouveau défi t’attend',
    format('%s t’a lancé le défi « %s ». Retrouve-le dans la rubrique Défis.', coalesce(v_sender, 'Un scout'), v_challenge.title),
    '/app/defis',
    'challenge-received:' || new.challenge_id::text || ':' || new.user_id::text
  )
  on conflict (dedupe_key) do nothing;
  return new;
end;
$$;

drop trigger if exists trg_notify_scout_challenge_participant on public.scout_challenge_participants;
create trigger trg_notify_scout_challenge_participant
  after insert on public.scout_challenge_participants
  for each row execute function public.notify_scout_challenge_participant();

revoke execute on function public.notify_scout_challenge_participant() from public, anon, authenticated;
