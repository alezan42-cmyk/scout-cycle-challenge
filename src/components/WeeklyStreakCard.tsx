import { Flame } from "lucide-react";
import { getActivityStreak } from "@/lib/weeklyStreak";
import { cn } from "@/lib/utils";

export function WeeklyStreakCard({
  rideDates,
  compact = false,
}: {
  rideDates: string[];
  compact?: boolean;
}) {
  const streak = getActivityStreak(rideDates);
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-2xl border border-orange-200/70 bg-orange-50/80 text-orange-950 dark:border-orange-900/50 dark:bg-orange-950/30 dark:text-orange-100",
        compact ? "px-3 py-2.5" : "p-4",
      )}
    >
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-600 dark:text-orange-300">
        <Flame className="h-5 w-5" />
      </span>
      <div className="min-w-0">
        <p className="font-display text-[15px] font-bold">
          {streak.activities > 0
            ? `${streak.activities} activité${streak.activities > 1 ? "s" : ""} dans ta série AC42`
            : "Lance ta série AC42 !"}
        </p>
        <p className="text-[12px] text-orange-900/75 dark:text-orange-100/70">
          {streak.activities > 0
            ? "Chaque sortie validée augmente le compteur. Après 5 jours sans activité, il revient à zéro."
            : "Une sortie validée relance ta série. Elle s’arrête après 5 jours sans activité."}
        </p>
      </div>
    </div>
  );
}
