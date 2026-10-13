# Widget « Défi kilomètres » pour le site de l'unité

Fichier : `public/widget/alezan42-km.js`, publié avec le site à
`https://alezan42-cycling.lesscoutsdemoustier.be/widget/alezan42-km.js`.

## Code à coller sur le site de l'unité

```html
<div data-alezan42-km data-sections="total,patrouilles,scouts" data-period="semaine"></div>
<script src="https://alezan42-cycling.lesscoutsdemoustier.be/widget/alezan42-km.js" defer></script>
```

## Options

| Attribut | Valeurs | Défaut |
|---|---|---|
| `data-sections` | `total`, `patrouilles`, `scouts` (séparés par des virgules) | `total,patrouilles` |
| `data-period` | `semaine`, `mois`, `tout` | `semaine` |
| `data-limit` | nombre de lignes par classement (1 à 20) | `5` |
| `data-theme` | `clair`, `sombre` | `clair` |
| `data-titre` | texte libre | `Défi kilomètres ALEZAN 42` |

Plusieurs blocs peuvent être placés sur la même page ; le script n'est chargé qu'une fois.

## Données et vie privée

Le widget lit uniquement les vues publiques (`profiles_public`, `activities_public`, `patrols`)
avec la clé publique, comme un visiteur sans compte : km validés, patrouilles, totem ou
« Prénom I. ». Le classement « scouts » exclut le staff. Pas de cookie ; les données sont gardées
5 minutes dans le navigateur (sessionStorage). Style isolé (Shadow DOM) : le site hôte ne le casse pas.
