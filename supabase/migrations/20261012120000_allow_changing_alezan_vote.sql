-- Allow each signed-in member to change the name they voted for, without
-- allowing them to transfer or otherwise edit another member's vote.
grant update (suggestion_id) on table public.alezan_name_votes to authenticated;

drop policy if exists "alezan_name_votes_change_own_vote" on public.alezan_name_votes;
create policy "alezan_name_votes_change_own_vote"
  on public.alezan_name_votes
  for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
