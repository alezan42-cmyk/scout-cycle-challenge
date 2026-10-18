import { Shirt } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  JERSEY_CATEGORIES,
  type JerseyCategory,
  type JerseyHolders,
  type JerseyCandidate,
} from "@/lib/jerseys";

const CATEGORY_TITLES: Record<JerseyCategory, string> = {
  homme: "Garçons",
  femme: "Filles",
  staff: "Staff",
};

function Holder({
  kind,
  holder,
}: {
  kind: "yellow" | "climber" | "white";
  holder: JerseyCandidate | null;
}) {
  const isYellow = kind === "yellow";
  const isWhite = kind === "white";
  return (
    <div
      className={cn(
        "flex items-center gap-3 rounded-xl border p-3",
        isYellow
          ? "border-yellow-400/50 bg-yellow-400/10"
          : isWhite
            ? "border-slate-300 bg-white/70 dark:border-slate-500/60 dark:bg-white/5"
            : "border-red-400/40 bg-red-500/5",
      )}
    >
      <span
        aria-hidden
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
          isYellow
            ? "bg-yellow-400 text-yellow-950"
            : isWhite
              ? "bg-white text-slate-600 shadow-sm ring-2 ring-slate-300"
              : "bg-white text-red-600 ring-2 ring-red-500 [background-image:radial-gradient(circle,#dc2626_22%,transparent_24%)] [background-size:9px_9px]",
        )}
      >
        {isYellow || isWhite ? <Shirt className="h-4 w-4" /> : null}
      </span>
      <div className="min-w-0 flex-1">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          {isYellow
            ? "Maillot jaune · km"
            : isWhite
              ? "Maillot blanc · 1re et 2e année"
              : "Maillot à pois · D+"}
        </div>
        {holder ? (
          <>
            <div className="truncate font-display text-sm font-bold text-foreground">
              {holder.display_name}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {holder.patrol_name} ·{" "}
              {isYellow || isWhite
                ? `${holder.km.toFixed(1)} km${isWhite && holder.scout_year ? ` · ${holder.scout_year}${holder.scout_year === 1 ? "re" : "e"} année` : ""}`
                : `${Math.round(holder.dplus).toLocaleString("fr-BE")} m D+`}
            </div>
          </>
        ) : (
          <div className="text-xs text-muted-foreground">Pas encore attribué</div>
        )}
      </div>
    </div>
  );
}

/** Maillot jaune (km), à pois (D+) et blanc (meilleur 1re/2e année) pour chaque catégorie. */
export function JerseysPanel({
  jerseys,
  periodLabel,
}: {
  jerseys: Record<JerseyCategory, JerseyHolders>;
  periodLabel: string;
}) {
  return (
    <section className="rounded-2xl border bg-card p-4 sm:p-5" aria-label="Maillots">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="font-display text-lg font-bold text-foreground">Maillots</h2>
        <span className="text-xs text-muted-foreground">
          {periodLabel} · sorties validées uniquement
        </span>
      </div>
      <div className="grid gap-4 md:grid-cols-3">
        {JERSEY_CATEGORIES.map((cat) => (
          <div key={cat} className="space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              {CATEGORY_TITLES[cat]}
            </div>
            <Holder kind="yellow" holder={jerseys[cat].yellow} />
            <Holder kind="climber" holder={jerseys[cat].climber} />
            {cat !== "staff" && <Holder kind="white" holder={jerseys[cat].white} />}
          </div>
        ))}
      </div>
    </section>
  );
}
