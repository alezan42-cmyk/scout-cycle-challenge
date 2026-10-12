import type { ActivitySport } from "@/lib/database";
import { getActivitySport } from "@/lib/database";

export type CumulativeDistanceActivity = {
  km: number | null;
  note?: string | null;
  status?: string | null;
};

/** Paliers basés sur la distance cumulée des sorties validées par discipline. */
export const CUMULATIVE_DISTANCE_LEVELS: Record<ActivitySport, number[]> = {
  velo: [25, 50, 100, 250, 500, 1000],
  course: [10, 25, 50, 100, 200],
  marche: [10, 25, 50, 100, 200],
};

export function getCumulativeDistanceTotals(activities: CumulativeDistanceActivity[]) {
  const totals: Record<ActivitySport, number> = { velo: 0, course: 0, marche: 0 };
  for (const activity of activities) {
    if (activity.status && activity.status !== "approved") continue;
    totals[getActivitySport(activity)] += Number(activity.km || 0);
  }
  return totals;
}

export function getDistanceLevel(distanceKm: number, sport: ActivitySport) {
  const thresholds = CUMULATIVE_DISTANCE_LEVELS[sport];
  const level = thresholds.filter((threshold) => distanceKm >= threshold).length;
  const nextThreshold = thresholds[level] ?? null;
  const previousThreshold = thresholds[level - 1] ?? 0;
  const progress = nextThreshold
    ? Math.min(
        100,
        Math.round(((distanceKm - previousThreshold) / (nextThreshold - previousThreshold)) * 100),
      )
    : 100;

  return { level, nextThreshold, previousThreshold, progress };
}
