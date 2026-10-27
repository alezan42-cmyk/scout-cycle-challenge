/** Nombre de semaines civiles couvertes par une série d'activités validées.
 * Une série se termine après cinq jours sans sortie validée. */
export function getWeeklyStreak(rideDates: Array<string | null | undefined>, today = new Date()) {
  const todayKey = localDateKey(today);
  const dates = [
    ...new Set(rideDates.filter((date): date is string => !!date).map((d) => d.slice(0, 10))),
  ]
    .filter((date) => date <= todayKey)
    .sort();
  const latest = dates.at(-1);
  if (!latest || daysBetween(latest, todayKey) >= 5)
    return { weeks: 0, lastRideDate: latest ?? null };

  let oldest = latest;
  let newer = latest;
  for (let i = dates.length - 2; i >= 0; i -= 1) {
    const date = dates[i];
    if (daysBetween(date, newer) > 5) break;
    oldest = date;
    newer = date;
  }

  const weeks = new Set<string>();
  for (const date of dates) {
    if (date < oldest || date > latest) continue;
    weeks.add(isoWeekKey(date));
  }
  return { weeks: Math.max(1, weeks.size), lastRideDate: latest };
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

function isoWeekKey(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((d.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${d.getUTCFullYear()}-${week}`;
}
