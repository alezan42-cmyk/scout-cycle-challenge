# Notifications push de l’application

La fonction envoie les notifications inscrites dans `app_notifications`, reçoit les abonnements PWA et crée un rappel le dimanche à 9 h (heure de Bruxelles). Les passages de paliers de 500 km sont ajoutés par un trigger SQL. Le staff peut envoyer et supprimer des messages ciblés depuis Administration → Notifications. Aucun e-mail n’est envoyé et aucun fournisseur push tiers payant n’est nécessaire.

## Mise en service après fusion

1. Générer une paire VAPID sur un poste de confiance avec `npx web-push generate-vapid-keys`.
2. Enregistrer les clés dans les secrets du projet Supabase (Dashboard → Edge Functions → Secrets ou Supabase CLI) :

   ```sh
   supabase secrets set VAPID_PUBLIC_KEY="<clé publique>" VAPID_PRIVATE_KEY="<clé privée>" VAPID_SUBJECT="https://alezan42-cycling.lesscoutsdemoustier.be"
   ```

   Garder la clé privée secrète. Le sujet peut être l’URL publique du site.

3. Déployer la fonction Edge : `supabase functions deploy app-notifications`.
4. Appliquer `supabase/migrations/20261020190000_app_push_notifications.sql` dans Supabase. La migration crée/réactive les tables et le trigger de paliers, puis planifie l’envoi chaque minute. Elle utilise la clé cron déjà configurée pour la fonction de ménage.
5. Dans l’application installée, chaque scout ouvre la cloche et appuie sur « Activer les notifications » sur chaque appareil. Sur iPhone/iPad, il faut d’abord ajouter l’app à l’écran d’accueil ; l’autorisation doit être demandée depuis l’app installée.

Le service worker affiche les notifications et ouvre leur destination lorsque l’utilisateur appuie dessus. La clé publique est fournie à l’application par la fonction ; elle n’a pas besoin d’être intégrée au build du site.
