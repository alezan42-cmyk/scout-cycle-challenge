import { useEffect, useMemo, useRef, useState, type TouchEvent } from "react";
import { Check, ChevronLeft, ChevronRight, Flag, Lock } from "lucide-react";
import {
  formatStageKm,
  nextStageIndex,
  stageArt,
  stageProgress,
  useExpeditionStages,
  type ExpeditionStage,
  type StageProgress,
} from "@/lib/expedition";
import { cn } from "@/lib/utils";

const RING_R = 70;
const RING_LEN = 2 * Math.PI * RING_R;

/**
 * Case « objectif » : la prochaine étape de l'Expédition, avec flèches (ou glissement)
 * pour voir les étapes passées et à venir, une seule à la fois. Un clic ouvre l'Expédition.
 */
export function ExpeditionGoal({
  totalKm,
  variant = "compact",
  onOpen,
}: {
  totalKm: number;
  /** compact = accueil du site ; mini = carte d'accueil de l'app */
  variant?: "compact" | "mini";
  onOpen: (stageId: string) => void;
}) {
  const { data } = useExpeditionStages();
  // Le camp de base (0 km) n'est pas un objectif
  const stages = useMemo(() => (data ?? []).filter((s) => s.target_km > 0), [data]);
  const km = Math.max(0, Number.isFinite(totalKm) ? totalKm : 0);
  const nextIdx = nextStageIndex(stages, km);

  const [index, setIndex] = useState<number | null>(null);
  // Revient automatiquement sur le prochain objectif quand il change
  const lastNext = useRef(nextIdx);
  useEffect(() => {
    if (lastNext.current !== nextIdx) {
      lastNext.current = nextIdx;
      setIndex(null);
    }
  }, [nextIdx]);

  if (stages.length === 0) {
    return (
      <div
        className={cn(
          "rounded-2xl border border-border/80 bg-card shadow-sm",
          variant === "mini" ? "h-[150px] w-full animate-pulse" : "min-h-24 animate-pulse",
        )}
      />
    );
  }

  const i = Math.min(index ?? nextIdx, stages.length - 1);
  const stage = stages[i]!;
  const prog = stageProgress(stages, i, km);
  const go = (d: number) => setIndex(Math.max(0, Math.min(stages.length - 1, i + d)));

  return variant === "mini" ? (
    <Mini stage={stage} prog={prog} i={i} n={stages.length} go={go} onOpen={onOpen} />
  ) : (
    <Compact stage={stage} prog={prog} i={i} n={stages.length} km={km} go={go} onOpen={onOpen} />
  );
}

/** Glissement gauche / droite sur écran tactile */
function useSwipe(go: (d: number) => void) {
  const start = useRef<number | null>(null);
  return {
    onTouchStart: (e: TouchEvent) => {
      start.current = e.touches[0]?.clientX ?? null;
    },
    onTouchEnd: (e: TouchEvent) => {
      if (start.current === null) return;
      const dx = (e.changedTouches[0]?.clientX ?? start.current) - start.current;
      start.current = null;
      if (Math.abs(dx) > 40) go(dx < 0 ? 1 : -1);
    },
  };
}

const STATUS_LABEL: Record<StageProgress["status"], string> = {
  next: "Prochain objectif",
  done: "Objectif atteint",
  locked: "À venir",
};

function statusLine(stage: ExpeditionStage, prog: StageProgress) {
  if (prog.status === "done") return `Atteint · ${formatStageKm(stage.target_km)} km`;
  return `Encore ${formatStageKm(prog.remaining)} km`;
}

