-- The multi-participant challenge migration adds its own activity trigger and
-- replaces the legacy handler. Remove the original trigger so the handler is
-- not called twice for a single activity submission.
drop trigger if exists trg_link_scout_challenge on public.activities;
