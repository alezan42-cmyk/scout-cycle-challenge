import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { Users } from "lucide-react";
import { AppPageShell } from "@/components/AppPageShell";
import { AppCard, AppEmpty, AppSection } from "@/components/app/AppUi";
import { SportIcon, SPORT_COLORS } from "@/components/SportIcon";
import { formatKm, useTroopData } from "@/lib/appData";
import { getActivitySport, getPatrolEmblem, SPORT_INFO } from "@/lib/database";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/app/sorties")({ ssr: false, component: TroopFeed });

function dayLabel(d: string) {
  const today = new Date();
  const iso = (x: Date) =>
    `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
  const y = new Date(today);
  y.setDate(today.getDate() - 1);
  if (d === iso(today)) return "Aujourd'hui";
  if (d === iso(y)) return "Hier";
  return new Date(`${d}T12:00:00`).toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

function TroopFeed() {
  const { data, isLoading } = useTroopData();

  const groups = useMemo(() => {
    if (!data) return [];
    const byId = new Map(data.profiles.map((p) => [p.id, p]));
    const list = data.activities
      .filter((a) => a.status === "approved" || a.status === "pending")
      .sort((a, b) => b.ride_date.localeCompare(a.ride_date))
      .slice(0, 50);
    const out: { label: string; items: typeof list }[] = [];
    for (const a of list) {
      const label = dayLabel(a.ride_date);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(a);
      else out.push({ label, items: [a] });
    }
    return out.map((g) => ({
      ...g,
      items: g.items.map((a) => {
        const p = byId.get(a.user_id);
        return {
          ...a,
          name: p?.totem || p?.full_name || "Scout",
          patrol: p?.patrols?.name ?? "",
        };
      }),
    }));
  }, [data]);

  return (
    <AppPageShell title="Sorties de la troupe" description="Les dernières sorties enregistrées.">
      {isLoading ? (
        <AppEmpty title="Chargement…" />
      ) : groups.length === 0 ? (
        <AppEmpty icon={Users} title="Aucune sortie pour l'instant" />
      ) : (
        groups.map((g) => (
          <AppSection key={g.label} title={g.label}>
            <AppCard className="divide-y divide-border/60 overflow-hidden">
              {g.items.map((a, i) => {
                const sp = getActivitySport(a);
                return (
                  <Link
                    key={`${a.user_id}-${a.ride_date}-${i}`}
                    to={`/scout/${a.user_id}` as never}
                    className="flex min-h-[64px] items-center gap-3.5 px-4 py-2.5 active:bg-muted/70"
                  >
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-muted text-lg">
                      {a.patrol ? getPatrolEmblem(a.patrol) : "⚜️"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold text-foreground">
                        {a.name}
                      </span>
                      <span className="flex items-center gap-1.5 truncate text-[13px] text-muted-foreground">
                        <SportIcon
                          sport={sp}
                          className={cn("h-3.5 w-3.5", SPORT_COLORS[sp].text)}
                        />
                        {SPORT_INFO[sp].short}
                        {a.patrol && ` · ${a.patrol}`}
                        {a.status === "pending" && " · en attente"}
                      </span>
                    </span>
                    <span className="shrink-0 text-[16px] font-bold tabular-nums text-foreground">
                      {formatKm(Number(a.km))} km
                    </span>
                  </Link>
                );
              })}
            </AppCard>
          </AppSection>
        ))
      )}
    </AppPageShell>
  );
}
