import React, { useEffect, useState, useMemo } from "react";
import {
  Trophy,
  Medal,
  Award,
  Crown,
  Search,
  RotateCw,
  TrendingUp,
  Bike,
  Filter,
  Users,
  ChevronRight,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { TROOP_STAFF_PATROL_NAME } from "@/lib/categories";

export interface CyclistProfile {
  id: string;
  email?: string | null;
  full_name: string | null;
  totem: string | null;
  quali: string | null;
  scout_year: number | null;
  patrol_id: string | null;
  is_chef?: boolean;
  strava_url?: string | null;
}

export interface Activity {
  id: string;
  user_id: string;
  ride_date: string;
  km: number;
  status: "pending" | "approved" | "rejected";
  strava_link?: string | null;
  note?: string | null;
}

export interface Patrol {
  id: string;
  name: string;
  category: "homme" | "femme" | "staff";
}

export interface DatabaseResponse {
  profiles?: CyclistProfile[];
  patrols?: Patrol[];
  activities?: Activity[];
}

export interface RankedCyclist {
  id: string;
  displayName: string;
  fullName: string;
  totem: string | null;
  quali: string | null;
  patrolName: string;
  patrolCategory: "homme" | "femme" | "staff";
  scoutYear: number | null;
  isChef: boolean;
  totalKm: number;
  activityCount: number;
  rank: number;
}

type PeriodFilter = "week" | "last" | "all";
type CategoryFilter = "all" | "homme" | "femme" | "staff";

function getWeekBoundaries(offsetWeeks: number = 0) {
  const now = new Date();
  const currentDay = now.getDay();
  // Adjust so Monday is day 1, Sunday is day 7
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offsetWeeks * 7);
  monday.setHours(0, 0, 0, 0);

  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);

  return {
    from: monday.toISOString().split("T")[0]!,
    to: sunday.toISOString().split("T")[0]!,
  };
}

