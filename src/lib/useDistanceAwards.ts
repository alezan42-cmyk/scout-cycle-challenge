import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { ActivitySport } from "@/lib/database";
import { DISTANCE_TROPHIES } from "@/lib/distanceTrophies";
import { CUMULATIVE_DISTANCE_LEVELS } from "@/lib/distanceLevels";

export type DistanceAwardKind = "single_ride" | "cumulative";
export type DistanceAward = {
  id: string;
  sport: ActivitySport;
  kind: DistanceAwardKind;
  threshold_km: number;
};
export type AwardThresholds = Record<ActivitySport, number[]>;

export const DEFAULT_AWARD_THRESHOLDS: Record<DistanceAwardKind, AwardThresholds> = {
  single_ride: DISTANCE_TROPHIES,
  cumulative: CUMULATIVE_DISTANCE_LEVELS,
};

export function useDistanceAwards() {
  const [awards, setAwards] = useState<DistanceAward[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    let active = true;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("distance_awards")
      .select("id,sport,kind,threshold_km")
      .order("threshold_km")
      .then(({ data, error }: { data: DistanceAward[] | null; error: unknown }) => {
        if (!active) return;
        if (!error && data) setAwards(data);
        setLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const thresholds: Record<DistanceAwardKind, AwardThresholds> = {
    single_ride: { velo: [], course: [], marche: [] },
    cumulative: { velo: [], course: [], marche: [] },
  };
  if (loaded && awards.length) {
    for (const award of awards)
      thresholds[award.kind][award.sport].push(Number(award.threshold_km));
  }
  const effectiveThresholds = loaded && awards.length ? thresholds : DEFAULT_AWARD_THRESHOLDS;
  return { awards, loaded, thresholds: effectiveThresholds };
}
