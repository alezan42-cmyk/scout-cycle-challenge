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

## Taille automatique

Le widget prend toute la largeur de l'endroit où il est placé et adapte sa mise en page à cette largeur (et pas seulement à l'écran) :

- moins de 420 px (téléphone, colonne étroite) : version compacte, une colonne ;
- 420 à 640 px : une colonne confortable ;
- 640 px et plus (ordinateur) : classements côte à côte ;
- 900 px et plus : total à gauche, classements à droite.

La mise en page change en direct si la fenêtre est redimensionnée. Pour limiter la largeur, il suffit de placer le bloc dans un conteneur plus étroit.

Plusieurs blocs peuvent être placés sur la même page ; le script n'est chargé qu'une fois.

## Données et vie privée

Le widget lit uniquement les vues publiques (`profiles_public`, `activities_public`, `patrols`)
avec la clé publique, comme un visiteur sans compte : km validés, patrouilles, totem ou
« Prénom I. ». Le classement « scouts » exclut le staff. Pas de cookie ; les données sont gardées
5 minutes dans le navigateur (sessionStorage). Style isolé (Shadow DOM) : le site hôte ne le casse pas.