export function Leaderboard({ className }: { className?: string }) {
  const [data, setData] = useState<DatabaseResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriod] = useState<PeriodFilter>("week");
  const [category, setCategory] = useState<CategoryFilter>("all");
  const [search, setSearch] = useState<string>("");
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date());

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [pRes, aRes, patRes] = await Promise.all([
        supabase
          .from("profiles_public")
          .select("id, full_name, totem, quali, scout_year, patrol_id, is_admin, strava_url"),
        supabase.from("activities").select("id, user_id, ride_date, km, status, strava_link, note"),
        supabase.from("patrols").select("id, name, category"),
      ]);

      setData({
        profiles: (pRes.data as unknown as CyclistProfile[]) || [],
        activities: (aRes.data as unknown as Activity[]) || [],
        patrols: (patRes.data as unknown as Patrol[]) || [],
      });
      setLastUpdated(new Date());
    } catch (err: unknown) {
      console.error("Erreur de récupération des données cyclistes:", err);
      setError(err instanceof Error ? err.message : "Erreur de chargement des données.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // Poll every 5 seconds to stay updated in real time
    const interval = setInterval(fetchData, 5000);
    return () => clearInterval(interval);
  }, []);

  // Compute date range
  const range = useMemo(() => {
    if (period === "week") return getWeekBoundaries(0);
    if (period === "last") return getWeekBoundaries(-1);
    return null;
  }, [period]);

  // Process and rank cyclists
  const rankedCyclists = useMemo<RankedCyclist[]>(() => {
    if (!data?.profiles || !data?.activities) return [];

    const patrolsMap = new Map<string, Patrol>();
    (data.patrols || []).forEach((p) => {
      patrolsMap.set(p.id, p);
    });

    const list: RankedCyclist[] = data.profiles.map((profile) => {
      const patrol = profile.patrol_id ? patrolsMap.get(profile.patrol_id) : undefined;
      const patrolName = patrol
        ? patrol.name
        : profile.is_chef
          ? TROOP_STAFF_PATROL_NAME
          : "Indépendant";
      const patrolCategory = patrol ? patrol.category : profile.is_chef ? "staff" : "homme";

      // Filter cyclist rides by current date range and valid status
      const userActivities = (data.activities || []).filter((act) => {
        if (act.user_id !== profile.id) return false;
        if (act.status === "rejected") return false;
        if (range?.from && act.ride_date < range.from) return false;
        if (range?.to && act.ride_date > range.to) return false;
        return true;
      });

      const totalKm = userActivities.reduce((acc, curr) => acc + (Number(curr.km) || 0), 0);
      const displayName =
        profile.totem && profile.quali
          ? `${profile.totem} ${profile.quali}`
          : profile.totem || profile.full_name || "Scout";

      return {
        id: profile.id,
        displayName,
        fullName: profile.full_name || "Scout",
        totem: profile.totem,
        quali: profile.quali,
        patrolName,
        patrolCategory,
        scoutYear: profile.scout_year,
        isChef: Boolean(profile.is_chef || patrolName.toLowerCase().includes("staff")),
        totalKm: Math.round(totalKm * 10) / 10,
        activityCount: userActivities.length,
        rank: 0,
      };
    });

    // Sort descending by kilometers, tie-breaker by activity count
    list.sort((a, b) => {
      if (b.totalKm !== a.totalKm) return b.totalKm - a.totalKm;
      return b.activityCount - a.activityCount;
    });

    // Assign rank
    return list.map((item, index) => ({
      ...item,
      rank: index + 1,
    }));
  }, [data, range]);

  // Filter ranked cyclists based on search and category
  const filteredCyclists = useMemo(() => {
    return rankedCyclists.filter((cyclist) => {
      // Category filter
      if (category === "staff") {
        if (!cyclist.isChef && !cyclist.patrolName.toLowerCase().includes("staff")) {
          return false;
        }
      } else if (category === "homme") {
        if (!cyclist.isChef && cyclist.patrolCategory !== "homme") {
          return false;
        }
      } else if (category === "femme") {
        if (!cyclist.isChef && cyclist.patrolCategory !== "femme") {
          return false;
        }
      }

      // Search filter
      if (search.trim()) {
        const query = search.toLowerCase();
        const matchesName = cyclist.displayName.toLowerCase().includes(query);
        const matchesPatrol = cyclist.patrolName.toLowerCase().includes(query);
        const matchesFull = cyclist.fullName.toLowerCase().includes(query);
        if (!matchesName && !matchesPatrol && !matchesFull) return false;
      }

      return true;
    });
  }, [rankedCyclists, category, search]);

  const top3 = useMemo(() => filteredCyclists.slice(0, 3), [filteredCyclists]);
  const rest = useMemo(() => filteredCyclists.slice(3), [filteredCyclists]);

  // Total statistics
  const totalCombinedKm = useMemo(() => {
    return filteredCyclists.reduce((acc, c) => acc + c.totalKm, 0);
  }, [filteredCyclists]);

  const activeRidersCount = useMemo(() => {
    return filteredCyclists.filter((c) => c.totalKm > 0).length;
  }, [filteredCyclists]);

  return (
    <section className={cn("space-y-6", className)}>
      {/* Header card with summary & stats */}
      <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-card via-card/95 to-amber-500/5 p-6 shadow-sm">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 rounded-full border border-amber-500/30 bg-amber-500/10 px-3 py-1 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <Trophy className="h-3.5 w-3.5" />
              <span>Classement Général Individuel</span>
            </div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Les Rouleurs de l'ALEZAN 42
            </h2>
            <p className="text-sm text-muted-foreground">
              Données directes synchronisées en temps réel depuis Supabase
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchData}
              disabled={loading}
              className="gap-2 text-xs"
            >
              <RotateCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
              <span>Actualiser</span>
            </Button>
            <Link to="/mes-km">
              <Button
                size="sm"
                className="gap-1.5 bg-orange-600 hover:bg-orange-700 text-white text-xs font-semibold"
              >
                <Bike className="h-4 w-4" />
                <span>Enregistrer mes km</span>
              </Button>
            </Link>
          </div>
        </div>

        {/* Quick metrics bar */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-border/60 bg-background/60 p-3 backdrop-blur-xs">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Kilomètres Cumulés
            </div>
            <div className="mt-1 font-display text-xl font-bold text-orange-600 dark:text-orange-400">
              {totalCombinedKm.toFixed(1)}{" "}
              <span className="text-xs font-semibold text-muted-foreground">km</span>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/60 p-3 backdrop-blur-xs">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Cyclistes Classés
            </div>
            <div className="mt-1 font-display text-xl font-bold text-foreground">
              {filteredCyclists.length}
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/60 p-3 backdrop-blur-xs">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Cyclistes Actifs
            </div>
            <div className="mt-1 font-display text-xl font-bold text-emerald-600 dark:text-emerald-400">
              {activeRidersCount}{" "}
              <span className="text-xs text-muted-foreground font-normal">
                (
                {filteredCyclists.length
                  ? Math.round((activeRidersCount / filteredCyclists.length) * 100)
                  : 0}
                %)
              </span>
            </div>
          </div>

          <div className="rounded-xl border border-border/60 bg-background/60 p-3 backdrop-blur-xs">
            <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              Période Active
            </div>
            <div className="mt-1 text-sm font-semibold text-foreground truncate">
              {period === "week"
                ? "Cette semaine"
                : period === "last"
                  ? "Semaine dernière"
                  : "Historique global"}
            </div>
          </div>
        </div>
      </div>

      {/* Filter and Search Controls */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {/* Period pills */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setPeriod("week")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
              period === "week"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            Cette semaine
          </button>
          <button
            onClick={() => setPeriod("last")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
              period === "last"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            Semaine dernière
          </button>
          <button
            onClick={() => setPeriod("all")}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition-all",
              period === "all"
                ? "bg-primary text-primary-foreground shadow-xs"
                : "border border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            Tout le concours
          </button>
        </div>

        {/* Category & Search */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Category filters */}
          <div className="flex items-center rounded-lg border border-border bg-card p-0.5 text-xs">
            <button
              onClick={() => setCategory("all")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                category === "all"
                  ? "bg-muted text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Tous
            </button>
            <button
              onClick={() => setCategory("homme")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                category === "homme"
                  ? "bg-muted text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Garçons
            </button>
            <button
              onClick={() => setCategory("femme")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                category === "femme"
                  ? "bg-muted text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Filles
            </button>
            <button
              onClick={() => setCategory("staff")}
              className={cn(
                "rounded-md px-2.5 py-1 font-medium transition-colors",
                category === "staff"
                  ? "bg-muted text-foreground font-semibold"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Staff
            </button>
          </div>

          {/* Search bar */}
          <div className="relative min-w-[180px] flex-1 sm:w-48 sm:flex-initial">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Chercher un scout..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div className="rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <p className="font-semibold">Erreur de chargement du classement :</p>
          <p className="mt-1 text-xs opacity-90">{error}</p>
          <Button
            variant="outline"
            size="sm"
            onClick={fetchData}
            className="mt-3 border-destructive/40 text-destructive text-xs"
          >
            Réessayer la synchronisation
          </Button>
        </div>
      )}

      {/* Loading state */}
      {loading && !data && (
        <div className="space-y-3 py-8">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <RotateCw className="h-4 w-4 animate-spin text-orange-500" />
            <span>Chargement des cyclistes depuis /api/db...</span>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-36 animate-pulse rounded-2xl bg-muted/60" />
            ))}
          </div>
          <div className="space-y-2 pt-2">
            {[1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="h-16 animate-pulse rounded-xl bg-muted/40" />
            ))}
          </div>
        </div>
      )}

      {/* Top 3 Podium Cards */}
      {!loading && top3.length > 0 && (
        <div className="grid gap-4 sm:grid-cols-3">
          {/* 1st Place (Center / Main) */}
          {top3[0] && (
            <div
              className={cn(
                "relative flex flex-col justify-between rounded-2xl border p-5 shadow-md transition-all duration-300 hover:shadow-lg sm:order-2",
                "border-amber-400/60 bg-gradient-to-b from-amber-500/15 via-card to-card ring-2 ring-amber-400/30",
              )}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-amber-400 to-yellow-500 px-3 py-0.5 text-xs font-black text-amber-950 shadow-sm flex items-center gap-1">
                <Crown className="h-3.5 w-3.5 fill-amber-950" />
                <span>1er CLASSEMENT</span>
              </div>

              <div className="pt-2 text-center">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-amber-400 to-amber-600 font-display text-2xl font-black text-white shadow-md">
                  🥇
                </div>

                <h3 className="mt-3 font-display text-lg font-black text-foreground">
                  <Link
                    to="/scout/$scoutId"
                    params={{ scoutId: top3[0].id }}
                    className="hover:text-primary hover:underline"
                  >
                    {top3[0].displayName}
                  </Link>
                </h3>

                <div className="mt-1 flex items-center justify-center gap-1.5 flex-wrap">
                  <Badge
                    variant="outline"
                    className="border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300 text-[10px]"
                  >
                    Patrouille {top3[0].patrolName}
                  </Badge>
                  {top3[0].isChef && (
                    <Badge variant="secondary" className="text-[10px]">
                      Staff
                    </Badge>
                  )}
                  {top3[0].scoutYear && (
                    <Badge variant="secondary" className="text-[10px]">
                      {top3[0].scoutYear}e année
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-5 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-center">
                <div className="text-[10px] font-semibold text-amber-700 dark:text-amber-400 uppercase tracking-wider">
                  Total Kilomètres
                </div>
                <div className="font-display text-3xl font-black text-amber-600 dark:text-amber-400">
                  {top3[0].totalKm.toFixed(1)}{" "}
                  <span className="text-sm font-semibold text-muted-foreground">km</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {top3[0].activityCount} sortie{top3[0].activityCount > 1 ? "s" : ""} enregistrée
                  {top3[0].activityCount > 1 ? "s" : ""}
                </div>
              </div>
            </div>
          )}

          {/* 2nd Place */}
          {top3[1] && (
            <div
              className={cn(
                "relative flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-all duration-300 hover:shadow-md sm:order-1",
                "border-slate-300/80 dark:border-slate-700/80 bg-gradient-to-b from-slate-200/20 dark:from-slate-700/20 via-card to-card",
              )}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-slate-300 dark:bg-slate-700 px-3 py-0.5 text-xs font-bold text-slate-800 dark:text-slate-200 shadow-xs flex items-center gap-1">
                <Medal className="h-3.5 w-3.5 text-slate-500 dark:text-slate-300" />
                <span>2e PLACE</span>
              </div>

              <div className="pt-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-200 dark:bg-slate-800 font-display text-2xl font-bold text-foreground">
                  🥈
                </div>

                <h3 className="mt-3 font-display text-base font-bold text-foreground">
                  <Link
                    to="/scout/$scoutId"
                    params={{ scoutId: top3[1].id }}
                    className="hover:text-primary hover:underline"
                  >
                    {top3[1].displayName}
                  </Link>
                </h3>

                <div className="mt-1 flex items-center justify-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    Patrouille {top3[1].patrolName}
                  </Badge>
                  {top3[1].scoutYear && (
                    <Badge variant="secondary" className="text-[10px]">
                      {top3[1].scoutYear}e année
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border/80 bg-muted/40 p-3 text-center">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Total Kilomètres
                </div>
                <div className="font-display text-2xl font-bold text-foreground">
                  {top3[1].totalKm.toFixed(1)}{" "}
                  <span className="text-xs font-semibold text-muted-foreground">km</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {top3[1].activityCount} sortie{top3[1].activityCount > 1 ? "s" : ""}
                </div>
              </div>
            </div>
          )}

          {/* 3rd Place */}
          {top3[2] && (
            <div
              className={cn(
                "relative flex flex-col justify-between rounded-2xl border p-5 shadow-sm transition-all duration-300 hover:shadow-md sm:order-3",
                "border-amber-700/30 bg-gradient-to-b from-amber-700/10 via-card to-card",
              )}
            >
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-amber-700/20 dark:bg-amber-800/40 border border-amber-700/30 px-3 py-0.5 text-xs font-bold text-amber-900 dark:text-amber-200 shadow-xs flex items-center gap-1">
                <Award className="h-3.5 w-3.5 text-amber-700 dark:text-amber-400" />
                <span>3e PLACE</span>
              </div>

              <div className="pt-2 text-center">
                <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-700/10 dark:bg-amber-900/30 font-display text-2xl font-bold text-amber-800 dark:text-amber-300">
                  🥉
                </div>

                <h3 className="mt-3 font-display text-base font-bold text-foreground">
                  <Link
                    to="/scout/$scoutId"
                    params={{ scoutId: top3[2].id }}
                    className="hover:text-primary hover:underline"
                  >
                    {top3[2].displayName}
                  </Link>
                </h3>

                <div className="mt-1 flex items-center justify-center gap-1.5 flex-wrap">
                  <Badge variant="outline" className="text-[10px]">
                    Patrouille {top3[2].patrolName}
                  </Badge>
                  {top3[2].scoutYear && (
                    <Badge variant="secondary" className="text-[10px]">
                      {top3[2].scoutYear}e année
                    </Badge>
                  )}
                </div>
              </div>

              <div className="mt-4 rounded-xl border border-border/80 bg-muted/40 p-3 text-center">
                <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                  Total Kilomètres
                </div>
                <div className="font-display text-2xl font-bold text-foreground">
                  {top3[2].totalKm.toFixed(1)}{" "}
                  <span className="text-xs font-semibold text-muted-foreground">km</span>
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {top3[2].activityCount} sortie{top3[2].activityCount > 1 ? "s" : ""}
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Rest of the Ranking List */}
      {!loading && rest.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center justify-between px-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <span>Rang & Scout</span>
            <span>Total Kilomètres</span>
          </div>

          <div className="divide-y divide-border/60 rounded-2xl border border-border/80 bg-card overflow-hidden shadow-xs">
            {rest.map((cyclist) => (
              <div
                key={cyclist.id}
                className="flex items-center justify-between p-3.5 transition-colors hover:bg-muted/40 sm:p-4"
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  {/* Rank indicator */}
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-bold text-muted-foreground">
                    #{cyclist.rank}
                  </div>

                  {/* Rider Details */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 truncate">
                      <Link
                        to="/scout/$scoutId"
                        params={{ scoutId: cyclist.id }}
                        className="font-display text-sm font-bold text-foreground truncate hover:text-primary hover:underline"
                      >
                        {cyclist.displayName}
                      </Link>
                      {cyclist.isChef && (
                        <Badge variant="secondary" className="text-[9px] py-0 px-1.5 h-4">
                          Staff
                        </Badge>
                      )}
                    </div>

                    <div className="flex items-center gap-2 text-xs text-muted-foreground truncate">
                      <span>Patrouille {cyclist.patrolName}</span>
                      {cyclist.scoutYear && (
                        <>
                          <span>•</span>
                          <span>{cyclist.scoutYear}e année</span>
                        </>
                      )}
                      <span>•</span>
                      <span>
                        {cyclist.activityCount} sortie{cyclist.activityCount > 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Kilometers */}
                <div className="text-right shrink-0 pl-3">
                  <div className="font-display text-base font-bold text-foreground">
                    {cyclist.totalKm.toFixed(1)}{" "}
                    <span className="text-xs font-semibold text-muted-foreground">km</span>
                  </div>
                  {cyclist.totalKm > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-emerald-600 dark:text-emerald-400 font-medium">
                      <TrendingUp className="h-3 w-3" />
                      <span>Actif</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && filteredCyclists.length === 0 && (
        <div className="rounded-2xl border border-dashed border-border p-8 text-center">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-muted text-muted-foreground">
            <Users className="h-6 w-6" />
          </div>
          <h3 className="mt-3 font-display text-base font-bold text-foreground">
            Aucun cycliste trouvé
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            {search
              ? "Aucun résultat ne correspond à votre recherche."
              : "Aucune sortie enregistrée pour cette période ou catégorie."}
          </p>
          {search && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearch("")}
              className="mt-3 text-xs"
            >
              Effacer la recherche
            </Button>
          )}
        </div>
      )}

      {/* Footer metadata */}
      <div className="flex items-center justify-between text-[11px] text-muted-foreground px-1">
        <span>Source : Serveur local /api/db</span>
        <span>
          Mis à jour à{" "}
          {lastUpdated.toLocaleTimeString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
        </span>
      </div>
    </section>
  );
}
export default Leaderboard;
