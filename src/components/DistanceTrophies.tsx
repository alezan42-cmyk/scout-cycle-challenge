import { Bike, Footprints, Medal, PersonStanding, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SPORT_INFO, type ActivitySport } from "@/lib/database";
import {
  DISTANCE_TROPHIES,
  getBestSingleActivityDistances,
  getNextDistanceTrophy,
  type DistanceActivity,
} from "@/lib/distanceTrophies";
import {
  CUMULATIVE_DISTANCE_LEVELS,
  type CumulativeDistanceActivity,
  getCumulativeDistanceTotals,
  getDistanceLevel,
} from "@/lib/distanceLevels";

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
              {next.total.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} / {next.km} km sur
              une sortie · {percent}%
            </p>
          </div>
          <Icon className={`h-5 w-5 shrink-0 ${colors[next.sport].split(" ")[1]}`} />
        </div>
      </CardContent>
    </Card>
  );
}

export function DistanceTrophyCollection({ activities }: { activities: DistanceActivity[] }) {
  const best = getBestSingleActivityDistances(activities);
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-amber-500" /> Trophées de distance
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Chaque trophée dépend de la distance parcourue en une seule sortie validée, dans la
          discipline correspondante.
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
                  {best[sport].toLocaleString("fr-BE", { maximumFractionDigits: 1 })} km sur une
                  sortie
                </span>
              </h3>
              <div className="flex flex-wrap gap-2">
                {DISTANCE_TROPHIES[sport].map((km) => {
                  const earned = best[sport] >= km;
                  const percent = Math.min(100, Math.round((best[sport] / km) * 100));
                  return (
                    <div
                      key={km}
                      className="min-w-[5.5rem] rounded-xl border p-2 text-center"
                      title={`${percent}% · ${earned ? "obtenu" : `encore ${(km - best[sport]).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} km en une sortie`}`}
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
                          : `Encore ${(km - best[sport]).toLocaleString("fr-BE", { maximumFractionDigits: 1 })} km sur une sortie`}
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

export function CumulativeDistanceLevels({
  activities,
  compact = false,
}: {
  activities: CumulativeDistanceActivity[];
  compact?: boolean;
}) {
  const totals = getCumulativeDistanceTotals(activities);
  return (
    <Card>
      {!compact && (
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal className="h-5 w-5 text-primary" /> Paliers de distance cumulée
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Les kilomètres de toutes les sorties validées s’additionnent séparément pour chaque
            discipline.
          </p>
        </CardHeader>
      )}
      <CardContent className={compact ? "space-y-3 p-3" : "space-y-4"}>
        {(Object.keys(CUMULATIVE_DISTANCE_LEVELS) as ActivitySport[]).map((sport) => {
          const Icon = icons[sport];
          const total = totals[sport];
          const { level, nextThreshold, progress } = getDistanceLevel(total, sport);
          return (
            <div key={sport} className="rounded-xl border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <Icon className="h-4 w-4" />
                <span className="text-sm font-bold">{SPORT_INFO[sport].label}</span>
                <Badge variant={level > 0 ? "default" : "outline"} className="ml-auto">
                  {level > 0 ? `Palier ${level}` : "Départ"}
                </Badge>
                <span className="text-xs font-medium text-muted-foreground">
                  {total.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} km cumulés
                </span>
              </div>
              {nextThreshold ? (
                <>
                  <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {total.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} / {nextThreshold}{" "}
                    km · encore{" "}
                    {Math.max(0, nextThreshold - total).toLocaleString("fr-BE", {
                      maximumFractionDigits: 1,
                    })}{" "}
                    km
                  </p>
                </>
              ) : (
                <p className="mt-1 text-xs font-semibold text-primary">
                  Palier maximum atteint ({CUMULATIVE_DISTANCE_LEVELS[sport].at(-1)} km)
                </p>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

export function CumulativeDistanceBadges({ totals }: { totals: Record<ActivitySport, number> }) {
  const sports = (Object.keys(CUMULATIVE_DISTANCE_LEVELS) as ActivitySport[]).filter(
    (sport) => totals[sport] > 0,
  );
  if (!sports.length) return null;
  return (
    <div className="flex flex-wrap gap-1.5" aria-label="Paliers de distance cumulée">
      {sports.map((sport) => {
        const { level } = getDistanceLevel(totals[sport], sport);
        return (
          <Badge key={sport} variant="outline" className="text-[10px]">
            {SPORT_INFO[sport].short} · {level > 0 ? `Palier ${level}` : "En progression"}
          </Badge>
        );
      })}
    </div>
  );
}
