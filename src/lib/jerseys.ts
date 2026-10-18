/**
 * Maillots du défi, calculés pour chaque catégorie (Garçons, Filles, Staff) :
 * - maillot jaune : le plus de kilomètres ;
 * - maillot à pois (grimpeur) : le plus de dénivelé positif (D+) ;
 * - maillot blanc (meilleur jeune) : le plus de kilomètres parmi les scouts de
 *   1re et 2e année (Garçons et Filles uniquement, jamais le staff).
 *
 * Seules les sorties validées sont comptées (le calcul reçoit des totaux déjà filtrés
 * par période, sport et statut).
 */

export type JerseyCategory = "homme" | "femme" | "staff";

export const JERSEY_CATEGORIES: JerseyCategory[] = ["homme", "femme", "staff"];

export interface JerseyCandidate {
  user_id: string;
  display_name: string;
  patrol_name: string;
  category: string;
  is_chef?: boolean;
  scout_year?: number | null | undefined;
  km: number;
  dplus: number;
}

export interface JerseyHolders {
  yellow: JerseyCandidate | null;
  climber: JerseyCandidate | null;
  /** Maillot blanc : meilleur 1re/2e année (toujours null pour le staff) */
  white: JerseyCandidate | null;
}

/** Années qui peuvent porter le maillot blanc */
export const WHITE_JERSEY_YEARS = [1, 2];

export const isWhiteJerseyEligible = (c: Pick<JerseyCandidate, "scout_year">) =>
  WHITE_JERSEY_YEARS.includes(Number(c.scout_year));

/** Catégorie de maillot d'un participant : le staff a ses propres maillots. */
export function jerseyCategoryOf(c: Pick<JerseyCandidate, "category" | "is_chef">): JerseyCategory {
  if (c.is_chef || c.category === "staff") return "staff";
  return c.category === "femme" ? "femme" : "homme";
}

function best(
  list: JerseyCandidate[],
  main: (c: JerseyCandidate) => number,
  tieBreak: (c: JerseyCandidate) => number,
): JerseyCandidate | null {
  let winner: JerseyCandidate | null = null;
  for (const c of list) {
    if (!(main(c) > 0)) continue;
    if (
      !winner ||
      main(c) > main(winner) ||
      (main(c) === main(winner) && tieBreak(c) > tieBreak(winner)) ||
      (main(c) === main(winner) &&
        tieBreak(c) === tieBreak(winner) &&
        c.display_name.localeCompare(winner.display_name, "fr") < 0)
    ) {
      winner = c;
    }
  }
  return winner;
}

/**
 * Détenteurs des maillots par catégorie.
 * En cas d'égalité : départage par l'autre critère (D+ pour le jaune, km pour le
 * grimpeur), puis par ordre alphabétique pour que le résultat soit stable.
 */
export function computeJerseys(
  candidates: JerseyCandidate[],
): Record<JerseyCategory, JerseyHolders> {
  const result = {} as Record<JerseyCategory, JerseyHolders>;
  for (const cat of JERSEY_CATEGORIES) {
    const inCat = candidates.filter((c) => jerseyCategoryOf(c) === cat);
    result[cat] = {
      yellow: best(
        inCat,
        (c) => c.km,
        (c) => c.dplus,
      ),
      climber: best(
        inCat,
        (c) => c.dplus,
        (c) => c.km,
      ),
      white:
        cat === "staff"
          ? null
          : best(
              inCat.filter(isWhiteJerseyEligible),
              (c) => c.km,
              (c) => c.dplus,
            ),
    };
  }
  return result;
}

/** Valeur de D+ saisie dans le formulaire -> nombre entier de mètres, ou null. */
export function parseElevation(input: string): number | null | "invalid" {
  const t = input.trim().replace(/\s/g, "").replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0 || n > 20000) return "invalid";
  return Math.round(n);
}
