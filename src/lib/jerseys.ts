/**
 * Maillots du défi, calculés pour chaque catégorie (Garçons, Filles, Staff) :
 * - maillot jaune : le plus de kilomètres ;
 * - maillot à pois (grimpeur) : le plus de dénivelé positif (D+).
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
  km: number;
  dplus: number;
}

export interface JerseyHolders {
  yellow: JerseyCandidate | null;
  climber: JerseyCandidate | null;
}

export interface SportifAwardMonth {
  user_id: string;
  week_start: string;
}

/**
 * A Scout sportif du mois ne peut pas recevoir le maillot jaune pendant le mois
 * de sa désignation et les trois mois civils suivants.
 */
export function yellowJerseyIneligibleIds(
  awards: SportifAwardMonth[],
  asOf = new Date(),
): Set<string> {
  const monthStart = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-01`;
  const currentMonth = monthStart(asOf);
  const activeIds = new Set<string>();

  for (const award of awards) {
    const [year, month] = award.week_start.split("-").map(Number);
    if (!year || !month) continue;
    const expires = new Date(year, month - 1 + 4, 1);
    const expiresMonth = monthStart(expires);
    if (award.week_start <= currentMonth && currentMonth < expiresMonth) {
      activeIds.add(award.user_id);
    }
  }

  return activeIds;
}

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
  yellowIneligibleIds: Set<string> = new Set(),
): Record<JerseyCategory, JerseyHolders> {
  const result = {} as Record<JerseyCategory, JerseyHolders>;
  for (const cat of JERSEY_CATEGORIES) {
    const inCat = candidates.filter((c) => jerseyCategoryOf(c) === cat);
    result[cat] = {
      yellow: best(
        inCat.filter((c) => !yellowIneligibleIds.has(c.user_id)),
        (c) => c.km,
        (c) => c.dplus,
      ),
      climber: best(
        inCat,
        (c) => c.dplus,
        (c) => c.km,
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
