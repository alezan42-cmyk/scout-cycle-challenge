-- These functions exist only as table triggers and are not browser RPC endpoints.
revoke execute on function public.link_scout_challenge_to_activity() from public, anon, authenticated;
revoke execute on function public.prevent_activity_challenge_reassignment() from public, anon, authenticated;
revoke execute on function public.scout_challenge_leaderboard() from public;
grant execute on function public.scout_challenge_leaderboard() to anon, authenticated;

-- If an unvalidated ride is removed, let the scout submit a different one for the same challenge.
create or replace function public.reopen_deleted_scout_challenge()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.scout_challenges
     set activity_id = null, status = 'open'
   where activity_id = old.id and status = 'submitted';
  return old;
end;
$$;
create trigger trg_reopen_deleted_scout_challenge
before delete on public.activities
for each row execute function public.reopen_deleted_scout_challenge();
revoke execute on function public.reopen_deleted_scout_challenge() from public, anon, authenticated;