export function StageVisual({
  stage,
  prog,
  size,
}: {
  stage: ExpeditionStage;
  prog: StageProgress;
  size: "sm" | "md" | "lg";
}) {
  const art = stageArt(stage);
  const ring =
    prog.status === "done"
      ? "text-emerald-500"
      : prog.status === "next"
        ? "text-primary"
        : "text-muted-foreground/30";
  const fraction = prog.status === "done" ? 1 : prog.fraction;
  return (
    <div
      className={cn(
        "relative grid shrink-0 place-items-center",
        size === "lg"
          ? "h-36 w-36"
          : size === "md"
            ? "h-[84px] w-[84px] sm:h-24 sm:w-24"
            : "h-[68px] w-[68px]",
      )}
    >
      <div
        className={cn(
          "absolute inset-[9%] overflow-hidden rounded-full bg-gradient-to-br shadow-[inset_0_-6px_14px_rgba(0,0,0,0.18)]",
          art.bg,
          prog.status === "locked" && "saturate-[0.55]",
        )}
      >
        {art.src ? (
          <img
            src={art.src}
            alt=""
            className={cn(
              "h-full w-full",
              art.photo ? "object-cover" : "object-contain p-[16%] drop-shadow-md",
            )}
            loading="lazy"
            decoding="async"
          />
        ) : (
          <span
            className={cn(
              "grid h-full w-full place-items-center",
              size === "lg" ? "text-5xl" : size === "md" ? "text-3xl" : "text-2xl",
            )}
          >
            {stage.badge_emoji}
          </span>
        )}
      </div>
      <svg
        aria-hidden="true"
        viewBox="0 0 160 160"
        className="absolute inset-0 h-full w-full -rotate-90"
      >
        <circle
          cx="80"
          cy="80"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          className="text-muted/70"
        />
        <circle
          cx="80"
          cy="80"
          r={RING_R}
          fill="none"
          stroke="currentColor"
          strokeWidth="7"
          strokeLinecap="round"
          strokeDasharray={RING_LEN}
          strokeDashoffset={RING_LEN * (1 - fraction)}
          className={cn(ring, "transition-[stroke-dashoffset] duration-700")}
        />
      </svg>
      {prog.status !== "next" && (
        <span
          className={cn(
            "absolute bottom-0 right-0 grid place-items-center rounded-full border-2 border-card shadow-sm",
            size === "lg" ? "right-2 bottom-2 h-8 w-8" : size === "md" ? "h-6 w-6" : "h-5 w-5",
            prog.status === "done" ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
          )}
        >
          {prog.status === "done" ? (
            <Check className="h-3 w-3" strokeWidth={3} />
          ) : (
            <Lock className="h-2.5 w-2.5" />
          )}
        </span>
      )}
      {prog.status === "next" && (
        <span className="absolute -bottom-1 rounded-full bg-primary px-1.5 py-px text-[10px] font-black leading-tight text-primary-foreground shadow-sm">
          {Math.floor(prog.fraction * 100)}%
        </span>
      )}
    </div>
  );
}

function NavButton({
  dir,
  disabled,
  onClick,
  className,
}: {
  dir: "prev" | "next";
  disabled: boolean;
  onClick: () => void;
  className?: string;
}) {
  const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={dir === "prev" ? "Objectif précédent" : "Objectif suivant"}
      className={cn(
        "grid shrink-0 place-items-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-25",
        className,
      )}
    >
      <Icon className="h-4 w-4" />
    </button>
  );
}

/**
 * Version site : même présentation que l'ancienne case « tour du monde »
 * (image ronde + anneau à gauche, textes à droite) ; seule la partie objectif change.
 */
