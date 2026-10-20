import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import {
  Trophy,
  Flame,
  Tent,
  Bike,
  Crown,
  Medal,
  Users,
  ChevronRight,
  TrendingUp,
  Sparkles,
  Award,
  Filter,
  LogIn,
  BarChart3,
  Compass,
  Search,
  Footprints,
  Clock,
  PersonStanding,
  ExternalLink,
} from "lucide-react";
import hero from "@/assets/hero.jpg";
import { CountdownBanner } from "@/components/CountdownBanner";
import { PatrolDailyContributionChart } from "@/components/PatrolDailyContributionChart";
import { RecentActivityFeed } from "@/components/RecentActivityFeed";
import { CollectiveRouteMap } from "@/components/CollectiveRouteMap";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { weekRange, monthRange, useAuth } from "@/lib/useAuth";
import { isAppMode } from "@/lib/standalone";
import {
  db,
  type Patrol,
  getActivitySport,
  type ActivitySport,
  getPatrolEmblem,
  SPORT_INFO,
} from "@/lib/database";
import { SportIcon, SPORT_COLORS } from "@/components/SportIcon";
import { cn } from "@/lib/utils";
import {
  isStaffPatrol,
  matchesCategory,
  TROOP_STAFF_PATROL_NAME,
  isTroopStaffPatrol,
} from "@/lib/categories";
import { computeJerseys } from "@/lib/jerseys";
import { JerseysPanel } from "@/components/JerseysPanel";
import { ScoutSportifCard } from "@/components/ScoutSportifCard";
import { PelotonPanel } from "@/components/PelotonPanel";
import { CumulativeDistanceBadges, NearestDistanceTrophy } from "@/components/DistanceTrophies";
import { ChallengesBanner, ChallengesPanel } from "@/components/ChallengesPanel";
import { ExpeditionGoal } from "@/components/ExpeditionGoal";
import { BirthdayBanner } from "@/components/BirthdayBanner";
import { useSeasonalTheme } from "@/context/SeasonalThemeContext";
import { computePeloton, type PelotonUserScore } from "@/lib/peloton";
import type { DistanceActivity } from "@/lib/distanceTrophies";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface LeaderboardItem {
  user_id: string;
  display_name: string;
  totem?: string | null;
  quali?: string | null;
  full_name?: string | null;
  patrol_id: string;
  patrol_name: string;
  category: string;
  km: number;
  dplus: number;
  distanceTotals: Record<ActivitySport, number>;
  scout_year?: number | null;
  is_chef?: boolean;
  peloton?: PelotonUserScore | undefined;
}

interface RankedActivity {
  user_id: string;
  km: number;
  elevation_m?: number | null;
  ride_date: string;
  note?: string | null;
  group_ride_id?: string | null;
}

interface SelectedLeaderboardEntry {
  title: string;
  userIds: string[];
}

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ALEZAN 42 — Le défi vélo des patrouilles" },
      {
        name: "description",
        content:
          "Classement hebdomadaire des kilomètres à vélo entre patrouilles scoutes de l'ALEZAN 42.",
      },
      { property: "og:title", content: "ALEZAN 42 — Le défi vélo des patrouilles" },
      { property: "og:description", content: "Quelle patrouille roulera le plus cette semaine ?" },
    ],
    // Adresse officielle (le site répond aussi sur alezan42-cycling.pages.dev)
    links: [{ rel: "canonical", href: "https://alezan42-cycling.lesscoutsdemoustier.be/" }],
  }),
  component: Index,
});

type Period = "week" | "last" | "month" | "lastMonth" | "all";

const PERIOD_LABELS: Record<Period, string> = {
  week: "Cette semaine",
  last: "Semaine passée",
  month: "Ce mois",
  lastMonth: "Mois passé",
  all: "Depuis le début",
};
type GenderCat = "all" | "homme" | "femme";
type ScoutYearFilter = "all" | "scouts" | "1" | "2" | "3" | "4" | "chef";
type SportMode = "velo" | "course" | "marche" | "all";

/** Icône du mode de classement (Tous = vélo). */
function ModeIcon({
  mode,
  className,
  colored,
}: {
  mode: SportMode;
  className?: string;
  colored?: boolean;
}) {
  const sport = mode === "all" ? "velo" : mode;
  return <SportIcon sport={sport} className={cn(className, colored && SPORT_COLORS[sport].text)} />;
}

function FilterPill({
  active,
  onClick,
  children,
  badge,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  badge?: string | number;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-all duration-200",
        active
          ? "border-primary bg-primary text-primary-foreground shadow-sm scale-102"
          : "border-border bg-card text-foreground hover:border-primary/50 hover:bg-accent/40",
      )}
    >
      <span>{children}</span>
      {badge !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.2 text-[10px] font-bold",
            active ? "bg-black/20 text-white" : "bg-muted text-muted-foreground",
          )}
        >
          {badge}
        </span>
      )}
    </button>
  );
}

