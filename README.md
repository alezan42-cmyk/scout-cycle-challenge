# Scout Cycle Challenge — ALEZAN 42

Concours de vélo entre patrouilles scoutes pour déterminer qui parcourt le plus de kilomètres chaque semaine, centré autour de la région de **Moustier-sur-Sambre** et **Jemeppe-sur-Sambre**.

## 🚀 Fonctionnalités Clés

- **Authentification & Profils Scouts :** Connexion sécurisée, choix de la patrouille, saisie du totem, de la quali, de l'année scout (1ʳᵉ à 4ᵉ année) ou du statut Staff, ainsi que du profil Strava.
- **Classement par Catégories :** Visualisation des kilomètres parcourus (vélo et course à pied) filtrables par patrouille et par catégorie (Garçons, Filles, Staff / Mixte).
- **Cartographie Interactive & GPX :** 
  - Page dédiée (`/carte`) sécurisée pour les membres connectés.
  - Visualisation en temps réel des traces GPX (sorties réalisées et propositions de sorties).
  - **Confidentialité renforcée :** Masquage automatique des 200 premiers et derniers mètres des traces.
  - Centrage dynamique et zoom automatique sur un parcours au clic.
- **Comptes à Rebours Multiples :** Gestion dynamique de plusieurs échéances de la troupe (grand camp, fin du défi, rassemblements) directement configurables depuis l'interface ou le panneau d'administration et synchronisées via Supabase.
- **Panneau d'Administration (`/admin`) :** 
  - Réservé aux administrateurs (ex: `baudeletgauthier@gmail.com`).
  - Validation ou refus des captures d'écran de preuves de sorties.
  - Gestion des patrouilles et des rôles des membres.

---

## 🛠️ Stack Technique

- **Frontend :** React, TypeScript, Tailwind CSS, TanStack Router (`src/routes/`), Lucide Icons.
- **Backend & Base de Données :** Supabase (Tables : `profiles`, `activities`, `patrols`, `countdowns`, `proposed_routes` + Stockage bucket `proofs`).
- **Cartographie :** Leaflet (chargement dynamique via CDN) et OpenStreetMap.

---

## 📱 Installer sur un téléphone

Le site peut aussi être installé comme une application (PWA), sans passer par l’App Store ou Google Play. Il reste accessible dans un navigateur et l’application installée utilise le même compte et les mêmes données.

- **iPhone/iPad :** ouvre le site dans Safari, touche **Partager** → **Sur l’écran d’accueil**. Active **Ouvrir comme app web** si l’option apparaît, puis touche **Ajouter**.
- **Android :** ouvre le site dans Chrome, touche **⋮** → **Installer l’application** (ou **Installer et créer un raccourci**), puis confirme.

Le bouton **Installer** dans l’en-tête affiche ces étapes. Une connexion Internet reste nécessaire pour les comptes, les kilomètres et les classements.

## 💻 Développement Local

Pour travailler en local sur le projet :

1. Installer [Git](https://git-scm.com), [Node.js 22](https://nodejs.org) et [VS Code](https://code.visualstudio.com).
2. Cloner le dépôt :
   ```bash
   git clone https://github.com/Gauthierbdlt/scout-cycle-challenge.git
   cd scout-cycle-challenge
   ```
3. Installer les dépendances :
   ```bash
   npm install
   ```
4. Créer son fichier `.env` local à partir de `.env.example` et y mettre l'URL et la clé *publishable* du projet Supabase
   (Supabase → Project Settings → API). Ce fichier n'est **jamais** envoyé sur GitHub.
5. Lancer le site en local :
   ```bash
   npm run dev
   ```
   puis ouvrir http://localhost:3000.

> Le dossier `data/` sert uniquement de cache local en développement. Il est ignoré par Git
> pour éviter les conflits entre nos deux machines. Les vraies données sont dans Supabase.

---

## 🤝 Travailler à deux

La branche `main` = le site en ligne. On n'y travaille jamais directement.

1. Se mettre à jour avant de commencer :
   ```bash
   git checkout main
   git pull
   ```
2. Créer une branche pour sa modification :
   ```bash
   git checkout -b nom-de-la-modif
   ```
3. Travailler, puis enregistrer et envoyer :
   ```bash
   git add .
   git commit -m "Ce que j'ai changé"
   git push -u origin nom-de-la-modif
   ```
4. Sur GitHub, ouvrir une *Pull Request* vers `main`. L'autre relit (Cloudflare fournit une URL de
   prévisualisation pour tester), puis on fusionne. Le site se met à jour automatiquement.

Règles simples : une branche par sujet, des Pull Requests petites, et on prévient l'autre si on
touche aux mêmes fichiers.

---

## 🌍 Mise en ligne (Cloudflare Pages)

Le site est **100 % statique** : toute la logique tourne dans le navigateur et parle directement à
Supabase. La sécurité est assurée par les règles RLS de la base, pas par un serveur.

Réglages du projet Cloudflare Pages :

| Réglage | Valeur |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `.output/public` |
| Variable d'environnement | `NODE_VERSION` = `22` |
| Variables d'environnement | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_SUPABASE_PROJECT_ID` |

Après la première mise en ligne, ajouter l'adresse du site dans Supabase →
Authentication → URL Configuration (*Site URL* et *Redirect URLs*).
