import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo } from "react";
import {
  Award,
  CalendarClock,
  ChevronRight,
  Medal,
  Plus,
  Shirt,
  Sparkles,
  Users,
} from "lucide-react";
import { AppPageShell } from "@/components/AppPageShell";
import { AppCard, AppSection } from "@/components/app/AppUi";
import { SportIcon, SPORT_COLORS } from "@/components/SportIcon";
import { useAuth } from "@/lib/useAuth";
import {
  daysUntil,
  formatKm,
  periodRange,
  rankOf,
  rankPatrols,
  troopTotal,
  useMyActivities,
  useNextEvent,
  useTroopData,
} from "@/lib/appData";
import { useDistanceAwards } from "@/lib/useDistanceAwards";
import { getNextDistanceTrophy } from "@/lib/distanceTrophies";
import { getActivitySport, getPatrolEmblem, SPORT_INFO } from "@/lib/database";
import { cn } from "@/lib/utils";
import { ExpeditionGoal } from "@/components/ExpeditionGoal";
import { WeeklyStreakCard } from "@/components/WeeklyStreakCard";
import { useSeasonalTheme } from "@/context/SeasonalThemeContext";
import hero from "@/assets/hero.jpg";

export const Route = createFileRoute("/app/")({ ssr: false, component: AppHome });

function greeting() {
  const h = new Date().getHours();
  return h < 6 ? "Bonne nuit" : h < 12 ? "Bonjour" : h < 18 ? "Salut" : "Bonsoir";
}

