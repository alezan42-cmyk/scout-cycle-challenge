-- Le nom du cheval est désormais fixe : Alezouille.
-- Retire les données du vote et ses seuls points d'accès associés.
drop function if exists public.alezan_name_vote_members();
drop table if exists public.alezan_name_votes;
drop table if exists public.alezan_name_suggestions;
