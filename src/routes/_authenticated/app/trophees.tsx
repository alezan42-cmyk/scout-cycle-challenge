import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Lock } from "lucide-react";
import { AppPageShell } from "@/components/AppPageShell";
import { AppCard, AppSection } from "@/components/app/AppUi";
import { SportIcon, SPORT_COLORS } from "@/components/SportIcon";
import { useAuth } from "@/lib/useAuth";
import { formatKm, useMyActivities } from "@/lib/appData";
import { useDistanceAwards } from "@/lib/useDistanceAwards";
import { getBestSingleActivityDistances, getNextDistanceTrophy } from "@/lib/distanceTrophies";
import { SPORT_INFO, type ActivitySport } from "@/lib/database";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/trophees")({
  ssr: false,
  component: TrophiesScreen,
});

function TrophiesScreen() {
  const { user } = useAuth();
  const { data: acts = [] } = useMyActivities(user?.id);
  const { thresholds } = useDistanceAwards();
  const best = useMemo(() => getBestSingleActivityDistances(acts), [acts]);
  const next = useMemo(
    () => getNextDistanceTrophy(acts, thresholds.single_ride),
    [acts, thresholds.single_ride],
  );
  const sports = Object.keys(thresholds.single_ride) as ActivitySport[];
  const earned = sports.reduce(
    (n, s) => n + thresholds.single_ride[s].filter((km) => best[s] >= km).length,
    0,
  );
  const total = sports.reduce((n, s) => n + thresholds.single_ride[s].length, 0);

  return (
    <AppPageShell title="Mes trophées" description="Un trophée se gagne en une seule sortie.">
      <AppCard className="p-5">
        <p className="font-display text-[40px] font-black leading-none text-foreground">
          {earned}
          <span className="text-xl font-bold text-muted-foreground"> / {total}</span>
        </p>
        <p className="mt-1.5 text-[14px] text-muted-foreground">trophées gagnés</p>
        {next && (
          <div className="mt-4 border-t border-border/60 pt-4">
            <p className="text-[15px] font-semibold text-foreground">
              Prochain : {next.km} km en {SPORT_INFO[next.sport].short.toLowerCase()}
            </p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-amber-500"
                style={{ width: `${Math.min(100, Math.round(next.progress * 100))}%` }}
              />
            </div>
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Encore {formatKm(next.km - next.total)} km sur une sortie
            </p>
          </div>
        )}
      </AppCard>

      {sports.map((sport) => (
        <AppSection key={sport} title={SPORT_INFO[sport].label}>
          <AppCard className="p-4">
            <p className="mb-3 flex items-center gap-2 text-[14px] text-muted-foreground">
              <SportIcon sport={sport} className={cn("h-4 w-4", SPORT_COLORS[sport].text)} />
              Meilleure sortie :{" "}
              <strong className="text-foreground">{formatKm(best[sport])} km</strong>
            </p>
            <div className="grid grid-cols-3 gap-2">
              {thresholds.single_ride[sport].map((km) => {
                const got = best[sport] >= km;
                return (
                  <div
                    key={km}
                    className={cn(
                      "flex h-[72px] flex-col items-center justify-center rounded-2xl text-center",
                      got ? SPORT_COLORS[sport].soft : "bg-muted/60 text-muted-foreground",
                    )}
                  >
                    <span className="text-lg leading-none">
                      {got ? "🏆" : <Lock className="h-4 w-4" />}
                    </span>
                    <span className="mt-1.5 text-[14px] font-bold">{km} km</span>
                  </div>
                );
              })}
            </div>
          </AppCard>
        </AppSection>
      ))}
    </AppPageShell>
  );
}
