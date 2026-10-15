-- =====================================================================
-- Check-up sécurité (octobre 2026) — aucun effacement de données.
-- 1. Bucket « proofs » : taille max 15 Mo et types de fichiers autorisés
--    (photos et GPX seulement ; pas de SVG/HTML, qui pourraient contenir du script).
-- 2. Vote du nom du cheval : les visiteurs sans compte voient les noms et le
--    nombre de voix, mais plus l'identifiant de qui a voté / proposé.
-- 3. search_path fixé sur deux fonctions (avertissement Supabase).
-- 4. Index sur les clés étrangères les plus utilisées (classements plus rapides).
-- =====================================================================

-- 1. Fichiers de preuve
update storage.buckets
set file_size_limit = 15728640,
    allowed_mime_types = array[
      'image/jpeg','image/png','image/webp','image/heic','image/heif','image/gif','image/avif',
      'application/gpx+xml'
    ]
where id = 'proofs';

-- 2. Vote : colonnes visibles par les visiteurs
do $$ begin
  if to_regclass('public.alezan_name_votes') is not null then
    revoke select on public.alezan_name_votes from anon;
    grant select (id, suggestion_id) on public.alezan_name_votes to anon;
  end if;
  if to_regclass('public.alezan_name_suggestions') is not null then
    revoke select on public.alezan_name_suggestions from anon;
    grant select (id, name, created_at) on public.alezan_name_suggestions to anon;
  end if;
end $$;

-- 3. search_path
do $$ begin
  if to_regprocedure('public.activity_sport(text)') is not null then
    alter function public.activity_sport(text) set search_path = public;
  end if;
  if to_regprocedure('public.emails_valides(text[])') is not null then
    alter function public.emails_valides(text[]) set search_path = public;
  end if;
end $$;

-- 4. Index
create index if not exists activities_user_id_idx on public.activities (user_id);
create index if not exists profiles_patrol_id_idx on public.profiles (patrol_id);
create index if not exists activity_corrections_admin_id_idx on public.activity_corrections (admin_id);
