import { getActivitySport, type ActivitySport } from "@/lib/database";

export type DistanceActivity = { km: number | null; note?: string | null; status?: string | null };

export const DISTANCE_TROPHIES: Record<ActivitySport, number[]> = {
  velo: [1, 5, 10, 25, 50, 100],
  course: [1, 5, 10, 21, 42],
  marche: [1, 5, 10, 20, 40],
};

export function getDistanceTotals(activities: DistanceActivity[]) {
  const totals: Record<ActivitySport, number> = { velo: 0, course: 0, marche: 0 };
  for (const activity of activities) {
    if (activity.status && activity.status !== "approved") continue;
    totals[getActivitySport(activity)] += Number(activity.km || 0);
  }
  return totals;
}

export function getNextDistanceTrophy(activities: DistanceActivity[]) {
  const totals = getDistanceTotals(activities);
  const next = (Object.keys(DISTANCE_TROPHIES) as ActivitySport[])
    .flatMap((sport) =>
      DISTANCE_TROPHIES[sport]
        .filter((km) => totals[sport] < km)
        .map((km) => ({ sport, km, total: totals[sport], progress: totals[sport] / km })),
    )
    .sort((a, b) => b.progress - a.progress)[0];
  return next ?? null;
}
