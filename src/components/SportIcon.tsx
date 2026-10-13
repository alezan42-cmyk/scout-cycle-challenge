import { Bike, Footprints, PersonStanding, type LucideProps } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SPORT_INFO, type ActivitySport } from "@/lib/database";
import { cn } from "@/lib/utils";

/** Icône du sport : vélo, course à pied (empreintes) ou marche (silhouette). */
export function SportIcon({ sport, ...props }: { sport: ActivitySport } & LucideProps) {
  if (sport === "course") return <Footprints {...props} />;
  if (sport === "marche") return <PersonStanding {...props} />;
  return <Bike {...props} />;
}

/** Couleurs par sport (vélo = couleur du thème / vert, course = violet, marche = bleu ciel). */
export const SPORT_COLORS: Record<
  ActivitySport,
  { solid: string; text: string; soft: string; badge: string }
> = {
  velo: {
    solid: "bg-primary text-primary-foreground",
    text: "text-primary",
    soft: "bg-primary/10 border-primary/20 text-primary",
    badge:
      "border-emerald-300 bg-emerald-50 text-emerald-700 dark:border-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300",
  },
  course: {
    solid: "bg-purple-600 text-white",
    text: "text-purple-600 dark:text-purple-400",
    soft: "bg-purple-500/10 border-purple-500/20 text-purple-600 dark:text-purple-400",
    badge:
      "border-purple-300 bg-purple-50 text-purple-700 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300",
  },
  marche: {
    solid: "bg-sky-600 text-white",
    text: "text-sky-600 dark:text-sky-400",
    soft: "bg-sky-500/10 border-sky-500/20 text-sky-600 dark:text-sky-400",
    badge:
      "border-sky-300 bg-sky-50 text-sky-700 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300",
  },
};

/** Petite étiquette « Vélo / Course / Marche » utilisée dans les listes de sorties. */
export function SportBadge({
  sport,
  className,
  iconClassName = "h-3 w-3",
}: {
  sport: ActivitySport;
  className?: string;
  iconClassName?: string;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("gap-1 text-[10px] font-bold", SPORT_COLORS[sport].badge, className)}
    >
      <SportIcon sport={sport} className={iconClassName} />
      <span>{SPORT_INFO[sport].short}</span>
    </Badge>
  );
}
