import { useMemo } from "react";
import { Globe2 } from "lucide-react";

const EARTH_CIRCUMFERENCE_KM = 40_075;
const RING_RADIUS = 70;
const RING_LENGTH = 2 * Math.PI * RING_RADIUS;

/** Progression de la troupe autour du globe, calculée sur les kilomètres validés. */
export function WorldTourProgress({
  totalKm,
  compact = false,
  mini = false,
}: {
  totalKm: number;
  compact?: boolean;
  /** Version très compacte pour tenir dans la carte d'accueil de l'app. */
  mini?: boolean;
}) {
  const progress = useMemo(() => {
    const safeKm = Math.max(0, Number.isFinite(totalKm) ? totalKm : 0);
    const totalDegrees = (safeKm / EARTH_CIRCUMFERENCE_KM) * 360;
    const degreesInCurrentLap = totalDegrees % 360;
    const completeTours = Math.floor(safeKm / EARTH_CIRCUMFERENCE_KM);

    return {
      safeKm,
      totalDegrees,
      degreesInCurrentLap,
      completeTours,
      ringOffset: RING_LENGTH * (1 - degreesInCurrentLap / 360),
    };
  }, [totalKm]);

  if (mini) {
    return (
      <section
        aria-label={`Tour du monde de la troupe : ${progress.safeKm.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} km parcourus sur 40 075 km, soit ${progress.totalDegrees.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} degrés sur 360`}
        className="flex min-w-0 flex-col items-center justify-center gap-1 text-center"
        title="Kilomètres parcourus ÷ 40 075 × 360°"
      >
        <div className="relative grid h-[68px] w-[68px] shrink-0 place-items-center">
          <img
            src="/earth-blue-marble.webp"
            alt=""
            className="absolute h-[54px] w-[54px] rounded-full object-cover shadow-[0_0_18px_rgba(59,130,246,0.28)]"
            loading="lazy"
            decoding="async"
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 160 160"
            className="absolute inset-0 h-full w-full -rotate-90"
          >
            <circle
              cx="80"
              cy="80"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              className="text-muted/70"
            />
            <circle
              cx="80"
              cy="80"
              r={RING_RADIUS}
              fill="none"
              stroke="currentColor"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={RING_LENGTH}
              strokeDashoffset={progress.ringOffset}
              className="text-primary transition-[stroke-dashoffset] duration-700"
            />
          </svg>
          <span className="relative rounded-full bg-black/55 px-1 text-[10px] font-black leading-tight text-white shadow-sm">
            {progress.totalDegrees.toLocaleString("fr-BE", { maximumFractionDigits: 1 })}°
          </span>
        </div>
        <p className="text-[9px] font-semibold leading-tight text-foreground">
          {progress.safeKm.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} / 40 075 km
        </p>
        <p className="text-[9px] leading-tight text-muted-foreground">sur 360°</p>
      </section>
    );
  }

  return (
    <section
      aria-label="Avancée de la troupe autour de la Terre"
      className={
        compact
          ? "flex min-h-24 items-center gap-2 rounded-2xl border border-border/80 bg-card p-2.5 shadow-sm sm:gap-3 sm:p-3"
          : "flex min-h-44 items-center gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:gap-5 sm:p-5"
      }
    >
      <div
        className={
          compact
            ? "relative grid h-[76px] w-[76px] shrink-0 place-items-center sm:h-20 sm:w-20"
            : "relative grid h-32 w-32 shrink-0 place-items-center sm:h-36 sm:w-36"
        }
      >
        <img
          src="/earth-blue-marble.webp"
          alt="La Terre vue depuis l’espace, photographie Apollo 17"
          className={
            compact
              ? "absolute h-16 w-16 rounded-full object-cover shadow-[0_0_20px_rgba(59,130,246,0.28)] sm:h-[68px] sm:w-[68px]"
              : "absolute h-[108px] w-[108px] rounded-full object-cover shadow-[0_0_25px_rgba(59,130,246,0.28)] sm:h-[122px] sm:w-[122px]"
          }
          loading="lazy"
          decoding="async"
        />
        <svg
          aria-hidden="true"
          viewBox="0 0 160 160"
          className="absolute inset-0 h-full w-full -rotate-90"
        >
          <circle
            cx="80"
            cy="80"
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            className="text-muted/70"
          />
          <circle
            cx="80"
            cy="80"
            r={RING_RADIUS}
            fill="none"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={RING_LENGTH}
            strokeDashoffset={progress.ringOffset}
            className="text-primary transition-[stroke-dashoffset] duration-700"
          />
        </svg>
      </div>

      <div className="min-w-0 flex-1">
        <div
          className={
            compact
              ? "flex items-center gap-1 text-[9px] font-bold uppercase leading-tight tracking-wide text-muted-foreground sm:text-[10px]"
              : "flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-muted-foreground"
          }
        >
          <Globe2
            aria-hidden="true"
            className={compact ? "h-3 w-3 shrink-0 text-primary" : "h-4 w-4 text-primary"}
          />
          Le tour du monde de la troupe
        </div>
        <p
          className={
            compact
              ? "mt-1 font-display text-lg font-black leading-tight text-foreground sm:text-xl"
              : "mt-2 font-display text-2xl font-black leading-tight text-foreground sm:text-3xl"
          }
        >
          {progress.totalDegrees.toLocaleString("fr-BE", { maximumFractionDigits: 1 })}°
        </p>
        <p
          className={
            compact
              ? "mt-0.5 text-[10px] font-semibold leading-tight text-foreground sm:text-xs"
              : "mt-1 text-sm font-semibold text-foreground"
          }
        >
          {progress.safeKm.toLocaleString("fr-BE", { maximumFractionDigits: 1 })} km parcourus
        </p>
        <p
          className={
            compact
              ? "mt-0.5 text-[9px] leading-tight text-muted-foreground sm:text-[10px]"
              : "mt-1 text-xs text-muted-foreground"
          }
        >
          {progress.completeTours > 0
            ? progress.completeTours +
              " tour" +
              (progress.completeTours > 1 ? "s" : "") +
              " complet" +
              (progress.completeTours > 1 ? "s" : "") +
              " · "
            : ""}
          {progress.degreesInCurrentLap.toLocaleString("fr-BE", { maximumFractionDigits: 1 })}° sur
          360° — 40 075 km
        </p>
      </div>
    </section>
  );
}
