import { getActivitySport, type ActivitySport } from "@/lib/database";

export type DistanceActivity = { km: number | null; note?: string | null; status?: string | null };

export const DISTANCE_TROPHIES: Record<ActivitySport, number[]> = {
  velo: [1, 5, 10, 25, 50, 100],
  course: [1, 5, 10, 21, 42],
  marche: [1, 5, 10, 20, 40],
};

export function getBestSingleActivityDistances(activities: DistanceActivity[]) {
  const best: Record<ActivitySport, number> = { velo: 0, course: 0, marche: 0 };
  for (const activity of activities) {
    if (activity.status && activity.status !== "approved") continue;
    const sport = getActivitySport(activity);
    best[sport] = Math.max(best[sport], Number(activity.km || 0));
  }
  return best;
}

export function getNextDistanceTrophy(
  activities: DistanceActivity[],
  trophies: Record<ActivitySport, number[]> = DISTANCE_TROPHIES,
) {
  const best = getBestSingleActivityDistances(activities);
  const next = (Object.keys(DISTANCE_TROPHIES) as ActivitySport[])
    .flatMap((sport) =>
      trophies[sport]
        .filter((km) => best[sport] < km)
        .map((km) => ({ sport, km, total: best[sport], progress: best[sport] / km })),
    )
    .sort((a, b) => b.progress - a.progress)[0];
  return next ?? null;
}