function Compact({
  stage,
  prog,
  i,
  n,
  km,
  go,
  onOpen,
}: {
  stage: ExpeditionStage;
  prog: StageProgress;
  i: number;
  n: number;
  km: number;
  go: (d: number) => void;
  onOpen: (id: string) => void;
}) {
  const swipe = useSwipe(go);
  const art = stageArt(stage);
  const fraction = prog.status === "done" ? 1 : prog.fraction;
  return (
    <section
      aria-label="Objectifs de l'Expédition"
      className="relative flex min-h-24 min-w-0 items-center rounded-2xl border border-border/80 bg-card p-2.5 shadow-sm sm:p-3"
      {...swipe}
    >
      <button
        type="button"
        key={stage.id}
        onClick={() => onOpen(stage.id)}
        title="Voir le détail dans l'Expédition"
        className="group flex min-w-0 flex-1 animate-in items-center gap-2 text-left fade-in-0 duration-300 sm:gap-3"
      >
        <div className="relative grid h-[76px] w-[76px] shrink-0 place-items-center sm:h-20 sm:w-20">
          <div
            className={cn(
              "absolute h-16 w-16 overflow-hidden rounded-full bg-gradient-to-br shadow-[0_0_20px_rgba(59,130,246,0.18)] sm:h-[68px] sm:w-[68px]",
              art.bg,
              prog.status === "locked" && "saturate-[0.55]",
            )}
          >
            {art.src ? (
              <img
                src={art.src}
                alt=""
                className={cn(
                  "h-full w-full",
                  art.photo ? "object-cover" : "object-contain p-[15%] drop-shadow-md",
                )}
                loading="lazy"
                decoding="async"
              />
            ) : (
              <span className="grid h-full w-full place-items-center text-3xl">
                {stage.badge_emoji}
              </span>
            )}
          </div>
          <svg
            aria-hidden="true"
            viewBox="0 0 160 160"
            className="absolute inset-0 h-full w-full -rotate-90"
          >
            <circle
              cx="80"
              cy="80"
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              className="text-muted/70"
            />
            <circle
              cx="80"
              cy="80"
              r={RING_R}
              fill="none"
              stroke="currentColor"
              strokeWidth="5"
              strokeLinecap="round"
              strokeDasharray={RING_LEN}
              strokeDashoffset={RING_LEN * (1 - fraction)}
              className={cn(
                prog.status === "done" ? "text-emerald-500" : "text-primary",
                "transition-[stroke-dashoffset] duration-700",
              )}
            />
          </svg>
          {prog.status !== "next" && (
            <span
              className={cn(
                "absolute bottom-0.5 right-0.5 grid h-5 w-5 place-items-center rounded-full border-2 border-card",
                prog.status === "done"
                  ? "bg-emerald-500 text-white"
                  : "bg-muted text-muted-foreground",
              )}
            >
              {prog.status === "done" ? (
                <Check className="h-3 w-3" strokeWidth={3} />
              ) : (
                <Lock className="h-2.5 w-2.5" />
              )}
            </span>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1 pr-11 text-[9px] font-bold uppercase leading-tight tracking-wide text-muted-foreground sm:text-[10px]">
            <Flag aria-hidden="true" className="hidden h-3 w-3 shrink-0 text-primary sm:block" />
            <span className="truncate sm:hidden">
              {prog.status === "next" ? "Objectif" : prog.status === "done" ? "Atteint" : "À venir"}
            </span>
            <span className="hidden truncate sm:inline">{STATUS_LABEL[prog.status]}</span>
          </div>
          <p className="mt-1 line-clamp-2 font-display text-lg font-black leading-tight text-foreground group-hover:text-primary sm:text-xl">
            {stage.name.trim()}
          </p>
          <p
            className={cn(
              "mt-0.5 text-[10px] font-semibold leading-tight sm:text-xs",
              prog.status === "done" ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
            )}
          >
            {statusLine(stage, prog)}
          </p>
          <p className="mt-0.5 truncate text-[9px] leading-tight text-muted-foreground sm:text-[10px]">
            {prog.status === "next"
              ? `${formatStageKm(km)} / ${formatStageKm(stage.target_km)} km · ${Math.floor(prog.fraction * 100)} %`
              : prog.status === "done"
                ? stage.subtitle && stage.subtitle !== stage.name
                  ? stage.subtitle
                  : "Bravo la troupe !"
                : `${formatStageKm(km)} / ${formatStageKm(stage.target_km)} km`}
          </p>
        </div>
      </button>

      {/* Étapes précédentes / suivantes, une seule à la fois */}
      <div className="absolute right-1.5 top-1.5 flex items-center">
        <NavButton dir="prev" disabled={i === 0} onClick={() => go(-1)} className="h-6 w-6" />
        <NavButton dir="next" disabled={i === n - 1} onClick={() => go(1)} className="h-6 w-6" />
      </div>
    </section>
  );
}

function Mini({
  stage,
  prog,
  i,
  n,
  go,
  onOpen,
}: {
  stage: ExpeditionStage;
  prog: StageProgress;
  i: number;
  n: number;
  go: (d: number) => void;
  onOpen: (id: string) => void;
}) {
  const swipe = useSwipe(go);
  return (
    <section
      aria-label="Objectifs de l'Expédition"
      className="flex min-w-0 flex-col items-center text-center"
      {...swipe}
    >
      <p
        className={cn(
          "mb-1 text-[9px] font-bold uppercase leading-tight tracking-wide",
          prog.status === "done"
            ? "text-emerald-600 dark:text-emerald-400"
            : prog.status === "next"
              ? "text-primary"
              : "text-muted-foreground",
        )}
      >
        {prog.status === "next" ? "Objectif" : STATUS_LABEL[prog.status]}
      </p>
      <div className="flex items-center">
        <NavButton dir="prev" disabled={i === 0} onClick={() => go(-1)} className="h-8 w-6" />
        <button
          type="button"
          key={stage.id}
          onClick={() => onOpen(stage.id)}
          aria-label={`${stage.name} : ${statusLine(stage, prog)}. Voir l'Expédition`}
          className="animate-in rounded-full fade-in-0 duration-300 active:scale-95"
        >
          <StageVisual stage={stage} prog={prog} size="sm" />
        </button>
        <NavButton dir="next" disabled={i === n - 1} onClick={() => go(1)} className="h-8 w-6" />
      </div>
      <button
        type="button"
        onClick={() => onOpen(stage.id)}
        className="mt-1.5 w-full min-w-0 px-0.5"
      >
        <span className="line-clamp-2 text-[12px] font-bold leading-tight text-foreground">
          {stage.name.trim()}
        </span>
        <span
          className={cn(
            "block truncate text-[11px] font-semibold leading-tight",
            prog.status === "done"
              ? "text-emerald-600 dark:text-emerald-400"
              : "text-muted-foreground",
          )}
        >
          {prog.status === "done" ? "Atteint ✓" : `encore ${formatStageKm(prog.remaining)} km`}
        </span>
      </button>
    </section>
  );
}