function AppHome() {
  const { user, profile } = useAuth();
  const troop = useTroopData();
  const mine = useMyActivities(user?.id);
  const event = useNextEvent();
  const { thresholds } = useDistanceAwards();
  // Même photo que l'accueil du site : celle du thème si l'admin en a mis une
  const { background: themeBackground } = useSeasonalTheme();

  const month = periodRange("month")!;
  const stats = useMemo(() => {
    const acts = mine.data ?? [];
    const inMonth = acts.filter((a) => a.ride_date >= month.from && a.ride_date <= month.to);
    const approved = inMonth.filter((a) => a.status === "approved");
    return {
      total: acts.filter((a) => a.status === "approved").reduce((s, a) => s + Number(a.km || 0), 0),
      km: approved.reduce((s, a) => s + Number(a.km || 0), 0),
      rides: approved.length,
      pending: acts
        .filter((a) => a.status === "pending")
        .reduce((s, a) => s + Number(a.km || 0), 0),
    };
  }, [mine.data, month.from, month.to]);

  const nextTrophy = useMemo(
    () => (mine.data ? getNextDistanceTrophy(mine.data, thresholds.single_ride) : null),
    [mine.data, thresholds.single_ride],
  );

  const troopKm = useMemo(() => troopTotal(troop.data, "all"), [troop.data]);
  const navigate = useNavigate();
  const patrols = useMemo(() => rankPatrols(troop.data, "week", "all"), [troop.data]);
  const myPatrolRank = profile?.patrol_id
    ? rankOf(patrols, (p) => p.id === profile.patrol_id)
    : null;
  const top = patrols.filter((p) => p.km > 0).slice(0, 3);
  const maxKm = Math.max(1, ...top.map((p) => p.km));

  const name = profile?.totem || profile?.full_name?.split(" ")[0];

  return (
    <AppPageShell
      root
      heroImage={themeBackground ?? hero}
      heroPosition={themeBackground ? "center" : "75% 68%"}
      title={user ? `${greeting()}${name ? `, ${name}` : ""} 👋` : "ALEZAN 42"}
      description={
        user
          ? profile?.patrol_name
            ? `Patrouille ${profile.patrol_name}`
            : "Prêt pour une nouvelle sortie ?"
          : "Le défi kilomètres des patrouilles"
      }
    >
      {user ? (
        <>
          {/* Mon mois */}
          <AppCard className="p-5">
            <div className="grid grid-cols-[minmax(0,1fr)_7.5rem] items-center gap-1">
              <div className="min-w-0">
                <p className="text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Mes km ce mois-ci
                </p>
                <p className="mt-1 font-display text-[44px] font-black leading-none tracking-tight text-foreground">
                  {formatKm(stats.km)}
                  <span className="ml-1.5 text-xl font-bold text-muted-foreground">km</span>
                </p>
                <p className="mt-2 text-[14px] text-muted-foreground">
                  {stats.rides} sortie{stats.rides > 1 ? "s" : ""} validée
                  {stats.rides > 1 ? "s" : ""}
                  {stats.pending > 0 && (
                    <span className="text-amber-700 dark:text-amber-400">
                      {" "}
                      · {formatKm(stats.pending)} km en attente
                    </span>
                  )}
                </p>
              </div>
              <ExpeditionGoal
                totalKm={troopKm}
                variant="mini"
                onOpen={(id) =>
                  void navigate({ to: "/app/expedition", search: { etape: id } } as never)
                }
              />
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 border-t border-border/60 pt-4">
              <div>
                <p className="font-display text-[22px] font-black leading-none tabular-nums text-foreground">
                  {formatKm(stats.total)}
                  <span className="ml-1 text-[13px] font-bold text-muted-foreground">km</span>
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">Mon total</p>
              </div>
              <div>
                <p className="font-display text-[22px] font-black leading-none tabular-nums text-foreground">
                  {formatKm(troopKm)}
                  <span className="ml-1 text-[13px] font-bold text-muted-foreground">km</span>
                </p>
                <p className="mt-1 text-[13px] text-muted-foreground">Toute la troupe</p>
              </div>
            </div>
            <Link
              to="/app/enregistrer"
              className="mt-5 flex h-12 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground shadow-sm active:scale-[0.99]"
            >
              <Plus className="h-5 w-5" strokeWidth={2.6} />
              Enregistrer une sortie
            </Link>
          </AppCard>

          <WeeklyStreakCard
            rideDates={(mine.data ?? [])
              .filter((activity) => activity.status === "approved")
              .map((activity) => activity.ride_date)}
            compact
          />

          {/* Prochain trophée */}
          {nextTrophy && (
            <Link to="/app/trophees" className="block">
              <AppCard className="flex items-center gap-4 p-4">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-amber-500/15 text-amber-600">
                  <Medal className="h-6 w-6" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[15px] font-semibold text-foreground">
                    Prochain trophée : {nextTrophy.km} km
                  </p>
                  <p className="text-[13px] text-muted-foreground">
                    {SPORT_INFO[nextTrophy.sport].short} · meilleure sortie{" "}
                    {formatKm(nextTrophy.total)} km
                  </p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-amber-500"
                      style={{ width: `${Math.min(100, Math.round(nextTrophy.progress * 100))}%` }}
                    />
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" />
              </AppCard>
            </Link>
          )}
        </>
      ) : (
        <AppCard className="p-5">
          <p className="text-[16px] font-semibold text-foreground">
            Chaque kilomètre compte pour ta patrouille.
          </p>
          <p className="mt-1 text-[14px] text-muted-foreground">
            Connecte-toi pour enregistrer tes sorties vélo, course et marche.
          </p>
          <p className="mt-4 font-display text-[28px] font-black leading-none text-foreground">
            {formatKm(troopKm)}
            <span className="ml-1 text-[14px] font-bold text-muted-foreground">
              km parcourus par la troupe
            </span>
          </p>
          <Link
            to="/auth"
            className="mt-5 flex h-12 w-full items-center justify-center rounded-2xl bg-primary text-[16px] font-bold text-primary-foreground"
          >
            Se connecter
          </Link>
        </AppCard>
      )}

      {/* Patrouilles de la semaine */}
      <AppSection
        title="Patrouilles cette semaine"
        action={
          <Link to="/app/classement" className="text-[14px] font-semibold text-primary">
            Tout voir
          </Link>
        }
      >
        <AppCard className="p-4">
          {top.length === 0 ? (
            <p className="py-3 text-center text-[14px] text-muted-foreground">
              {troop.isLoading
                ? "Chargement…"
                : "Pas encore de km cette semaine. À toi de lancer la course !"}
            </p>
          ) : (
            <ul className="space-y-3.5">
              {top.map((p, i) => (
                <li key={p.id} className="flex items-center gap-3">
                  <span className="w-5 text-center text-[15px] font-bold tabular-nums text-muted-foreground">
                    {i + 1}
                  </span>
                  <span className="text-xl leading-none">{getPatrolEmblem(p.name)}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span
                        className={cn(
                          "truncate text-[15px] font-semibold text-foreground",
                          p.id === profile?.patrol_id && "text-primary",
                        )}
                      >
                        {p.name}
                      </span>
                      <span className="shrink-0 text-[14px] font-semibold tabular-nums text-foreground">
                        {formatKm(p.km)} km
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          i === 0 ? "bg-primary" : "bg-primary/45",
                        )}
                        style={{ width: `${Math.max(6, (p.km / maxKm) * 100)}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
          {myPatrolRank && myPatrolRank > 3 && (
            <p className="mt-4 border-t border-border/60 pt-3 text-[14px] text-muted-foreground">
              Ta patrouille est <strong className="text-foreground">{myPatrolRank}ᵉ</strong> cette
              semaine.
            </p>
          )}
        </AppCard>
      </AppSection>

      {/* Prochain rendez-vous */}
      {event.data && (
        <AppSection title="Prochain rendez-vous">
          <Link to="/app/compte-a-rebours" className="block">
            <AppCard className="flex items-center gap-4 p-4">
              <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-primary/10 text-center text-primary">
                <span className="leading-none">
                  <span className="block font-display text-xl font-black">
                    {daysUntil(event.data.target_date)}
                  </span>
                  <span className="text-[10px] font-bold uppercase">
                    jour{daysUntil(event.data.target_date) > 1 ? "s" : ""}
                  </span>
                </span>
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[16px] font-semibold text-foreground">
                  {event.data.title}
                </p>
                <p className="truncate text-[13px] text-muted-foreground">
                  {new Date(event.data.target_date).toLocaleDateString("fr-BE", {
                    weekday: "long",
                    day: "numeric",
                    month: "long",
                  })}
                </p>
              </div>
              <CalendarClock className="h-5 w-5 shrink-0 text-muted-foreground/60" />
            </AppCard>
          </Link>
        </AppSection>
      )}

      {/* Raccourcis */}
      <AppSection title="Explorer">
        <div className="grid grid-cols-2 gap-3">
          <Shortcut
            to="/app/maillots"
            icon={Shirt}
            label="Maillots"
            tint="bg-amber-500/15 text-amber-600"
          />
          <Shortcut
            to="/app/defis"
            icon={Award}
            label="Défis"
            tint="bg-rose-500/12 text-rose-600"
          />
          <Shortcut
            to="/app/sorties"
            icon={Users}
            label="Sorties de la troupe"
            tint="bg-emerald-500/12 text-emerald-700"
          />
          <Shortcut
            to={user ? "/app/trophees" : "/auth"}
            icon={Sparkles}
            label="Mes trophées"
            tint="bg-sky-500/12 text-sky-600"
          />
        </div>
      </AppSection>

      {/* Mes dernières sorties */}
      {user && (mine.data?.length ?? 0) > 0 && (
        <AppSection
          title="Mes dernières sorties"
          action={
            <Link to="/app/mes-kms" className="text-[14px] font-semibold text-primary">
              Tout voir
            </Link>
          }
        >
          <AppCard className="divide-y divide-border/60 overflow-hidden">
            {mine.data!.slice(0, 3).map((a) => {
              const sport = SPORT_KEY(a.note);
              return (
                <div key={a.id} className="flex min-h-[60px] items-center gap-3.5 px-4 py-2.5">
                  <span
                    className={cn(
                      "grid h-9 w-9 shrink-0 place-items-center rounded-xl",
                      SPORT_COLORS[sport].soft,
                    )}
                  >
                    <SportIcon sport={sport} className="h-[18px] w-[18px]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-semibold text-foreground">
                      {SPORT_INFO[sport].label}
                    </p>
                    <p className="text-[13px] text-muted-foreground">
                      {new Date(`${a.ride_date}T12:00:00`).toLocaleDateString("fr-BE", {
                        weekday: "short",
                        day: "numeric",
                        month: "short",
                      })}
                      {a.status === "pending" && " · en attente"}
                    </p>
                  </div>
                  <span className="text-[15px] font-semibold tabular-nums text-foreground">
                    {formatKm(Number(a.km))} km
                  </span>
                </div>
              );
            })}
          </AppCard>
        </AppSection>
      )}
    </AppPageShell>
  );
}

const SPORT_KEY = (note: string | null) => getActivitySport({ note });

function Shortcut({
  to,
  icon: Icon,
  label,
  tint,
}: {
  to: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  tint: string;
}) {
  return (
    <Link to={to as never} className="block">
      <AppCard className="flex h-full flex-col gap-3 p-4 active:bg-muted/60">
        <span className={cn("grid h-10 w-10 place-items-center rounded-2xl", tint)}>
          <Icon className="h-5 w-5" />
        </span>
        <span className="text-[15px] font-semibold leading-tight text-foreground">{label}</span>
      </AppCard>
    </Link>
  );
}
