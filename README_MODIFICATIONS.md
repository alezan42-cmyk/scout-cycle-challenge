# Pack de modifications : Scout Sportif & Scout d'Honneur (v2)

Ce pack est directement structuré selon l'arborescence standard d'un projet React + Supabase (avec le dossier `supabase/migrations/`).

## Arborescence du Pack

```
.
├── supabase/
│   └── migrations/
│       └── 20261105000000_add_scout_sportif_and_honneur.sql
├── src/
│   ├── types/
│   │   └── scout.ts
│   ├── utils/
│   │   └── leaderboard.ts
│   └── components/
│       ├── LeaderboardMaillotJaune.tsx
│       └── admin/
│           └── AdminScoutSportif.tsx
└── README_MODIFICATIONS.md
```

## Instructions d'installation

1. **Migration Supabase** :
   - Le fichier `supabase/migrations/20261105000000_add_scout_sportif_and_honneur.sql` se trouve désormais à son emplacement standard Supabase.
   - Vous pouvez exécuter son contenu dans le **SQL Editor** de Supabase ou appliquer la migration via Supabase CLI (`npx supabase db push`).

2. **Code React / TypeScript** :
   - Déposez le dossier `src/` à la racine de votre projet GitHub pour ajouter/mettre à jour les composants et utilitaires.
