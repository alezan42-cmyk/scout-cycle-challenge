import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Trophy } from "lucide-react";
import { AppPageShell } from "@/components/AppPageShell";
import { AppCard, AppEmpty, ChipRow, Segmented, TextTabs } from "@/components/app/AppUi";
import { SportIcon } from "@/components/SportIcon";
import { useAuth } from "@/lib/useAuth";
import {
  formatKm,
  rankPatrols,
  inGroup,
  rankScouts,
  useTroopData,
  type AppGroup,
  type AppPeriod,
  type AppSport,
} from "@/lib/appData";
import { getPatrolEmblem, SPORT_INFO } from "@/lib/database";
import { cn } from "@/lib/utils";
import { RankingStoryExport } from "@/components/RankingStoryExport";

export const Route = createFileRoute("/app/classement")({ ssr: false, component: RankingScreen });

const MEDALS = ["🥇", "🥈", "🥉"];

function RankingScreen() {
  const { user, profile } = useAuth();
  const { data, isLoading } = useTroopData();
  const [view, setView] = useState<"patrols" | "scouts">("patrols");
  const [period, setPeriod] = useState<AppPeriod>("week");
  const [sport, setSport] = useState<AppSport>("all");
  const [group, setGroup] = useState<AppGroup>("all");

  const patrols = useMemo(() => rankPatrols(data, period, sport), [data, period, sport]);
  const scouts = useMemo(
    () => rankScouts(data, period, sport).filter((s) => inGroup(s, group)),
    [data, period, sport, group],
  );

  const rows =
    view === "patrols"
      ? patrols.map((p) => ({
          id: p.id,
          title: p.name,
          subtitle: `${p.members} scout${p.members > 1 ? "s" : ""}`,
          km: p.km,
          lead: getPatrolEmblem(p.name),
          mine: p.id === profile?.patrol_id,
          to: undefined as string | undefined,
        }))
      : scouts.map((s) => ({
          id: s.user_id,
          title: s.name,
          subtitle: s.patrol_name,
          km: s.km,
          lead: null,
          mine: s.user_id === user?.id,
          to: `/scout/${s.user_id}`,
        }));
  const ranked = rows.filter((r) => r.km > 0);
  const others = rows.length - ranked.length;
  const myIndex = ranked.findIndex((r) => r.mine);
  const myRank = myIndex >= 0 ? myIndex + 1 : null;
  const total = (view === "patrols" ? patrols : scouts).reduce((s, r) => s + r.km, 0);

  return (
    <AppPageShell root title="Classement">
      <div className="space-y-3">
        <div className="flex justify-end">
          <RankingStoryExport />
        </div>
        <Segmented
          value={view}
          onChange={setView}
          options={[
            { value: "patrols", label: "Patrouilles" },
            { value: "scouts", label: "Individuel" },
          ]}
        />
        <TextTabs
          value={period}
          onChange={setPeriod}
          options={[
            { value: "week", label: "Semaine" },
            { value: "month", label: "Mois" },
            { value: "all", label: "Tout" },
          ]}
        />
        {view === "scouts" && (
          <ChipRow
            value={group}
            onChange={setGroup}
            options={[
              { value: "all", label: "Tout le monde" },
              { value: "scouts", label: "Scouts (1re à 4e)" },
              { value: "1", label: "1re" },
              { value: "2", label: "2e" },
              { value: "3", label: "3e" },
              { value: "4", label: "4e" },
              { value: "staff", label: "Staff" },
            ]}
          />
        )}
        <ChipRow
          value={sport}
          onChange={setSport}
          options={[
            { value: "all", label: "Tous les sports" },
            ...(["velo", "course", "marche"] as const).map((s) => ({
              value: s,
              label: (
                <>
                  <SportIcon sport={s} className="h-4 w-4" />
                  {SPORT_INFO[s].short}
                </>
              ),
            })),
          ]}
        />
      </div>

      {isLoading ? (
        <AppEmpty title="Chargement du classement…" />
      ) : ranked.length === 0 ? (
        <AppEmpty
          icon={Trophy}
          title="Personne n'a encore de km ici"
          text="Enregistre une sortie pour ouvrir le classement !"
        />
      ) : (
        <div className="space-y-3">
          <p className="px-1 text-[14px] text-muted-foreground">
            <strong className="font-semibold text-foreground">{formatKm(total)} km</strong> au total
            {myRank && (
              <>
                {" · "}
                {view === "patrols" ? "ta patrouille est" : "tu es"}{" "}
                <strong className="font-semibold text-foreground">
                  {myRank === 1 ? "1re" : `${myRank}e`}
                </strong>{" "}
                sur {ranked.length}
              </>
            )}
          </p>
          <AppCard className="divide-y divide-border/60 overflow-hidden">
            {ranked.map((r, i) => {
              const inner = (
                <>
                  <span className="w-7 shrink-0 text-center text-[17px] font-bold tabular-nums text-muted-foreground">
                    {i < 3 ? MEDALS[i] : i + 1}
                  </span>
                  {r.lead && <span className="text-xl leading-none">{r.lead}</span>}
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[16px] font-semibold text-foreground">
                      {r.title}
                      {r.mine && (
                        <span className="ml-2 rounded-full bg-primary px-2 py-0.5 align-middle text-[11px] font-bold text-primary-foreground">
                          {view === "patrols" ? "Ta patrouille" : "Toi"}
                        </span>
                      )}
                    </span>
                    <span className="block truncate text-[13px] text-muted-foreground">
                      {r.subtitle}
                    </span>
                  </span>
                  <span className="shrink-0 text-[16px] font-bold tabular-nums text-foreground">
                    {formatKm(r.km)}
                    <span className="ml-0.5 text-[13px] font-semibold text-muted-foreground">
                      km
                    </span>
                  </span>
                </>
              );
              const cls = cn(
                "flex min-h-[64px] items-center gap-3 px-4 py-2.5",
                r.mine && "bg-primary/[0.07]",
              );
              return r.to ? (
                <Link key={r.id} to={r.to as never} className={cn(cls, "active:bg-muted/70")}>
                  {inner}
                </Link>
              ) : (
                <div key={r.id} className={cls}>
                  {inner}
                </div>
              );
            })}
          </AppCard>
          {others > 0 && (
            <p className="px-1 text-center text-[13px] text-muted-foreground">
              {others} {view === "patrols" ? "patrouille" : "scout"}
              {others > 1 ? "s" : ""} sans km pour l'instant
            </p>
          )}
        </div>
      )}
    </AppPageShell>
  );
}
