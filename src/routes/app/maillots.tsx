import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { AppPageShell } from "@/components/AppPageShell";
import { AppCard, AppSection, TextTabs } from "@/components/app/AppUi";
import { computeJerseys, type JerseyCandidate, type JerseyCategory } from "@/lib/jerseys";
import { formatKm, periodRange, useTroopData, type AppPeriod } from "@/lib/appData";
import { isStaffPatrol } from "@/lib/categories";

export const Route = createFileRoute("/app/maillots")({ ssr: false, component: JerseysScreen });

const CATEGORIES: { id: JerseyCategory; label: string }[] = [
  { id: "homme", label: "Garçons" },
  { id: "femme", label: "Filles" },
  { id: "staff", label: "Staff" },
];

function JerseysScreen() {
  const { data } = useTroopData();
  const [period, setPeriod] = useState<AppPeriod>("all");

  const jerseys = useMemo(() => {
    if (!data) return computeJerseys([]);
    const r = periodRange(period);
    const totals = new Map<string, { km: number; dplus: number }>();
    for (const a of data.activities) {
      if (a.status !== "approved") continue;
      if (r && (a.ride_date < r.from || a.ride_date > r.to)) continue;
      const t = totals.get(a.user_id) ?? { km: 0, dplus: 0 };
      t.km += Number(a.km || 0);
      t.dplus += Number(a.elevation_m || 0);
      totals.set(a.user_id, t);
    }
    const candidates: JerseyCandidate[] = data.profiles.flatMap((p) => {
      const t = totals.get(p.id);
      if (!t) return [];
      const staff = isStaffPatrol(p.patrols) || (!p.patrols && !!p.is_admin);
      return [
        {
          user_id: p.id,
          display_name: p.totem || p.full_name || "Scout",
          patrol_name: p.patrols?.name ?? "",
          category: staff ? "staff" : p.patrols?.category === "femme" ? "femme" : "homme",
          is_chef: staff,
          km: t.km,
          dplus: t.dplus,
        },
      ];
    });
    return computeJerseys(candidates);
  }, [data, period]);

  return (
    <AppPageShell
      title="Maillots"
      description="Jaune : le plus de km. À pois : le plus de dénivelé."
    >
      <TextTabs
        value={period}
        onChange={setPeriod}
        options={[
          { value: "week", label: "Semaine" },
          { value: "month", label: "Mois" },
          { value: "all", label: "Tout" },
        ]}
      />
      {CATEGORIES.map((c) => {
        const h = jerseys[c.id];
        return (
          <AppSection key={c.id} title={c.label}>
            <AppCard className="divide-y divide-border/60 overflow-hidden">
              <JerseyRow
                kind="yellow"
                name={h.yellow?.display_name}
                detail={
                  h.yellow ? `${h.yellow.patrol_name} · ${formatKm(h.yellow.km)} km` : undefined
                }
              />
              <JerseyRow
                kind="climber"
                name={h.climber && h.climber.dplus > 0 ? h.climber.display_name : undefined}
                detail={
                  h.climber && h.climber.dplus > 0
                    ? `${h.climber.patrol_name} · ${Math.round(h.climber.dplus).toLocaleString("fr-BE")} m D+`
                    : undefined
                }
              />
            </AppCard>
          </AppSection>
        );
      })}
    </AppPageShell>
  );
}

function JerseyRow({
  kind,
  name,
  detail,
}: {
  kind: "yellow" | "climber";
  name: string | undefined;
  detail: string | undefined;
}) {
  return (
    <div className="flex min-h-[68px] items-center gap-3.5 px-4 py-3">
      {kind === "yellow" ? (
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-yellow-400 text-lg">
          👕
        </span>
      ) : (
        <span
          aria-hidden
          className="h-11 w-11 shrink-0 rounded-full border-2 border-red-500 bg-white"
          style={{
            backgroundImage: "radial-gradient(#ef4444 22%, transparent 24%)",
            backgroundSize: "9px 9px",
          }}
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
          {kind === "yellow" ? "Maillot jaune" : "Maillot à pois"}
        </p>
        <p className="truncate text-[16px] font-semibold text-foreground">
          {name ?? <span className="font-normal text-muted-foreground">Pas encore attribué</span>}
        </p>
        {detail && <p className="truncate text-[13px] text-muted-foreground">{detail}</p>}
      </div>
    </div>
  );
}