function Index() {
  const { user, profile, isAdmin } = useAuth();
  const navigate = useNavigate();
  const { background: themeBackground } = useSeasonalTheme();
  // Application installée sur téléphone : l'accueil est l'écran /app (le site n'est pas concerné)
  useEffect(() => {
    if (isAppMode()) void navigate({ to: "/app", replace: true });
  }, [navigate]);
  const [sportMode, setSportMode] = useState<SportMode>("all");
  const [period, setPeriod] = useState<Period>("all");
  const [cat, setCat] = useState<GenderCat>("all");
  const [scoutYear, setScoutYear] = useState<ScoutYearFilter>("all");
  const [view, setView] = useState<
    "patrols" | "scouts" | "peloton" | "map" | "chart" | "challenges"
  >("patrols");
  const [scoutSearch, setScoutSearch] = useState("");
  const [pendingKm, setPendingKm] = useState(0);
  const [selectedEntry, setSelectedEntry] = useState<SelectedLeaderboardEntry | null>(null);

  const { data: myApprovedActivities = [] } = useQuery<DistanceActivity[]>({
    queryKey: ["my-approved-activities-for-trophies", user?.id],
    enabled: !!user?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities_public")
        .select("km,note,status")
        .eq("user_id", user!.id)
        .eq("status", "approved");
      if (error) throw error;
      return (data || []) as unknown as DistanceActivity[];
    },
  });

  const { data: globalActivityCount = 0 } = useQuery<number>({
    queryKey: ["global-approved-activity-count"],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { count, error } = await supabase
        .from("activities_public")
        .select("id", { count: "exact", head: true })
        .eq("status", "approved");
      if (error) throw error;
      return count ?? 0;
    },
  });

  const currentWeek = weekRange(0);
  const { data: myWeekKm = 0 } = useQuery<number>({
    queryKey: ["my-approved-week-km", user?.id, currentWeek.from, currentWeek.to],
    enabled: !!user?.id,
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities_public")
        .select("km")
        .eq("user_id", user!.id)
        .eq("status", "approved")
        .gte("ride_date", currentWeek.from)
        .lte("ride_date", currentWeek.to);
      if (error) throw error;
      return (data ?? []).reduce((sum, activity) => sum + Number(activity.km || 0), 0);
    },
  });

  const { data: troopTotalKm = 0 } = useQuery<number>({
    queryKey: ["troop-approved-km-all-time"],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities_public")
        .select("km")
        .eq("status", "approved");
      if (error) throw error;
      return (data ?? []).reduce((sum, activity) => sum + Number(activity.km || 0), 0);
    },
  });

  const range =
    period === "week"
      ? weekRange(0)
      : period === "last"
        ? weekRange(-1)
        : period === "month"
          ? monthRange(0)
          : period === "lastMonth"
            ? monthRange(-1)
            : null;

  const {
    data: leaderboardData,
    isLoading: isLeaderboardLoading,
    isError: isLeaderboardError,
  } = useQuery<LeaderboardItem[]>({
    queryKey: ["leaderboard", period, sportMode],
    refetchInterval: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      // Direct aggregation from real Supabase profiles and activities with sport filtering
      try {
        const { data: realProfiles, error: profilesError } = await supabase
          .from("profiles_public")
          .select(
            "id, full_name, totem, quali, patrol_id, is_admin, scout_year, patrols(id, name, category)",
          );

        const { data: realActs, error: activitiesError } = await supabase
          .from("activities_public")
          .select("user_id, km, elevation_m, ride_date, status, note, group_ride_id");

        if (profilesError) throw profilesError;
        if (activitiesError) throw activitiesError;

        type ProfileWithPatrol = {
          id: string;
          full_name?: string | null;
          totem?: string | null;
          quali?: string | null;
          patrol_id?: string | null;
          is_admin?: boolean | null;
          scout_year?: number | null;
          patrols?: { id: string; name: string; category: string } | null;
        };
        type ActItem = {
          user_id: string;
          km: number;
          elevation_m?: number | null;
          ride_date: string;
          status: string;
          note?: string | null;
          group_ride_id?: string | null;
        };

        const acts = (realActs as unknown as ActItem[]) || [];
        const profs = (realProfiles as unknown as ProfileWithPatrol[]) || [];

        // Calcul des km en attente pour la période et le sport sélectionnés
        const pendingForSport = acts.filter((a) => {
          if (a.status !== "pending") return false;
          if (range?.from && a.ride_date < range.from) return false;
          if (range?.to && a.ride_date > range.to) return false;
          const sport = getActivitySport(a);
          if (sportMode !== "all" && sport !== sportMode) return false;
          return true;
        });
        const sumPending = pendingForSport.reduce((acc, curr) => acc + Number(curr.km || 0), 0);
        setPendingKm(Number(sumPending.toFixed(1)));

        // Classement Peloton : sorties à plusieurs de la période et du sport choisis
        const peloton = computePeloton(
          acts.filter((a) => {
            if (range?.from && a.ride_date < range.from) return false;
            if (range?.to && a.ride_date > range.to) return false;
            const sport = getActivitySport(a);
            if (sportMode !== "all" && sport !== sportMode) return false;
            return true;
          }),
        );

        const items: LeaderboardItem[] = profs
          .map((p) => {
            const pt = p.patrols;
            // Staff = membre d'une patrouille staff. Être admin ou ne pas avoir
            // d'année scout ne suffit pas (un admin sans patrouille compte comme staff).
            const isStaffOrChef = isStaffPatrol(pt) || (!pt && !!p.is_admin);

            const userActs = acts.filter((a) => {
              if (a.user_id !== p.id) return false;
              if (range?.from && a.ride_date < range.from) return false;
              if (range?.to && a.ride_date > range.to) return false;
              if (a.status !== "approved") return false;

              // Filtre selon le Mode Sport sélectionné (Vélo vs Course à pied vs Tous)
              const sport = getActivitySport(a);
              if (sportMode !== "all" && sport !== sportMode) return false;

              return true;
            });

            const totalKm = userActs.reduce((acc, curr) => acc + Number(curr.km || 0), 0);
            const totalDplus = userActs.reduce(
              (acc, curr) => acc + Number(curr.elevation_m || 0),
              0,
            );
            const distanceTotals: Record<ActivitySport, number> = {
              velo: 0,
              course: 0,
              marche: 0,
            };
            acts
              .filter((activity) => activity.user_id === p.id && activity.status === "approved")
              .forEach((activity) => {
                distanceTotals[getActivitySport(activity)] += Number(activity.km || 0);
              });
            const displayName = p.totem
              ? `${p.totem}${p.quali ? ` ${p.quali}` : ""}`
              : p.full_name || "Scout";

            return {
              user_id: p.id,
              display_name: displayName,
              totem: p.totem,
              quali: p.quali,
              full_name: p.full_name,
              patrol_id: p.patrol_id || "",
              patrol_name:
                pt?.name || (isStaffOrChef ? TROOP_STAFF_PATROL_NAME : "Sans patrouille"),
              category: isStaffOrChef ? "staff" : (pt?.category as "homme" | "femme") || "homme",
              km: Number(totalKm.toFixed(1)),
              dplus: Math.round(totalDplus),
              distanceTotals,
              scout_year: p.scout_year ?? undefined,
              is_chef: isStaffOrChef,
              peloton: peloton.get(p.id),
            };
          })
          .sort((a, b) => b.km - a.km);

        return items;
      } catch (error) {
        console.error("Erreur de synchronisation du classement :", error);
        throw error;
      }
    },
  });

  const selectedUserIds = selectedEntry?.userIds ?? [];
  const { data: entryActivities = [], isLoading: isEntryActivitiesLoading } = useQuery({
    queryKey: ["leaderboard-entry-activities", selectedUserIds, period, sportMode],
    enabled: !!selectedEntry && selectedUserIds.length > 0,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities_public")
        .select("user_id, km, elevation_m, ride_date, note, group_ride_id")
        .in("user_id", selectedUserIds)
        .eq("status", "approved")
        .order("ride_date", { ascending: false });
      if (error) throw error;
      return ((data as unknown as RankedActivity[]) || []).filter((activity) => {
        if (range?.from && activity.ride_date < range.from) return false;
        if (range?.to && activity.ride_date > range.to) return false;
        return sportMode === "all" || getActivitySport(activity) === sportMode;
      });
    },
  });

  const { data: patrols = [] } = useQuery<Patrol[]>({
    queryKey: ["patrols"],
    queryFn: async () => {
      const res = (await supabase.from("patrols").select("*").order("name")) as {
        data: Patrol[] | null;
      };
      return res?.data ?? [];
    },
  });

  // Filter scouts by gender category AND scout year
  // Rule: Patrol "Staff" / scouts who are staff are considered both "homme et femme" (fille et garçon)
  const filteredScouts = useMemo(() => {
    if (!Array.isArray(leaderboardData)) return [];
    return leaderboardData.filter((r) => {
      if (!r) return false;
      const isStaffOrChef = !!r.is_chef || r.category === "staff";

      // 1. Catégorie : le staff apparaît chez les Garçons ET chez les Filles
      if (!matchesCategory(r.category, isStaffOrChef, cat)) return false;

      // 2. Scout year filter:
      if (scoutYear !== "all") {
        if (scoutYear === "chef") {
          if (!isStaffOrChef) return false;
        } else if (scoutYear === "scouts") {
          // Scouts de 1re à 4e année ensemble, sans le staff
          if (isStaffOrChef) return false;
        } else {
          const targetYear = Number(scoutYear);
          if (isStaffOrChef || r.scout_year !== targetYear) {
            return false;
          }
        }
      }

      return true;
    });
  }, [leaderboardData, cat, scoutYear]);

  // Aggregate patrol rows
  const patrolRows = useMemo(() => {
    if (!Array.isArray(patrols)) return [];

    // Ensure Staff patrol is always in the list of patrols
    const hasStaff = patrols.some((p) => isStaffPatrol(p));
    const combinedPatrols = hasStaff
      ? patrols
      : [
          {
            id: "staff",
            name: TROOP_STAFF_PATROL_NAME,
            category: "homme" as const,
            created_at: new Date().toISOString(),
          },
          ...patrols,
        ];

    return combinedPatrols
      .filter((p) => {
        if (!p) return false;
        const staff = isStaffPatrol(p);
        // Filtre « Staff » : uniquement les patrouilles staff ;
        // filtre par année : pas de patrouilles staff (elles n'ont pas d'année)
        if (scoutYear === "chef" && !staff) return false;
        if (scoutYear !== "all" && scoutYear !== "chef" && staff) return false;
        // Les patrouilles staff apparaissent chez les Garçons ET chez les Filles
        return matchesCategory(p.category, staff, cat);
      })
      .map((p) => {
        const staffPatrol = isStaffPatrol(p);

        // Membres de la patrouille. Les animateurs sans patrouille sont rattachés
        // à la patrouille « Staff troupe » (et pas à chacune des patrouilles staff).
        const isMainStaffPatrol = staffPatrol && (isTroopStaffPatrol(p) || p.id === "staff");
        const members = Array.isArray(filteredScouts)
          ? filteredScouts.filter((r) => {
              if (!r) return false;
              if (r.patrol_id === p.id) return true;
              return isMainStaffPatrol && r.is_chef && !r.patrol_id;
            })
          : [];
        const km = members.reduce((s, r) => s + Number(r?.km || 0), 0);
        const pelotonPoints = members.reduce((s, r) => s + (r?.peloton?.points || 0), 0);
        return {
          id: p.id,
          name: p.name,
          category: staffPatrol ? "staff" : p.category,
          isChef: staffPatrol,
          members: members.length,
          km,
          pelotonPoints: Math.round(pelotonPoints * 10) / 10,
        };
      })
      .sort((a, b) => b.km - a.km);
  }, [patrols, filteredScouts, cat, scoutYear]);

  const scoutRows = useMemo(() => {
    let list = [...filteredScouts].sort((a, b) => Number(b.km) - Number(a.km));
    if (scoutSearch.trim()) {
      const q = scoutSearch.toLowerCase().trim();
      list = list.filter(
        (s) =>
          s.display_name.toLowerCase().includes(q) ||
          s.patrol_name.toLowerCase().includes(q) ||
          (s.full_name && s.full_name.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [filteredScouts, scoutSearch]);

  const totalKm = useMemo(() => {
    return filteredScouts.reduce((s, r) => s + Number(r.km || 0), 0);
  }, [filteredScouts]);

  const topPatrol = useMemo(() => {
    return patrolRows.find((p) => Number(p.km) > 0) || null;
  }, [patrolRows]);

  const topScout = useMemo(() => {
    return scoutRows.find((s) => Number(s.km) > 0) || null;
  }, [scoutRows]);

  const activeScoutsCount = useMemo(() => {
    return filteredScouts.filter((s) => Number(s.km || 0) > 0).length;
  }, [filteredScouts]);

  const rankedPatrols = useMemo(() => {
    let r = 1;
    return patrolRows.map((p) => {
      const isRanked = Number(p.km) > 0;
      return {
        ...p,
        rank: isRanked ? r++ : 0,
      };
    });
  }, [patrolRows]);

  // Maillots : calculés sur tous les participants (indépendamment des filtres genre/année)
  const jerseys = useMemo(
    () => computeJerseys(Array.isArray(leaderboardData) ? leaderboardData : []),
    [leaderboardData],
  );
  const jerseyHolderIds = useMemo(() => {
    const yellow = new Set<string>();
    const climber = new Set<string>();
    const white = new Set<string>();
    for (const h of Object.values(jerseys)) {
      if (h.yellow) yellow.add(h.yellow.user_id);
      if (h.climber) climber.add(h.climber.user_id);
      if (h.white) white.add(h.white.user_id);
    }
    return { yellow, climber, white };
  }, [jerseys]);

  const rankedScouts = useMemo(() => {
    let r = 1;
    return scoutRows.map((s) => {
      const isRanked = Number(s.km) > 0;
      return {
        ...s,
        rank: isRanked ? r++ : 0,
      };
    });
  }, [scoutRows]);

  const openScoutProfile = (scout: LeaderboardItem) => {
    void navigate({ to: "/scout/$scoutId", params: { scoutId: scout.user_id } });
  };

  const openPatrolActivities = (patrol: (typeof rankedPatrols)[number]) => {
    const isMainStaffPatrol =
      isStaffPatrol(patrol) && (isTroopStaffPatrol(patrol) || patrol.id === "staff");
    const userIds = filteredScouts
      .filter(
        (scout) =>
          scout.patrol_id === patrol.id || (isMainStaffPatrol && scout.is_chef && !scout.patrol_id),
      )
      .map((scout) => scout.user_id);
    setSelectedEntry({ title: patrol.name, userIds });
  };

  return (
    <div className="mobile-home-page min-h-screen bg-background">
      {/* Hero Section */}
      <section className="mobile-home-hero relative overflow-hidden bg-bark text-bark-foreground">
        <img
          src={themeBackground ?? hero}
          alt={
            themeBackground
              ? "Photo de la troupe"
              : "Le drapeau de la troupe au bord du circuit des 24h vélo"
          }
          className={cn(
            "absolute inset-0 h-full w-full object-cover opacity-70 transition-opacity",
            themeBackground ? "object-center" : "object-[75%_68%] md:object-[50%_60%]",
          )}
        />
        {/* Voile aux couleurs du thème pour atténuer les couleurs de la photo */}
        <div className="absolute inset-0 bg-primary/35 mix-blend-multiply" />
        <div className="absolute inset-0 bg-gradient-to-t from-bark via-bark/55 to-transparent" />
        <div className="relative mx-auto max-w-6xl px-4 py-16 md:py-24">
          <div className="max-w-3xl">
            <div className="inline-flex items-center gap-2 rounded-full bg-primary px-3.5 py-1 text-xs font-bold uppercase tracking-widest text-primary-foreground shadow-md">
              {sportMode === "course" || sportMode === "marche" ? (
                <ModeIcon mode={sportMode} className="h-4 w-4" />
              ) : (
                <Tent className="h-4 w-4" />
              )}
              <span>
                {sportMode === "course"
                  ? "ALEZAN 42 — Défi Course à Pied Inter-Patrouilles 🏃"
                  : sportMode === "marche"
                    ? "ALEZAN 42 — Défi Marche Inter-Patrouilles 🥾"
                    : sportMode === "all"
                      ? "ALEZAN 42 — Défi Combiné (Vélo, Course & Marche) 🏆"
                      : "ALEZAN 42 — Défi Vélo Inter-Patrouilles 🚴"}
              </span>
            </div>
            <h1 className="mt-4 font-display text-4xl font-black leading-tight text-white md:text-6xl">
              {sportMode === "course"
                ? "Qui courra le plus loin cette semaine ?"
                : sportMode === "marche"
                  ? "Qui marchera le plus loin cette semaine ?"
                  : "Qui pédalera le plus loin cette semaine ?"}
            </h1>
            <p className="mobile-hero-description mt-4 max-w-2xl text-base text-bark-foreground/90 md:text-lg">
              {sportMode === "course"
                ? "Chaque foulée compte pour ta patrouille ! Enregistre tes sorties de course à pied avec Strava ou photo de chrono, grimpe au classement dédié et fais briller tes couleurs."
                : sportMode === "marche"
                  ? "Chaque pas compte pour ta patrouille ! Enregistre tes marches et randos avec Strava ou une capture de ton appli, grimpe au classement dédié et fais briller tes couleurs."
                  : "Chaque kilomètre compte pour ta patrouille ! Enregistre tes sorties avec Strava ou ta photo de compteur, grimpe au classement général et fais briller tes couleurs. Toujours prêts !"}
            </p>

            <a
              href="https://www.strava.com/clubs/Troupe-Alezan42"
              target="_blank"
              rel="noreferrer"
              className="mobile-hero-secondary mt-5 inline-flex max-w-full items-center gap-3 rounded-2xl border border-white/25 bg-white/10 px-4 py-3 text-white shadow-lg backdrop-blur-sm transition hover:bg-white/20"
            >
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#fc4c02] text-lg font-black">
                S
              </span>
              <span className="text-left">
                <span className="block text-sm font-bold">Retrouve-nous sur Strava</span>
                <span className="block text-xs text-white/80">
                  Rejoins le club Troupe de l’Alezan
                </span>
              </span>
              <ExternalLink className="ml-1 h-4 w-4 shrink-0 text-white/80" />
            </a>

            {/* Scout Identity Bandeau (Visible when logged in) */}
            {user && (
              <div className="mt-6 rounded-2xl border border-white/20 bg-black/50 p-4 backdrop-blur-md shadow-xl">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <span className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-black text-2xl shadow-md">
                      ⚜️
                    </span>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-black text-white text-base sm:text-lg">
                          {profile?.totem
                            ? `${profile.totem}${profile.quali ? ` ${profile.quali}` : ""}`
                            : profile?.full_name || user.email?.split("@")[0]}
                        </span>
                        <span className="rounded-full bg-amber-400/20 border border-amber-400/40 px-2.5 py-0.5 text-xs font-bold text-amber-300">
                          {profile?.patrol_name
                            ? isStaffPatrol({
                                name: profile.patrol_name,
                                category: profile.patrol_category ?? null,
                              })
                              ? `${getPatrolEmblem(profile.patrol_name)} ${profile.patrol_name}`
                              : `${getPatrolEmblem(profile.patrol_name)} Patrouille ${profile.patrol_name}`
                            : "Patrouille assignée"}
                        </span>
                        {profile?.is_chef ? (
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/90 font-bold">
                            Staff
                          </span>
                        ) : profile?.scout_year ? (
                          <span className="rounded bg-white/10 px-2 py-0.5 text-[11px] text-white/90 font-medium">
                            {profile.scout_year}ᵉ année
                          </span>
                        ) : null}
                        {isAdmin && (
                          <span className="rounded-full bg-orange-500/20 border border-orange-500/30 px-2 py-0.5 text-[11px] font-bold text-orange-300">
                            👑 Admin
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-white/80 mt-1 font-medium">
                        {user.email} · Prêt à enregistrer de nouveaux kilomètres pour ta patrouille
                        !
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      asChild
                      size="sm"
                      className="rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow"
                    >
                      <Link to="/mes-km">Mes kilomètres</Link>
                    </Button>
                    <Button
                      asChild
                      size="sm"
                      className="rounded-xl border border-white/25 bg-[color:var(--cta-2)] font-bold text-[color:var(--cta-2-foreground)] shadow-sm hover:bg-[color:var(--cta-2)]/85"
                    >
                      <Link to="/profil">Mon profil</Link>
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {user && (
              <div className="mt-4 max-w-md">
                <NearestDistanceTrophy activities={myApprovedActivities} compact />
              </div>
            )}

            {/* Quick Actions */}
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Button
                asChild
                size="lg"
                className="rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg"
              >
                <Link to="/mes-km">
                  <ModeIcon mode={sportMode} className="mr-2 h-5 w-5" />
                  <span>
                    {sportMode === "course"
                      ? "Enregistrer ma course à pied"
                      : sportMode === "marche"
                        ? "Enregistrer ma marche"
                        : "Enregistrer mes kilomètres"}
                  </span>
                </Link>
              </Button>
              {!user && (
                <Button
                  asChild
                  size="lg"
                  className="rounded-xl font-bold bg-orange-600 text-white hover:bg-orange-500 shadow-lg"
                >
                  <Link to="/auth">
                    <LogIn className="mr-2 h-5 w-5" />
                    Connexion / Inscription
                  </Link>
                </Button>
              )}
              <Button
                asChild
                variant="outline"
                size="lg"
                className="rounded-xl font-semibold border-white/20 bg-black/40 text-white hover:bg-white/20 backdrop-blur-sm"
              >
                <Link to="/timeline">
                  Voir la timeline & archives
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>
      <div className="mx-auto max-w-6xl px-4 pt-5">
        <div
          aria-label="Le cheval de la troupe s'appelle Alezouille"
          className="flex items-center gap-4 rounded-2xl border border-border/80 bg-card px-4 py-3 shadow-sm sm:px-5"
        >
          <span
            aria-hidden="true"
            className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-primary/10 text-2xl"
          >
            🐴
          </span>
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-muted-foreground">
              Le cheval de la troupe
            </p>
            <p className="font-display text-lg font-bold text-foreground">Alezouille</p>
          </div>
        </div>
      </div>

      {/* Main Container */}
      <main className="mx-auto max-w-6xl px-4 py-8 space-y-8">
        {/* Grand Compte à Rebours */}
        <div id="compte-a-rebours" className="scroll-mt-6">
          <CountdownBanner isAdmin={isAdmin} />
        </div>

        {/* Défis ouverts destinés au scout connecté */}
        <div id="defis" className="scroll-mt-6">
          <ChallengesBanner />
        </div>

        {/* Anniversaires : membres connectés uniquement */}
        <BirthdayBanner userId={user?.id} />

        {/* SÉLECTEUR DU SPORT (VÉLO / COURSE À PIED / MARCHE / COMBINÉ) */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-3 shadow-sm">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <span className="text-xs font-black uppercase tracking-wider text-muted-foreground mr-1">
              Discipline :
            </span>
            <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
              <button
                type="button"
                onClick={() => setSportMode("velo")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm font-black transition-all",
                  sportMode === "velo"
                    ? "bg-primary text-primary-foreground shadow-sm scale-102"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <Bike className="h-4 w-4" />
                <span>Mode Vélo 🚴</span>
              </button>

              <button
                type="button"
                onClick={() => setSportMode("course")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm font-black transition-all",
                  sportMode === "course"
                    ? "bg-purple-600 text-white shadow-sm scale-102"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <Footprints className="h-4 w-4" />
                <span>Mode Course à pied 🏃</span>
              </button>

              <button
                type="button"
                onClick={() => setSportMode("marche")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm font-black transition-all",
                  sportMode === "marche"
                    ? "bg-sky-600 text-white shadow-sm scale-102"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <PersonStanding className="h-4 w-4" />
                <span>Mode Marche 🥾</span>
              </button>

              <button
                type="button"
                onClick={() => setSportMode("all")}
                className={cn(
                  "flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-xs sm:px-4 sm:text-sm font-black transition-all",
                  sportMode === "all"
                    ? "bg-amber-600 text-white shadow-sm scale-102"
                    : "bg-muted/50 text-muted-foreground hover:text-foreground",
                )}
              >
                <Trophy className="h-4 w-4" />
                <span>Combiné (Tous) 🏆</span>
              </button>
            </div>
          </div>

          <div className="text-xs text-muted-foreground font-semibold flex items-center gap-1.5 self-end sm:self-center">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" />
            <span>
              Classement dédié{" "}
              {sportMode === "all"
                ? "Général"
                : sportMode === "course"
                  ? "Course à pied"
                  : SPORT_INFO[sportMode].short}
            </span>
          </div>
        </div>

        <div className="grid grid-cols-[0.8fr_1.2fr] gap-3 sm:grid-cols-[minmax(220px,0.8fr)_minmax(0,1.2fr)] sm:gap-4">
          <section
            aria-label="Mes kilomètres validés cette semaine"
            className="flex min-h-24 flex-col justify-center rounded-2xl border border-border/80 bg-card p-3 shadow-sm sm:p-4"
          >
            <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground sm:text-xs">
              Mes km cette semaine
            </div>
            {user ? (
              <>
                <div className="mt-1 font-display text-2xl font-black text-foreground sm:text-3xl">
                  {myWeekKm.toLocaleString("fr-BE", { maximumFractionDigits: 1 })}
                  <span className="ml-1 text-sm font-semibold text-muted-foreground">km</span>
                </div>
                <p className="mt-0.5 text-[10px] text-muted-foreground sm:text-xs">
                  sorties validées
                </p>
              </>
            ) : (
              <Link to="/auth" className="mt-2 text-xs font-semibold text-primary hover:underline">
                Connecte-toi pour voir tes km
              </Link>
            )}
          </section>
          <ExpeditionGoal
            totalKm={troopTotalKm}
            onOpen={() => {
              setView("map");
              window.setTimeout(
                () =>
                  document
                    .getElementById("classement")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" }),
                80,
              );
            }}
          />
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-5">
          <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Sorties validées
              </span>
              <span className="rounded-lg bg-primary/10 p-2 text-primary">
                <Bike className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-2 font-display text-2xl font-black text-foreground sm:text-3xl">
              {globalActivityCount.toLocaleString("fr-BE")}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">tous sports, depuis le début</p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {sportMode === "course"
                  ? "Total couru à pied"
                  : sportMode === "velo"
                    ? "Total parcouru à vélo"
                    : sportMode === "marche"
                      ? "Total marché"
                      : "Total cumulé"}
              </span>
              <span
                className={cn(
                  "rounded-lg p-2",
                  sportMode === "course"
                    ? "bg-purple-500/10 text-purple-600"
                    : sportMode === "marche"
                      ? "bg-sky-500/10 text-sky-600"
                      : "bg-primary/10 text-primary",
                )}
              >
                {sportMode === "velo" || sportMode === "all" ? (
                  <Flame className="h-5 w-5" />
                ) : (
                  <ModeIcon mode={sportMode} className="h-5 w-5" />
                )}
              </span>
            </div>
            <div className="mt-2 font-display text-2xl font-black text-foreground sm:text-3xl flex flex-wrap items-baseline gap-2">
              <span>{totalKm.toFixed(1)}</span>
              <span className="text-base font-normal text-muted-foreground">km</span>
              {pendingKm > 0 && (
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full">
                  <Clock className="h-3 w-3 shrink-0" />+{pendingKm.toFixed(1)} km en attente
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {period === "week"
                ? "cette semaine en cours"
                : period === "last"
                  ? "sur la semaine passée"
                  : period === "month"
                    ? "ce mois-ci"
                    : period === "lastMonth"
                      ? "sur le mois passé"
                      : "cumul depuis le lancement"}
            </p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Patrouille en tête
              </span>
              <span className="rounded-lg bg-amber-500/10 p-2 text-amber-500">
                <Crown className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-2 truncate font-display text-xl font-black text-foreground sm:text-2xl">
              {topPatrol ? topPatrol.name : "—"}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {topPatrol
                ? `${topPatrol.km.toFixed(1)} km (${sportMode === "all" ? "tous sports" : SPORT_INFO[sportMode].short.toLowerCase()})`
                : "En attente de sorties"}
            </p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                {sportMode === "course"
                  ? "Premier Coureur"
                  : sportMode === "velo"
                    ? "Premier Cycliste"
                    : sportMode === "marche"
                      ? "Premier Marcheur"
                      : "Premier Scout"}
              </span>
              <span className="rounded-lg bg-emerald-500/10 p-2 text-emerald-600">
                <Trophy className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-2 truncate font-display text-xl font-black text-foreground sm:text-2xl">
              {topScout ? topScout.display_name : "—"}
            </div>
            <p className="mt-1 truncate text-xs text-muted-foreground">
              {topScout
                ? `${topScout.km.toFixed(1)} km (${topScout.patrol_name})`
                : "En attente de sorties"}
            </p>
          </div>

          <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Scouts actifs
              </span>
              <span className="rounded-lg bg-blue-500/10 p-2 text-blue-600">
                <Users className="h-5 w-5" />
              </span>
            </div>
            <div className="mt-2 font-display text-2xl font-black text-foreground sm:text-3xl">
              {activeScoutsCount}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {activeScoutsCount === 0
                ? "aucun scout classé cette session"
                : activeScoutsCount === 1
                  ? "1 scout classé cette session"
                  : `${activeScoutsCount} scouts classés cette session`}
            </p>
          </div>
        </div>

        {/* Live Recent Activity Feed */}
        <RecentActivityFeed limit={5} />

        {/* Filter Controls Bar */}
        <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm space-y-4">
          {/* Row 1: Periods & Genders */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mr-1">
                Période :
              </span>
              {(Object.keys(PERIOD_LABELS) as Period[]).map((p) => (
                <FilterPill key={p} active={period === p} onClick={() => setPeriod(p)}>
                  {PERIOD_LABELS[p]}
                </FilterPill>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <span className="text-xs font-bold text-muted-foreground uppercase tracking-wider mr-1">
                Genre :
              </span>
              <FilterPill active={cat === "all"} onClick={() => setCat("all")}>
                Toutes
              </FilterPill>
              <FilterPill active={cat === "homme"} onClick={() => setCat("homme")}>
                Garçons
              </FilterPill>
              <FilterPill active={cat === "femme"} onClick={() => setCat("femme")}>
                Filles
              </FilterPill>
            </div>
          </div>

          {/* Row 2: Scout Year Filter */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 pt-3 border-t">
            <div className="flex items-center gap-1.5 text-xs font-bold text-muted-foreground uppercase tracking-wider mr-1">
              <Filter className="h-3.5 w-3.5" />
              <span>Année Scout :</span>
            </div>
            <FilterPill active={scoutYear === "all"} onClick={() => setScoutYear("all")}>
              Toutes années
            </FilterPill>
            <FilterPill active={scoutYear === "scouts"} onClick={() => setScoutYear("scouts")}>
              Scouts (1re à 4e)
            </FilterPill>
            <FilterPill active={scoutYear === "1"} onClick={() => setScoutYear("1")}>
              1ère année
            </FilterPill>
            <FilterPill active={scoutYear === "2"} onClick={() => setScoutYear("2")}>
              2ème année
            </FilterPill>
            <FilterPill active={scoutYear === "3"} onClick={() => setScoutYear("3")}>
              3ème année
            </FilterPill>
            <FilterPill active={scoutYear === "4"} onClick={() => setScoutYear("4")}>
              4ème année
            </FilterPill>
            <FilterPill active={scoutYear === "chef"} onClick={() => setScoutYear("chef")}>
              👑 Staff
            </FilterPill>
          </div>
        </div>

        {/* Maillots : jaune (km) et à pois (D+) par catégorie, selon la période et le sport */}
        <div id="maillots" className="scroll-mt-6">
          <JerseysPanel jerseys={jerseys} periodLabel={PERIOD_LABELS[period]} />
        </div>

        {/* Scout sportif du mois (affiché dès qu'un premier lauréat est désigné) */}
        <ScoutSportifCard />

        {/* View Switcher: Patrouilles vs Individuel vs Tendances Graphique */}
        <div
          id="classement"
          className="scroll-mt-6 flex flex-col sm:flex-row sm:items-center justify-between border-b pb-2 gap-3"
        >
          <div className="flex items-center gap-2 sm:gap-4 overflow-x-auto">
            <button
              onClick={() => setView("patrols")}
              className={cn(
                "relative pb-3 font-display text-base sm:text-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5",
                view === "patrols"
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ModeIcon mode={sportMode} className="h-4 w-4" colored />
              <span>
                Classement Patrouilles{" "}
                <span className="text-xs font-normal opacity-80">
                  ({sportMode === "all" ? "Tous" : SPORT_INFO[sportMode].short})
                </span>{" "}
                ({patrolRows.length})
              </span>
            </button>
            <button
              onClick={() => setView("scouts")}
              className={cn(
                "relative pb-3 font-display text-base sm:text-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5",
                view === "scouts"
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Trophy className="h-4 w-4 text-amber-500" />
              <span>
                Classement Individuel{" "}
                <span className="text-xs font-normal opacity-80">
                  ({sportMode === "all" ? "Tous" : SPORT_INFO[sportMode].short})
                </span>{" "}
                ({scoutRows.length})
              </span>
            </button>
            <button
              onClick={() => setView("challenges")}
              className={cn(
                "relative pb-3 font-display text-base sm:text-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5",
                view === "challenges"
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Award className="h-4 w-4 text-amber-500" />
              <span>Défis</span>
            </button>
            <button
              onClick={() => setView("peloton")}
              className={cn(
                "relative pb-3 font-display text-base sm:text-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5",
                view === "peloton"
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Users className="h-4 w-4 text-orange-500" />
              <span>Peloton</span>
            </button>
            <button
              onClick={() => setView("chart")}
              className={cn(
                "relative pb-3 font-display text-base sm:text-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5",
                view === "chart"
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <BarChart3 className="h-4 w-4 text-primary" />
              <span>Tendances 7 jours</span>
            </button>
            <button
              onClick={() => setView("map")}
              className={cn(
                "relative pb-3 font-display text-base sm:text-xl font-bold transition-all whitespace-nowrap flex items-center gap-1.5",
                view === "map"
                  ? "text-foreground after:absolute after:bottom-0 after:left-0 after:right-0 after:h-1 after:rounded-full after:bg-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Compass className="h-4 w-4 text-emerald-500" />
              <span>Carte & Expédition</span>
            </button>
          </div>

          <span className="hidden text-xs text-muted-foreground md:inline">
            Mise à jour automatique toutes les 30 s
          </span>
        </div>

        {/* View Content */}
        {view === "challenges" ? (
          <ChallengesPanel />
        ) : view === "map" ? (
          <CollectiveRouteMap />
        ) : view === "chart" ? (
          <PatrolDailyContributionChart />
        ) : isLeaderboardLoading ? (
          <div className="rounded-2xl border bg-card p-12 text-center">
            <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
            <p className="mt-3 text-sm text-muted-foreground">Calcul des kilomètres en cours…</p>
          </div>
        ) : isLeaderboardError && !leaderboardData ? (
          <div className="rounded-2xl border border-destructive/30 bg-card p-10 text-center text-sm text-muted-foreground">
            Impossible de synchroniser le classement. Réessaie dans quelques instants.
          </div>
        ) : view === "peloton" ? (
          <PelotonPanel scouts={filteredScouts} patrols={patrolRows} sportMode={sportMode} />
        ) : view === "patrols" ? (
          <div className="space-y-3">
            {rankedPatrols.length === 0 ? (
              <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">
                Aucune patrouille ne correspond aux filtres sélectionnés.
              </div>
            ) : (
              rankedPatrols.map((p) => (
                <PatrolLeaderboardRow
                  key={p.id}
                  rank={p.rank}
                  name={p.name}
                  category={p.category}
                  isChef={p.isChef}
                  members={p.members}
                  km={p.km}
                  maxKm={rankedPatrols[0]?.km || 1}
                  sportMode={sportMode}
                  onClick={() => openPatrolActivities(p)}
                />
              ))
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {/* Search bar & count */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card p-3 rounded-2xl border border-border/80 shadow-sm">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <input
                  type="text"
                  value={scoutSearch}
                  onChange={(e) => setScoutSearch(e.target.value)}
                  placeholder="Rechercher par totem, qualificatif ou patrouille..."
                  className="w-full bg-background rounded-xl pl-9 pr-4 py-2 text-sm border border-input focus:outline-none focus:ring-2 focus:ring-primary/20"
                />
              </div>
              <div className="text-xs text-muted-foreground shrink-0 font-medium px-2">
                {activeScoutsCount > 0
                  ? `${activeScoutsCount} classé${activeScoutsCount > 1 ? "s" : ""} • ${scoutRows.length} scout${scoutRows.length > 1 ? "s" : ""} au total`
                  : `${scoutRows.length} scout${scoutRows.length > 1 ? "s" : ""} répertorié${scoutRows.length > 1 ? "s" : ""}`}
              </div>
            </div>

            {/* Top 3 Podium (Shown when not searching and when top scout has km) */}
            {!scoutSearch && scoutRows.length >= 2 && (scoutRows[0]?.km || 0) > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                {/* 2nd place */}
                {scoutRows[1] && (
                  <button
                    type="button"
                    onClick={() => openScoutProfile(scoutRows[1])}
                    className="rounded-2xl border border-slate-300/40 bg-card p-4 shadow-sm flex flex-col justify-between order-2 md:order-1 text-left hover:border-primary/50 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-slate-200 text-slate-800 font-black text-sm">
                        2
                      </span>
                      <Medal className="h-5 w-5 text-slate-400" />
                    </div>
                    <div className="mt-3">
                      <h4 className="font-display font-bold text-base text-foreground truncate">
                        {scoutRows[1].display_name}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {scoutRows[1].patrol_name}
                      </p>
                    </div>
                    <CumulativeDistanceBadges totals={scoutRows[1].distanceTotals} />
                    <div className="mt-3 pt-2 border-t font-display font-black text-lg text-foreground flex items-center gap-1">
                      <ModeIcon mode={sportMode} className="h-4 w-4" colored />
                      <span>{scoutRows[1].km.toFixed(1)}</span>
                      <span className="text-xs font-semibold text-muted-foreground">km</span>
                    </div>
                  </button>
                )}

                {/* 1st place */}
                {scoutRows[0] && (
                  <button
                    type="button"
                    onClick={() => openScoutProfile(scoutRows[0])}
                    className="rounded-2xl border border-amber-400/50 bg-gradient-to-b from-amber-500/10 via-card to-card p-5 shadow-md flex flex-col justify-between order-1 md:order-2 md:-translate-y-2 text-left hover:border-primary/50 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 text-white font-black text-base shadow">
                        1
                      </span>
                      <Crown className="h-6 w-6 text-amber-500 animate-bounce" />
                    </div>
                    <div className="mt-4">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">
                        {sportMode === "course"
                          ? "🏃 Meilleur Coureur"
                          : sportMode === "marche"
                            ? "🥾 Meilleur Marcheur"
                            : "🚴 Maillot Jaune"}
                      </span>
                      <h4 className="font-display font-black text-lg text-foreground truncate">
                        {scoutRows[0].display_name}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {scoutRows[0].patrol_name}
                      </p>
                    </div>
                    <CumulativeDistanceBadges totals={scoutRows[0].distanceTotals} />
                    <div className="mt-4 pt-2 border-t font-display font-black text-2xl text-amber-600 dark:text-amber-400 flex items-center gap-1">
                      <ModeIcon mode={sportMode} className="h-5 w-5" colored />
                      <span>{scoutRows[0].km.toFixed(1)}</span>
                      <span className="text-xs font-semibold text-muted-foreground">km</span>
                    </div>
                  </button>
                )}

                {/* 3rd place */}
                {scoutRows[2] && (
                  <button
                    type="button"
                    onClick={() => openScoutProfile(scoutRows[2])}
                    className="rounded-2xl border border-amber-700/30 bg-card p-4 shadow-sm flex flex-col justify-between order-3 text-left hover:border-primary/50 hover:shadow-md transition-all"
                  >
                    <div className="flex items-center justify-between">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-amber-800 text-amber-100 font-black text-sm">
                        3
                      </span>
                      <Award className="h-5 w-5 text-amber-700" />
                    </div>
                    <div className="mt-3">
                      <h4 className="font-display font-bold text-base text-foreground truncate">
                        {scoutRows[2].display_name}
                      </h4>
                      <p className="text-xs text-muted-foreground truncate">
                        {scoutRows[2].patrol_name}
                      </p>
                    </div>
                    <CumulativeDistanceBadges totals={scoutRows[2].distanceTotals} />
                    <div className="mt-3 pt-2 border-t font-display font-black text-lg text-foreground flex items-center gap-1">
                      <ModeIcon mode={sportMode} className="h-4 w-4" colored />
                      <span>{scoutRows[2].km.toFixed(1)}</span>
                      <span className="text-xs font-semibold text-muted-foreground">km</span>
                    </div>
                  </button>
                )}
              </div>
            )}

            {/* Scout Rows List */}
            <div className="space-y-3">
              {rankedScouts.length === 0 ? (
                <div className="rounded-2xl border bg-card p-10 text-center text-muted-foreground">
                  Aucun scout ne correspond aux filtres sélectionnés.
                </div>
              ) : (
                rankedScouts.map((s) => (
                  <ScoutLeaderboardRow
                    key={s.user_id}
                    rank={s.rank}
                    displayName={s.display_name}
                    patrolName={s.patrol_name}
                    scoutYear={s.scout_year ?? null}
                    isChef={s.is_chef}
                    km={s.km}
                    dplus={s.dplus}
                    distanceTotals={s.distanceTotals}
                    yellowJersey={jerseyHolderIds.yellow.has(s.user_id)}
                    climberJersey={jerseyHolderIds.climber.has(s.user_id)}
                    whiteJersey={jerseyHolderIds.white.has(s.user_id)}
                    maxKm={rankedScouts[0]?.km || 1}
                    sportMode={sportMode}
                    onClick={() => openScoutProfile(s)}
                  />
                ))
              )}
            </div>
          </div>
        )}
      </main>
      <Dialog open={!!selectedEntry} onOpenChange={(open) => !open && setSelectedEntry(null)}>
        <DialogContent className="max-h-[85vh] overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Sorties de {selectedEntry?.title}</DialogTitle>
            <DialogDescription>
              Sorties approuvées correspondant aux filtres du classement : {PERIOD_LABELS[period]} ·{" "}
              {sportMode === "all" ? "Tout" : SPORT_INFO[sportMode].short}.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-2 overflow-y-auto pr-1">
            {isEntryActivitiesLoading ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Chargement des sorties…
              </p>
            ) : entryActivities.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Aucune sortie approuvée ne correspond à ces filtres.
              </p>
            ) : (
              entryActivities.map((activity, index) => {
                const member = leaderboardData.find((scout) => scout.user_id === activity.user_id);
                const sport = getActivitySport(activity);
                return (
                  <div
                    key={`${activity.user_id}-${activity.ride_date}-${index}`}
                    className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
                  >
                    <div className="min-w-0">
                      {selectedEntry.userIds.length > 1 && (
                        <p className="truncate text-xs font-semibold text-foreground">
                          {member?.display_name ?? "Membre"}
                        </p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        {new Date(`${activity.ride_date}T12:00:00`).toLocaleDateString("fr-BE")} ·{" "}
                        {SPORT_INFO[sport].label}
                      </p>
                      {activity.note && !activity.note.startsWith("[") && (
                        <p className="truncate text-xs text-muted-foreground">{activity.note}</p>
                      )}
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="font-display font-bold">{Number(activity.km).toFixed(1)} km</p>
                      {activity.elevation_m ? (
                        <p className="text-[11px] text-muted-foreground">
                          {activity.elevation_m} m D+
                        </p>
                      ) : null}
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {entryActivities.length > 0 && (
            <p className="border-t pt-3 text-right text-sm font-bold">
              Total affiché :{" "}
              {entryActivities
                .reduce((sum, activity) => sum + Number(activity.km || 0), 0)
                .toFixed(1)}{" "}
              km
            </p>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function PatrolLeaderboardRow({
  rank,
  name,
  category,
  isChef,
  members,
  km,
  maxKm,
  sportMode = "velo",
  onClick,
}: {
  rank: number;
  name: string;
  category: string;
  isChef?: boolean;
  members: number;
  km: number;
  maxKm: number;
  sportMode?: SportMode;
  onClick: () => void;
}) {
  const isRanked = km > 0 && rank > 0;
  const percentage = isRanked && maxKm > 0 ? Math.max(3, (km / maxKm) * 100) : 0;

  const getRankBadge = () => {
    if (!isRanked) {
      return (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted/60 font-display text-sm font-semibold text-muted-foreground/60">
          —
        </span>
      );
    }
    if (rank === 1) {
      return (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-yellow-600 text-white shadow-md">
          <Crown className="h-6 w-6" />
        </span>
      );
    }
    if (rank === 2) {
      return (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-300 to-slate-500 text-white shadow-md">
          <Medal className="h-6 w-6" />
        </span>
      );
    }
    if (rank === 3) {
      return (
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-600 to-amber-800 text-white shadow-md">
          <Award className="h-6 w-6" />
        </span>
      );
    }
    return (
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-muted font-display text-base font-bold text-muted-foreground">
        #{rank}
      </span>
    );
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md",
        rank === 1 && isRanked
          ? "border-amber-400/40 bg-gradient-to-r from-amber-500/5 via-card to-card"
          : "",
      )}
    >
      {getRankBadge()}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="truncate font-display text-lg font-bold text-foreground flex items-center gap-1.5">
              <span className="text-xl shrink-0">{getPatrolEmblem(name)}</span>
              <span>{name}</span>
            </span>
            {isChef ? (
              <span className="rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 uppercase tracking-wider">
                👑 Staff
              </span>
            ) : (
              <span className="rounded-full bg-secondary px-2 py-0.5 text-[10px] font-semibold text-secondary-foreground">
                {category === "homme" ? "Garçons" : "Filles"}
              </span>
            )}
          </div>
          <div className="font-display text-xl font-black text-foreground flex items-center gap-1">
            <ModeIcon mode={sportMode} className="h-4 w-4" colored />
            <span>{km.toFixed(1)}</span>{" "}
            <span className="text-xs font-semibold text-muted-foreground">km</span>
          </div>
        </div>

        {/* Progress Bar & Subtitle */}
        <div className="mt-2 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                rank === 1 && isRanked
                  ? "bg-gradient-to-r from-amber-500 to-primary"
                  : sportMode === "course"
                    ? "bg-purple-600"
                    : sportMode === "marche"
                      ? "bg-sky-600"
                      : "bg-primary",
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {members} scout{members > 1 ? "s" : ""} actif{members > 1 ? "s" : ""}
          </span>
        </div>
      </div>
    </button>
  );
}

function ScoutLeaderboardRow({
  rank,
  displayName,
  patrolName,
  scoutYear,
  isChef,
  km,
  dplus = 0,
  distanceTotals,
  yellowJersey = false,
  climberJersey = false,
  whiteJersey = false,
  maxKm,
  sportMode = "velo",
  onClick,
}: {
  rank: number;
  displayName: string;
  patrolName: string;
  scoutYear: number | null;
  isChef?: boolean;
  km: number;
  dplus?: number;
  distanceTotals: Record<ActivitySport, number>;
  yellowJersey?: boolean;
  climberJersey?: boolean;
  whiteJersey?: boolean;
  maxKm: number;
  sportMode?: SportMode;
  onClick: () => void;
}) {
  const isRanked = km > 0 && rank > 0;
  const percentage = isRanked && maxKm > 0 ? Math.max(3, (km / maxKm) * 100) : 0;

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex w-full items-center gap-4 rounded-2xl border bg-card p-4 text-left transition-all hover:border-primary/50 hover:shadow-md",
        rank === 1 && isRanked
          ? "border-amber-400/40 bg-gradient-to-r from-amber-500/5 via-card to-card"
          : "",
      )}
    >
      <span
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl font-display text-sm font-bold",
          !isRanked
            ? "bg-muted/60 text-muted-foreground/60 font-normal"
            : rank === 1
              ? "bg-amber-400 text-amber-950 font-black shadow-sm"
              : rank === 2
                ? "bg-slate-300 text-slate-900"
                : rank === 3
                  ? "bg-amber-700 text-amber-100"
                  : "bg-muted text-muted-foreground",
        )}
      >
        {isRanked ? rank : "—"}
      </span>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate font-display text-base font-bold text-foreground">
              {displayName}
            </span>
            <span className="rounded-md border bg-muted/60 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground">
              {patrolName}
            </span>
            {isChef ? (
              <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-600">
                Staff
              </span>
            ) : scoutYear ? (
              <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-bold text-primary">
                {scoutYear}e année
              </span>
            ) : null}
            {yellowJersey && (
              <span className="rounded-full bg-yellow-400 px-2 py-0.5 text-[10px] font-bold text-yellow-950">
                Maillot jaune
              </span>
            )}
            {climberJersey && (
              <span className="rounded-full border border-red-500 bg-white px-2 py-0.5 text-[10px] font-bold text-red-600">
                Maillot à pois
              </span>
            )}
            {whiteJersey && (
              <span className="rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[10px] font-bold text-slate-700">
                Maillot blanc
              </span>
            )}
          </div>
          <div className="font-display text-lg font-black text-foreground flex items-center gap-1">
            <ModeIcon mode={sportMode} className="h-4 w-4" colored />
            <span>{km.toFixed(1)}</span>{" "}
            <span className="text-xs font-semibold text-muted-foreground">km</span>
          </div>
        </div>

        <div className="mt-2">
          <CumulativeDistanceBadges totals={distanceTotals} />
        </div>

        <div className="mt-2 flex items-center gap-3">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-700",
                rank === 1 && isRanked
                  ? "bg-gradient-to-r from-amber-500 to-primary"
                  : sportMode === "course"
                    ? "bg-purple-600"
                    : sportMode === "marche"
                      ? "bg-sky-600"
                      : "bg-primary",
              )}
              style={{ width: `${percentage}%` }}
            />
          </div>
          <span className="shrink-0 text-xs font-medium text-muted-foreground">
            {dplus > 0
              ? `${Math.round(dplus).toLocaleString("fr-BE")} m D+`
              : `${km.toFixed(1)} km`}
          </span>
        </div>
      </div>
    </button>
  );
}
