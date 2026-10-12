-- Let signed-in members see the public display names attached to each poll choice.
-- The function returns no email, birthday, or other profile data.
create or replace function public.alezan_name_vote_members()
returns table (suggestion_id uuid, voter_name text)
language sql
stable
security definer
set search_path = public
as $$
  select
    v.suggestion_id,
    coalesce(nullif(btrim(p.totem), ''), public.public_display_name(p.full_name), 'Scout')::text
  from public.alezan_name_votes v
  join public.profiles p on p.id = v.user_id
  where auth.uid() is not null
  order by voter_name, v.suggestion_id;
$$;

revoke all on function public.alezan_name_vote_members() from public, anon;
grant execute on function public.alezan_name_vote_members() to authenticated;
