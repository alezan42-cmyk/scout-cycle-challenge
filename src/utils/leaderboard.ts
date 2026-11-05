import { Profile } from '../types/scout';

/**
 * Calcule si un scout est actuellement exclu du classement Maillot Jaune.
 * Un scout est exclu s'il est/a été élu Scout Sportif et que la période de X mois n'est pas encore écoulée.
 */
export function isExcludedFromMaillotJaune(
  profile: Profile,
  exclusionMonths: number
): boolean {
  if (!profile.scout_sportif_elected_at && !profile.is_scout_sportif) {
    return false;
  }

  if (!profile.scout_sportif_elected_at) {
    return false;
  }

  const electedDate = new Date(profile.scout_sportif_elected_at);
  const expiryDate = new Date(electedDate);
  expiryDate.setMonth(expiryDate.getMonth() + exclusionMonths);

  const now = new Date();
  return now < expiryDate;
}

/**
 * Calcule le nombre de jours restants avant la fin de l'exclusion Maillot Jaune.
 */
export function getRemainingExclusionDays(
  profile: Profile,
  exclusionMonths: number
): number {
  if (!profile.scout_sportif_elected_at) return 0;

  const electedDate = new Date(profile.scout_sportif_elected_at);
  const expiryDate = new Date(electedDate);
  expiryDate.setMonth(expiryDate.getMonth() + exclusionMonths);

  const now = new Date();
  const diffTime = expiryDate.getTime() - now.getTime();
  if (diffTime <= 0) return 0;

  return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
}
