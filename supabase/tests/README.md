# Tests des migrations

Ces fichiers servent à tester les migrations sur un PostgreSQL **local**, jamais sur Supabase.

- `fixture_etat_actuel.sql` : reproduction minimale de la base en ligne (tables, règles d'accès, données de test).
- `test_*.sql` : scénarios (visiteur anonyme, scout, admin). Chaque test échoue avec une erreur si le comportement attendu n'est pas respecté.

```bash
createdb test_alezan
psql -d test_alezan -f supabase/tests/fixture_etat_actuel.sql
psql -d test_alezan -f supabase/migrations/20261007185900_vue_profils_publics.sql
psql -d test_alezan -f supabase/migrations/20261007190000_securite_acces.sql
# appliquer ensuite toutes les migrations dans l'ordre, puis :
psql -d test_alezan -c "create schema extensions; create extension pgcrypto schema extensions; alter table auth.users add column encrypted_password text, add column updated_at timestamptz;"
psql -d test_alezan -f supabase/tests/test_securite_acces.sql   # doit finir par "TOUS LES TESTS SONT PASSÉS"
psql -d test_alezan -f supabase/tests/test_pre_lancement.sql    # doit finir par "TOUS LES TESTS PRÉ-LANCEMENT SONT PASSÉS"
psql -d test_alezan -f supabase/tests/test_peloton.sql         # doit finir par "TOUS LES TESTS PELOTON SONT PASSÉS"
psql -d test_alezan -f supabase/tests/test_scout_sportif_mois.sql # doit finir par "TOUS LES TESTS SCOUT SPORTIF DU MOIS SONT PASSÉS"
psql -d test_alezan -f supabase/tests/test_anniversaires.sql    # doit finir par "TOUS LES TESTS ANNIVERSAIRES SONT PASSÉS"
psql -d test_alezan -f supabase/tests/test_theme_fetes.sql      # doit finir par "TOUS LES TESTS THÈME DE FÊTE SONT PASSÉS"
psql -d test_alezan -f supabase/tests/test_themes_calendrier_fonds.sql # doit finir par "TOUS LES TESTS THÈMES CALENDRIER ET FONDS SONT PASSÉS"
# (le test ci-dessus s'exécute avant la migration 20261009200000 ; appliquer ensuite cette migration, puis :)
psql -d test_alezan -f supabase/tests/test_themes_hiver_carnaval_sports.sql # doit finir par "TOUS LES TESTS THÈMES HIVER CARNAVAL SPORTS SONT PASSÉS"
psql -d test_alezan -f supabase/tests/test_menage_automatique.sql # doit finir par "TOUS LES TESTS MÉNAGE SONT PASSÉS"
psql -d test_alezan -f supabase/tests/test_marche.sql          # doit finir par "TOUS LES TESTS MARCHE SONT PASSÉS"
```
