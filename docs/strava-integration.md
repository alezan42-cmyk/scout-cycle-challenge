# Intégration Strava

## Ce que prépare cette branche

- Le profil peut lancer une autorisation Strava OAuth avec le scope minimal `activity:read`.
- Les jetons d’accès et de renouvellement restent dans `strava_connections`, table sans accès navigateur.
- Le webhook vérifie le jeton de souscription, accuse réception rapidement, puis traite les événements en arrière-plan.
- Les activités prises en charge sont importées une seule fois grâce à l’identifiant Strava unique. Les activités supprimées ou rendues privées sont retirées de la copie du site.
- Le bouton public de l’accueil renvoie au club de la Troupe de l’Alezan.

## À configurer après validation de l’application Strava

Définir dans les secrets Supabase :

- `STRAVA_CLIENT_ID`
- `STRAVA_CLIENT_SECRET`
- `STRAVA_REDIRECT_URI` = `https://<project-ref>.supabase.co/functions/v1/strava-oauth`
- `STRAVA_WEBHOOK_VERIFY_TOKEN` = une valeur aléatoire longue
- `STRAVA_WEBHOOK_SUBSCRIPTION_ID` = l’identifiant obtenu à la création de la souscription
- `SITE_URL` = `https://alezan42-cycling.pages.dev`

Puis appliquer la migration, déployer `strava-oauth` et `strava-webhook`, et enregistrer auprès de Strava l’URL `https://<project-ref>.supabase.co/functions/v1/strava-webhook` avec le même jeton de vérification.

## Limites liées à Strava

Le lien vers le club promeut la communauté, mais ne donne pas au site accès aux activités des membres. Chaque scout doit associer son propre compte et autoriser l’accès. L’import automatique démarre à la réception des prochains événements ; cette première version ne récupère pas l’historique. Les activités accessibles par `activity:read` sont celles visibles par l’athlète et ses abonnés, selon les réglages de confidentialité Strava.

Une souscription Strava requiert une application API et une callback joignable. Tant que Strava n’a pas accordé l’accès demandé, le flux ne peut pas être activé. Ne jamais ajouter le secret client ou des jetons dans le dépôt.
