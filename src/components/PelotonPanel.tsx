import { useState } from "react";
import { Users, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import { getPatrolEmblem } from "@/lib/database";
import type { PelotonUserScore } from "@/lib/peloton";

type ScoutRow = {
  user_id: string;
  display_name: string;
  patrol_name: string;
  is_chef?: boolean;
  peloton?: PelotonUserScore | undefined;
};

type PatrolRow = {
  id: string;
  name: string;
  isChef: boolean;
  pelotonPoints: number;
};

const MULTIPLIERS: [string, string][] = [
  ["2", "×1"],
  ["3", "×1,2"],
  ["4", "×1,4"],
  ["5", "×1,6"],
  ["6", "×1,8"],
  ["7+", "×2"],
];

function fmt(n: number) {
  return n.toLocaleString("fr-BE", { maximumFractionDigits: 1 });
}

const medal = (rank: number) => (rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null);

/**
 * Classement « Peloton » : récompense les sorties faites à plusieurs.
 * Points = km × multiplicateur selon le nombre de participants validés.
 */
export function PelotonPanel({
  scouts,
  patrols,
  sportMode,
}: {
  scouts: ScoutRow[];
  patrols: PatrolRow[];
  sportMode: "velo" | "course" | "marche" | "all";
}) {
  const [tab, setTab] = useState<"scouts" | "patrols">("scouts");

  const rankedScouts = scouts
    .filter((s) => (s.peloton?.points || 0) > 0)
    .sort((a, b) => (b.peloton?.points || 0) - (a.peloton?.points || 0));
  const rankedPatrols = patrols
    .filter((p) => p.pelotonPoints > 0)
    .sort((a, b) => b.pelotonPoints - a.pelotonPoints);
  const max =
    tab === "scouts" ? rankedScouts[0]?.peloton?.points || 1 : rankedPatrols[0]?.pelotonPoints || 1;

  const verb =
    sportMode === "course"
      ? "couru"
      : sportMode === "velo"
        ? "roulé"
        : sportMode === "marche"
          ? "marché"
          : "roulé, couru ou marché";

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-orange-300/50 bg-gradient-to-br from-orange-500/10 via-card to-card p-4 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-orange-500/15 text-orange-600">
            <Users className="h-5 w-5" />
          </span>
          <div className="space-y-2 text-sm">
            <p className="font-display text-lg font-bold text-foreground">
              Peloton : plus on est nombreux, plus ça compte !
            </p>
            <p className="text-xs text-muted-foreground">
              Seules les sorties à plusieurs comptent. Chaque participant encode sa propre sortie
              (Strava ou photo) et la rattache au groupe ; une fois validée, il gagne{" "}
              <strong>km × multiplicateur</strong> selon le nombre de participants validés.
            </p>
            <div className="flex flex-wrap gap-1.5">
              {MULTIPLIERS.map(([n, m]) => (
                <span
                  key={n}
                  className="rounded-full border border-orange-300/60 bg-card px-2 py-0.5 text-[11px] font-semibold text-foreground"
                >
                  {n} pers. <span className="text-orange-600">{m}</span>
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="flex rounded-xl bg-muted p-1 text-sm sm:max-w-sm">
        {(["scouts", "patrols"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 font-semibold transition-all",
              tab === t ? "bg-card text-foreground shadow-xs" : "text-muted-foreground",
            )}
          >
            {t === "scouts" ? "Individuel" : "Patrouilles"}
          </button>
        ))}
      </div>

      {(tab === "scouts" ? rankedScouts.length : rankedPatrols.length) === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center text-sm text-muted-foreground">
          <Info className="mx-auto mb-2 h-5 w-5" />
          Aucune sortie à plusieurs validée pour ces filtres. Organisez une sortie ensemble : dans «
          Mes km », choisis « J&apos;étais avec… » et coche tes compagnons !
        </div>
      ) : tab === "scouts" ? (
        <div className="space-y-2">
          {rankedScouts.map((s, i) => {
            const pts = s.peloton?.points || 0;
            return (
              <div key={s.user_id} className="rounded-2xl border bg-card p-3 shadow-xs">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="w-7 text-center font-display text-lg font-black text-muted-foreground">
                      {medal(i + 1) ?? i + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-bold text-foreground">
                        {s.display_name}
                        {s.is_chef && (
                          <span className="ml-1.5 rounded bg-purple-500/10 px-1 text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300">
                            Staff
                          </span>
                        )}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {s.patrol_name} · {s.peloton?.groupRides} sortie
                        {(s.peloton?.groupRides || 0) > 1 ? "s" : ""} à plusieurs ·{" "}
                        {fmt(s.peloton?.groupKm || 0)} km {verb} · groupe max{" "}
                        {s.peloton?.bestGroupSize}
                      </p>
                    </div>
                  </div>
                  <p className="shrink-0 font-display text-xl font-black text-orange-600">
                    {fmt(pts)}{" "}
                    <span className="text-xs font-semibold text-muted-foreground">pts</span>
                  </p>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-orange-500"
                    style={{ width: `${Math.max(3, (pts / max) * 100)}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="space-y-2">
          {rankedPatrols.map((p, i) => (
            <div key={p.id} className="rounded-2xl border bg-card p-3 shadow-xs">
              <div className="flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="w-7 text-center font-display text-lg font-black text-muted-foreground">
                    {medal(i + 1) ?? i + 1}
                  </span>
                  <span className="text-xl">{getPatrolEmblem(p.name)}</span>
                  <p className="truncate font-bold text-foreground">
                    {p.name}
                    {p.isChef && (
                      <span className="ml-1.5 rounded bg-purple-500/10 px-1 text-[10px] font-bold uppercase text-purple-700 dark:text-purple-300">
                        Staff
                      </span>
                    )}
                  </p>
                </div>
                <p className="shrink-0 font-display text-xl font-black text-orange-600">
                  {fmt(p.pelotonPoints)}{" "}
                  <span className="text-xs font-semibold text-muted-foreground">pts</span>
                </p>
              </div>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                <div
                  className="h-full rounded-full bg-orange-500"
                  style={{ width: `${Math.max(3, (p.pelotonPoints / max) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
