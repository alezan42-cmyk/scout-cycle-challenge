import { Bike, Footprints, Medal, PersonStanding, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SPORT_INFO, type ActivitySport } from "@/lib/database";
import {
  DISTANCE_TROPHIES,
  getDistanceTotals,
  getNextDistanceTrophy,
  type DistanceActivity,
} from "@/lib/distanceTrophies";

const icons = { velo: Bike, course: Footprints, marche: PersonStanding };
const colors: Record<ActivitySport, string> = {
  velo: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-200",
  course: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
  marche: "bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-200",
};

export function NearestDistanceTrophy({
  activities,
  compact = false,
}: {
  activities: DistanceActivity[];
  compact?: boolean;
}) {
  const next = getNextDistanceTrophy(activities);
  if (!next) return null;
  const Icon = icons[next.sport];
  const percent = Math.min(100, Math.round((next.total / next.km) * 100));
  return (
    <Card className={compact ? "border-amber-300/50 bg-card/95" : ""}>
      <CardContent className={compact ? "p-4" : "p-5"}>
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-500/15 text-amber-600">
            <Medal className="h-6 w-6" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              {compact ? "Ton prochain trophée" : "Le trophée le plus proche"}
            </p>
            <p className="truncate font-display text-lg font-black">
              {next.km} km · {SPORT_INFO[next.sport].label}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-amber-500" style={{ width: `${percent}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {next.total.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} / {next.km} km ·{" "}
              {percent}%
            </p>
          </div>
          <Icon className={`h-5 w-5 shrink-0 ${colors[next.sport].split(" ")[1]}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function DistanceTrophyCollection({ activities }: { activities: DistanceActivity[] }) {
  const totals = getDistanceTotals(activities);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" /> Trophées de distance
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Chaque kilomètre validé s’ajoute au total de sa discipline. Atteins un palier pour
          débloquer le trophée.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {(Object.keys(DISTANCE_TROPHIES) as ActivitySport[]).map((sport) => {
          const Icon = icons[sport];
          return (
            <section key={sport} className="space-y-2">
              <h3 className="flex items-center gap-2 text-sm font-bold">
                <Icon className="h-4 w-4" /> {SPORT_INFO[sport].label}
                <span className="ml-auto text-xs font-medium text-muted-foreground">
                  {totals[sport].toLocaleString("fr-BE", { maximumFractionDigits: 1 })} km
                </span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {DISTANCE_TROPHIES[sport].map((km) => {
                  const earned = totals[sport] >= km;
                  const percent = Math.min(100, Math.round((totals[sport] / km) * 100));
                  return (
                    <div
                      key={km}
                      className="min-w-[5.5rem] rounded-xl border p-2 text-center"
                      title={`${percent}% · ${earned ? "obtenu" : `encore ${(km - totals[sport]).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} km`}`}
                    >
                      <Badge
                        variant={earned ? "default" : "outline"}
                        className={earned ? colors[sport] : "opacity-70"}
                      >
                        {earned ? "🏆" : "🔒"} {km} km
                      </Badge>
                      <p className="mt-1 text-[10px] text-muted-foreground">
                        {earned
                          ? "Obtenu"
                          : `Encore ${(km - totals[sport]).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} km`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </CardContent>
    </Card>
  );
}
