-- Match the indexes to the challenge participant lookups and avoid indexing
-- activities.challenge_id twice (its UNIQUE constraint already has an index).
drop index if exists public.activities_challenge_id_idx;
create index if not exists scout_challenges_challenger_id_idx
  on public.scout_challenges(challenger_id);

drop policy if exists "scout challenges read participants or admin" on public.scout_challenges;
create policy "scout challenges read participants or admin"
  on public.scout_challenges for select to authenticated
  using (
    (select auth.uid()) = challenger_id
    or (select auth.uid()) = challenged_id
    or (select public.has_role((select auth.uid()), 'admin'))
  );

drop policy if exists "scout challenges create as self" on public.scout_challenges;
create policy "scout challenges create as self"
  on public.scout_challenges for insert to authenticated
  with check (
    (select auth.uid()) = challenger_id
    and challenged_id <> (select auth.uid())
    and status = 'open'
    and awarded_points is null
    and activity_id is null
  );

drop policy if exists "staff validates scout challenges" on public.scout_challenges;
create policy "staff validates scout challenges"
  on public.scout_challenges for update to authenticated
  using ((select public.has_role((select auth.uid()), 'admin')))
  with check ((select public.has_role((select auth.uid()), 'admin')));
