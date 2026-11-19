/** Nombre d'activités validées dans la série actuelle.
 * La série revient à zéro après cinq jours sans activité validée. */
export function getActivityStreak(rideDates: Array<string | null | undefined>, today = new Date()) {
  const todayKey = localDateKey(today);
  const dates = rideDates
    .filter((date): date is string => !!date)
    .map((date) => date.slice(0, 10))
    .filter((date) => date <= todayKey)
    .sort();
  const latest = dates.at(-1);
  if (!latest || daysBetween(latest, todayKey) >= 5)
    return { activities: 0, lastRideDate: latest ?? null };

  let oldest = latest;
  let newer = latest;
  for (let i = dates.length - 2; i >= 0; i -= 1) {
    const date = dates[i];
    if (daysBetween(date, newer) > 5) break;
    oldest = date;
    newer = date;
  }

  const activities = dates.filter((date) => date >= oldest && date <= latest).length;
  return { activities, lastRideDate: latest };
}

function localDateKey(date: Date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function daysBetween(from: string, to: string) {
  return Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
