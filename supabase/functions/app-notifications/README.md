# Notifications push de l’application

Cette fonction envoie les notifications préparées dans `app_notifications`, reçoit les abonnements PWA et crée le rappel hebdomadaire du dimanche à 9 h (heure de Bruxelles). Elle n’envoie aucun e-mail.

## Mise en service

1. Générer une paire VAPID avec `npx web-push generate-vapid-keys`.
2. Enregistrer les trois secrets dans le projet Supabase :

   ```sh
   supabase secrets set VAPID_PUBLIC_KEY="<clé publique>" VAPID_PRIVATE_KEY="<clé privée>" VAPID_SUBJECT="https://alezan42-cycling.pages.dev"
   ```

3. Déployer la fonction : `supabase functions deploy app-notifications`.
4. Appliquer la migration `20261014090000_notifications_app.sql`. Elle planifie le traitement chaque minute et dépend de la fonction déjà déployée.
5. Chaque scout active les notifications sur son appareil depuis l’icône cloche de l’application installée. Sur iPhone/iPad, l’app doit être ajoutée à l’écran d’accueil et l’autorisation est à accorder depuis l’application.

La clé publique est renvoyée par la fonction à l’application ; elle n’a pas à être ajoutée à la configuration de build du site. Ne jamais exposer la clé privée VAPID.
