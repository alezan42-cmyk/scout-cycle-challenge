import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Award, Check, ChevronLeft, ChevronRight, Lock } from "lucide-react";
import { AppPageShell } from "@/components/AppPageShell";
import { AppCard, AppEmpty, AppSection } from "@/components/app/AppUi";
import { StageVisual } from "@/components/ExpeditionGoal";
import {
  formatStageKm,
  nextStageIndex,
  stageArt,
  stageProgress,
  useExpeditionStages,
} from "@/lib/expedition";
import { troopTotal, useTroopData } from "@/lib/appData";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/expedition")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    etape: typeof search["etape"] === "string" ? search["etape"] : undefined,
  }),
  component: ExpeditionScreen,
});

/** Expédition dans l'app : une étape à la fois en grand, puis le carnet de route. */
function ExpeditionScreen() {
  const { etape } = Route.useSearch();
  const { data, isLoading } = useExpeditionStages();
  const troop = useTroopData();
  const km = useMemo(() => troopTotal(troop.data, "all"), [troop.data]);
  const stages = useMemo(() => (data ?? []).filter((s) => s.target_km > 0), [data]);
  const nextIdx = nextStageIndex(stages, km);

  const [index, setIndex] = useState<number | null>(null);
  useEffect(() => {
    if (!etape || stages.length === 0) return;
    const i = stages.findIndex((s) => s.id === etape);
    if (i >= 0) setIndex(i);
  }, [etape, stages]);

  if (isLoading) {
    return (
      <AppPageShell title="Expédition">
        <AppEmpty title="Chargement de l'Expédition…" />
      </AppPageShell>
    );
  }
  if (stages.length === 0) {
    return (
      <AppPageShell title="Expédition">
        <AppEmpty title="Aucune étape pour l'instant" />
      </AppPageShell>
    );
  }

  const i = Math.min(index ?? nextIdx, stages.length - 1);
  const stage = stages[i]!;
  const prog = stageProgress(stages, i, km);
  const reached = stages.filter((s) => km >= s.target_km).length;
  const select = (j: number) => {
    setIndex(j);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <AppPageShell
      title="Expédition"
      description={`${formatStageKm(km)} km parcourus · ${reached} étape${reached > 1 ? "s" : ""} sur ${stages.length}`}
    >
      <AppCard className="overflow-hidden">
        <div
          className={cn(
            "flex items-center justify-between bg-gradient-to-br px-3 pb-6 pt-5",
            "from-primary/10 via-transparent to-amber-500/10",
          )}
        >
          <button
            type="button"
            onClick={() => setIndex(Math.max(0, i - 1))}
            disabled={i === 0}
            aria-label="Étape précédente"
            className="grid h-11 w-11 place-items-center rounded-full bg-card/80 text-foreground shadow-sm disabled:opacity-25"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div key={stage.id} className="animate-in fade-in-0 zoom-in-95 duration-300">
            <StageVisual stage={stage} prog={prog} size="lg" />
          </div>
          <button
            type="button"
            onClick={() => setIndex(Math.min(stages.length - 1, i + 1))}
            disabled={i === stages.length - 1}
            aria-label="Étape suivante"
            className="grid h-11 w-11 place-items-center rounded-full bg-card/80 text-foreground shadow-sm disabled:opacity-25"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-3 px-5 pb-5 pt-1 text-center">
          <p
            className={cn(
              "text-[12px] font-bold uppercase tracking-wide",
              prog.status === "done"
                ? "text-emerald-600 dark:text-emerald-400"
                : prog.status === "next"
                  ? "text-primary"
                  : "text-muted-foreground",
            )}
          >
            Étape {i + 1} sur {stages.length} ·{" "}
            {prog.status === "done"
              ? "atteinte"
              : prog.status === "next"
                ? "prochain objectif"
                : "à venir"}
          </p>
          <div>
            <h2 className="font-display text-[26px] font-black leading-tight text-foreground">
              {stage.name.trim()}
            </h2>
            {stage.subtitle && stage.subtitle !== stage.name && (
              <p className="mt-0.5 text-[15px] text-muted-foreground">{stage.subtitle}</p>
            )}
          </div>

          <div className="rounded-2xl bg-muted/50 p-3.5 text-left">
            <div className="flex items-baseline justify-between gap-2">
              <span className="font-display text-[22px] font-black tabular-nums text-foreground">
                {prog.status === "done" ? "Atteinte !" : `${formatStageKm(prog.remaining)} km`}
              </span>
              <span className="text-[13px] font-semibold text-muted-foreground">
                {prog.status === "done"
                  ? `${formatStageKm(stage.target_km)} km`
                  : `restants sur ${formatStageKm(stage.target_km)} km`}
              </span>
            </div>
            {prog.status === "next" && (
              <>
                <div className="mt-2.5 h-2.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary transition-[width] duration-700"
                    style={{ width: `${Math.round(prog.fraction * 100)}%` }}
                  />
                </div>
                <p className="mt-1.5 text-[12px] text-muted-foreground">
                  {Math.floor(prog.fraction * 100)} % de l&apos;objectif · {formatStageKm(km)} /{" "}
                  {formatStageKm(stage.target_km)} km
                </p>
              </>
            )}
          </div>

          {stage.description && stage.description !== stage.name && (
            <p className="text-left text-[15px] leading-relaxed text-foreground/85">
              {stage.description}
            </p>
          )}
          {stage.badge_name && (
            <p className="flex items-center justify-center gap-1.5 text-[14px] text-muted-foreground">
              <Award className="h-4 w-4 text-amber-500" />
              Badge de troupe :{" "}
              <strong className="font-semibold text-foreground">{stage.badge_name}</strong>
            </p>
          )}
        </div>
      </AppCard>

      <AppSection title="Carnet de route">
        <AppCard className="divide-y divide-border/60 overflow-hidden">
          {stages.map((s, j) => {
            const p = stageProgress(stages, j, km);
            const art = stageArt(s);
            return (
              <button
                key={s.id}
                type="button"
                onClick={() => select(j)}
                className={cn(
                  "flex min-h-[64px] w-full items-center gap-3 px-4 py-2.5 text-left active:bg-muted/70",
                  j === i && "bg-primary/[0.07]",
                )}
              >
                <span
                  className={cn(
                    "grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full bg-gradient-to-br",
                    art.bg,
                    p.status === "locked" && "saturate-[0.55]",
                  )}
                >
                  {art.src ? (
                    <img
                      src={art.src}
                      alt=""
                      className={cn(
                        "h-full w-full",
                        art.photo ? "object-cover" : "object-contain p-[14%]",
                      )}
                      loading="lazy"
                    />
                  ) : (
                    <span className="text-xl">{s.badge_emoji}</span>
                  )}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[16px] font-semibold text-foreground">
                    {s.name.trim()}
                  </span>
                  <span className="block truncate text-[13px] text-muted-foreground">
                    {formatStageKm(s.target_km)} km
                    {p.status === "next" && ` · encore ${formatStageKm(p.remaining)} km`}
                  </span>
                </span>
                {p.status === "done" ? (
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-500 text-white">
                    <Check className="h-4 w-4" strokeWidth={3} />
                  </span>
                ) : p.status === "next" ? (
                  <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">
                    En cours
                  </span>
                ) : (
                  <Lock className="h-4 w-4 text-muted-foreground/60" />
                )}
              </button>
            );
          })}
        </AppCard>
      </AppSection>
    </AppPageShell>
  );
}
