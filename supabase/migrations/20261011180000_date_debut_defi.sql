-- =====================================================================
-- Début du défi : le 27 septembre 2026
--
-- Les sorties datées d'avant (tests) sont supprimées, puis la base refuse
-- toute sortie ou sortie à plusieurs datée avant le 27/09/2026, même pour
-- un admin. Les photos éventuelles de ces sorties deviennent des fichiers
-- orphelins effacés par le ménage de nuit après 7 jours.
-- =====================================================================

delete from public.activities where ride_date < date '2026-09-27';
delete from public.group_rides where ride_date < date '2026-09-27';

alter table public.activities drop constraint if exists activities_date_debut_defi;
alter table public.activities
  add constraint activities_date_debut_defi check (ride_date >= date '2026-09-27');

alter table public.group_rides drop constraint if exists group_rides_date_debut_defi;
alter table public.group_rides
  add constraint group_rides_date_debut_defi check (ride_date >= date '2026-09-27');
