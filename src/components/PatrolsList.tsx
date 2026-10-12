import React, { useEffect, useState, useMemo, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import {
  Trophy,
  Medal,
  Award,
  Crown,
  Search,
  RotateCw,
  TrendingUp,
  Bike,
  Users,
  ChevronDown,
  ChevronUp,
  Flame,
  AlertCircle,
  Calendar,
  Filter,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { getPatrolEmblem } from "@/lib/database";
import {
  isStaffPatrol,
  matchesCategory,
  TROOP_STAFF_PATROL_NAME,
  isTroopStaffPatrol,
} from "@/lib/categories";

export interface PatrolRecord {
  id: string;
  name: string;
  category: "homme" | "femme" | "staff";
  created_at?: string;
}

export interface PatrolMemberStat {
  userId: string;
  displayName: string;
  km: number;
}

export interface PatrolWithStats {
  id: string;
  name: string;
  category: "homme" | "femme" | "staff";
  totalKm: number;
  membersCount: number;
  contributorsCount: number;
  topContributor?: { name: string; km: number };
  members: PatrolMemberStat[];
  rank: number;
  percentage: number;
}

export interface PatrolsListProps {
  /** Optional custom title */
  title?: string;
  /** Optional custom description */
  description?: string;
  /** Hide filters if controlled externally */
  showFilters?: boolean;
  /** Initial period filter */
  initialPeriod?: "week" | "last" | "all";
  /** Initial category filter */
  initialCategory?: "all" | "homme" | "femme" | "staff";
  /** Compact view without hero banner */
  compact?: boolean;
  /** Optional class name */
  className?: string;
}

function getWeekBoundaries(offsetWeeks: number = 0): { from: string; to: string } {
  const now = new Date();
  const currentDay = now.getDay();
  const diffToMonday = currentDay === 0 ? -6 : 1 - currentDay;

  const monday = new Date(now);
  monday.setDate(now.getDate() + diffToMonday + offsetWeeks * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);

  const formatLocalDate = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

  return {
    from: formatLocalDate(monday),
    to: formatLocalDate(sunday),
  };
}

export function PatrolsList({
  title = "Classement des Patrouilles",
  description = "Kilomètres cumulés par patrouille enregistrés dans la base Supabase",
  showFilters = true,
  initialPeriod = "week",
  initialCategory = "all",
  compact = false,
  className,
}: PatrolsListProps) {
  const [period, setPeriod] = useState<"week" | "last" | "all">(initialPeriod);
  const [category, setCategory] = useState<"all" | "homme" | "femme" | "staff">(initialCategory);
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [patrols, setPatrols] = useState<PatrolRecord[]>([]);
  const [expandedPatrolId, setExpandedPatrolId] = useState<string | null>(null);
  const [memberStatsByPatrol, setMemberStatsByPatrol] = useState<
    Record<string, PatrolMemberStat[]>
  >({});
  const [lastFetched, setLastFetched] = useState<Date | null>(null);

  const fetchData = useCallback(
    async (isManualRefresh = false, isBackgroundRefresh = false) => {
      if (isManualRefresh) setRefreshing(true);
      else if (!isBackgroundRefresh) setLoading(true);
      setError(null);

      try {
        // 1. Récupération des patrouilles directement depuis la table 'patrols' dans Supabase
        const { data: patrolsData, error: patrolsError } = await supabase
          .from("patrols")
          .select("id, name, category, created_at")
          .order("name", { ascending: true });

        if (patrolsError) {
          throw new Error(`Erreur lors du chargement des patrouilles: ${patrolsError.message}`);
        }

        let fetchedPatrols = (patrolsData as PatrolRecord[]) || [];

        // S'assurer que le Staff est présent si jamais non configuré
        const hasStaff = fetchedPatrols.some((p) => isStaffPatrol(p));
        if (!hasStaff) {
          fetchedPatrols = [
            ...fetchedPatrols,
            { id: "staff", name: TROOP_STAFF_PATROL_NAME, category: "staff" },
          ];
        }
        setPatrols(fetchedPatrols);

        // 2. Détermination de la plage de dates selon la période
        let fromDate: string | null = null;
        let toDate: string | null = null;
        if (period === "week") {
          const bounds = getWeekBoundaries(0);
          fromDate = bounds.from;
          toDate = bounds.to;
        } else if (period === "last") {
          const bounds = getWeekBoundaries(-1);
          fromDate = bounds.from;
          toDate = bounds.to;
        }

        // 3. Récupération des kilomètres via la fonction RPC leaderboard ou jointure
        const statsMap: Record<string, PatrolMemberStat[]> = {};
        fetchedPatrols.forEach((p) => {
          statsMap[p.id] = [];
        });

        // Tentative via la fonction RPC leaderboard (Security Definer)
        const { data: leaderboardData, error: lbError } = await supabase.rpc("leaderboard", {
          _from: fromDate as unknown as string,
          _to: toDate as unknown as string,
        });

        if (!lbError && Array.isArray(leaderboardData) && leaderboardData.length > 0) {
          // Associer les kilomètres à chaque patrouille
          leaderboardData.forEach(
            (row: {
              user_id: string;
              display_name: string;
              patrol_id?: string;
              patrol_name?: string;
              km: number;
            }) => {
              const userKm = Number(row.km) || 0;
              if (userKm <= 0) return;

              // Recherche de la patrouille correspondante
              let matchedPatrol = fetchedPatrols.find((p) => p.id === row.patrol_id);
              if (!matchedPatrol && row.patrol_name) {
                matchedPatrol = fetchedPatrols.find(
                  (p) => p.name.toLowerCase() === row.patrol_name?.toLowerCase(),
                );
              }

              if (matchedPatrol) {
                if (!statsMap[matchedPatrol.id]) statsMap[matchedPatrol.id] = [];
                statsMap[matchedPatrol.id].push({
                  userId: row.user_id,
                  displayName: row.display_name || "Scout",
                  km: userKm,
                });
              }
            },
          );
        } else {
          // Fallback: Tentative de lecture directe des activités
          const { data: activitiesData } = await supabase
            .from("activities_public")
            .select("id, user_id, km, ride_date, status");

          const { data: profilesData } = await supabase
            .from("profiles_public")
            .select("id, full_name, totem, patrol_id");

          if (Array.isArray(activitiesData) && activitiesData.length > 0) {
            const userProfiles = new Map(
              (profilesData || []).map(
                (prof: {
                  id: string;
                  full_name?: string | null;
                  totem?: string | null;
                  patrol_id?: string | null;
                }) => [prof.id, prof],
              ),
            );

            // Filtrage par date si nécessaire
            const filteredActivities = activitiesData.filter(
              (a: { ride_date: string; status: string }) => {
                if (a.status !== "approved") return false; // seules les sorties validées comptent
                if (fromDate && a.ride_date < fromDate) return false;
                if (toDate && a.ride_date > toDate) return false;
                return true;
              },
            );

            // Regroupement par utilisateur
            const userKmMap: Record<string, number> = {};
            filteredActivities.forEach((act: { user_id: string; km: number }) => {
              userKmMap[act.user_id] = (userKmMap[act.user_id] || 0) + Number(act.km || 0);
            });

            Object.entries(userKmMap).forEach(([uid, km]) => {
              const profile = userProfiles.get(uid);
              const patrolId = profile?.patrol_id;
              const matchedPatrol = fetchedPatrols.find(
                (p) => p.id === patrolId || (isTroopStaffPatrol(p) && patrolId === "staff"),
              );
              if (matchedPatrol) {
                if (!statsMap[matchedPatrol.id]) statsMap[matchedPatrol.id] = [];
                statsMap[matchedPatrol.id].push({
                  userId: uid,
                  displayName: profile?.totem || profile?.full_name || "Scout",
                  km,
                });
              }
            });
          }
        }

        setMemberStatsByPatrol(statsMap);
        setLastFetched(new Date());
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [period],
  );

  useEffect(() => {
    void fetchData();
    const refreshInBackground = () => {
      if (document.visibilityState === "visible") void fetchData(false, true);
    };
    const interval = window.setInterval(refreshInBackground, 30_000);
    document.addEventListener("visibilitychange", refreshInBackground);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshInBackground);
    };
  }, [fetchData]);

  // Calcul des statistiques agrégées et du classement des patrouilles
  const rankedPatrols = useMemo<PatrolWithStats[]>(() => {
    if (!patrols || patrols.length === 0) return [];

    // Calcul de la somme totale de kilomètres
    let totalKilometersAll = 0;

    const withKm = patrols.map((p) => {
      const members = memberStatsByPatrol[p.id] || [];
      const totalKm = members.reduce((sum, m) => sum + m.km, 0);
      totalKilometersAll += totalKm;

      // Trier les membres par kilomètres décroissants
      const sortedMembers = [...members].sort((a, b) => b.km - a.km);
      const topContributor =
        sortedMembers.length > 0
          ? { name: sortedMembers[0].displayName, km: sortedMembers[0].km }
          : undefined;

      return {
        id: p.id,
        name: p.name,
        category: p.category,
        totalKm,
        membersCount: members.length,
        contributorsCount: sortedMembers.filter((m) => m.km > 0).length,
        topContributor,
        members: sortedMembers,
        rank: 1,
        percentage: 0,
      };
    });

    // Tri par kilomètres décroissants
    withKm.sort((a, b) => b.totalKm - a.totalKm);

    // Attribution des rangs et calcul du pourcentage
    return withKm.map((patrol, idx) => ({
      ...patrol,
      rank: idx + 1,
      percentage:
        totalKilometersAll > 0 ? Math.round((patrol.totalKm / totalKilometersAll) * 100) : 0,
    }));
  }, [patrols, memberStatsByPatrol]);

  // Filtrage selon les choix de l'utilisateur (catégorie et recherche textuelle)
  const filteredPatrols = useMemo(() => {
    return rankedPatrols.filter((p) => {
      // Filtre catégorie
      // Les patrouilles staff apparaissent dans toutes les catégories
      if (!matchesCategory(p.category, isStaffPatrol(p), category)) return false;

      // Filtre recherche
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesName = p.name.toLowerCase().includes(q);
        const matchesMember = p.members.some((m) => m.displayName.toLowerCase().includes(q));
        if (!matchesName && !matchesMember) return false;
      }

      return true;
    });
  }, [rankedPatrols, category, searchQuery]);

  const overallStats = useMemo(() => {
    const totalKm = rankedPatrols.reduce((sum, p) => sum + p.totalKm, 0);
    const activePatrols = rankedPatrols.filter((p) => p.totalKm > 0).length;
    const totalRiders = rankedPatrols.reduce((sum, p) => sum + p.contributorsCount, 0);
    const topPatrol = rankedPatrols[0];

    return { totalKm, activePatrols, totalRiders, topPatrol };
  }, [rankedPatrols]);

  const toggleExpand = (id: string) => {
    setExpandedPatrolId((prev) => (prev === id ? null : id));
  };

  return (
    <div className={cn("w-full space-y-6", className)}>
      {/* En-tête principal */}
      {!compact && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/60 pb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-500/10 text-amber-500 font-bold">
                ⚜️
              </span>
              <h2 className="font-display text-2xl font-black tracking-tight text-foreground md:text-3xl">
                {title}
              </h2>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{description}</p>
          </div>

          {/* Bouton de rafraîchissement manuel */}
          <div className="flex items-center gap-2 self-start sm:self-auto">
            {lastFetched && (
              <span className="text-xs text-muted-foreground hidden md:inline">
                Mis à jour à{" "}
                {lastFetched.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchData(true)}
              disabled={loading || refreshing}
              className="gap-2 shadow-xs"
            >
              <RotateCw className={cn("h-4 w-4", refreshing && "animate-spin text-primary")} />
              <span>{refreshing ? "Actualisation..." : "Actualiser"}</span>
            </Button>
          </div>
        </div>
      )}

      {/* Cartes de synthèse rapide */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 sm:gap-4">
        <Card className="border-border/60 bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Total du Défi</span>
              <Bike className="h-4 w-4 text-primary" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-2xl font-black text-foreground">
                {overallStats.totalKm.toLocaleString()}
              </span>
              <span className="text-xs font-bold text-muted-foreground">km</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Patrouilles en lice</span>
              <Users className="h-4 w-4 text-amber-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-2xl font-black text-foreground">
                {patrols.length}
              </span>
              <span className="text-xs font-medium text-muted-foreground">
                ({overallStats.activePatrols} actives)
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Cyclistes Actifs</span>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <div className="mt-2 flex items-baseline gap-1">
              <span className="font-display text-2xl font-black text-foreground">
                {overallStats.totalRiders}
              </span>
              <span className="text-xs font-medium text-muted-foreground">scouts</span>
            </div>
          </CardContent>
        </Card>

        <Card className="border-border/60 bg-card/60 backdrop-blur-xs">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">En tête</span>
              <Crown className="h-4 w-4 text-amber-400" />
            </div>
            <div className="mt-2 truncate font-display text-lg font-black text-foreground">
              {overallStats.topPatrol ? overallStats.topPatrol.name : "—"}
            </div>
            <div className="text-[11px] font-bold text-amber-500">
              {overallStats.topPatrol ? `${overallStats.topPatrol.totalKm} km` : "0 km"}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Barre de contrôles et filtres */}
      {showFilters && (
        <div className="flex flex-col gap-3 rounded-xl border border-border/60 bg-card p-3 shadow-xs md:flex-row md:items-center md:justify-between">
          {/* Sélecteur de période */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-muted-foreground mr-1 hidden sm:inline">
              Période :
            </span>
            <Button
              size="sm"
              variant={period === "week" ? "default" : "outline"}
              onClick={() => setPeriod("week")}
              className="h-8 text-xs font-semibold"
            >
              <Calendar className="mr-1.5 h-3.5 w-3.5" />
              Cette semaine
            </Button>
            <Button
              size="sm"
              variant={period === "last" ? "default" : "outline"}
              onClick={() => setPeriod("last")}
              className="h-8 text-xs font-semibold"
            >
              Semaine passée
            </Button>
            <Button
              size="sm"
              variant={period === "all" ? "default" : "outline"}
              onClick={() => setPeriod("all")}
              className="h-8 text-xs font-semibold"
            >
              Général
            </Button>
          </div>

          {/* Filtres de catégorie et barre de recherche */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 bg-muted/50 p-1 rounded-lg">
              <Button
                size="sm"
                variant={category === "all" ? "secondary" : "ghost"}
                onClick={() => setCategory("all")}
                className="h-7 px-2.5 text-xs font-medium"
              >
                Toutes
              </Button>
              <Button
                size="sm"
                variant={category === "homme" ? "secondary" : "ghost"}
                onClick={() => setCategory("homme")}
                className="h-7 px-2.5 text-xs font-medium"
              >
                Garçons
              </Button>
              <Button
                size="sm"
                variant={category === "femme" ? "secondary" : "ghost"}
                onClick={() => setCategory("femme")}
                className="h-7 px-2.5 text-xs font-medium"
              >
                Filles
              </Button>
              <Button
                size="sm"
                variant={category === "staff" ? "secondary" : "ghost"}
                onClick={() => setCategory("staff")}
                className="h-7 px-2.5 text-xs font-medium"
              >
                Staff
              </Button>
            </div>

            <div className="relative min-w-[160px] flex-1 sm:flex-initial">
              <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Rechercher..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="h-8 pl-8 text-xs"
              />
            </div>
          </div>
        </div>
      )}

      {/* Message d'erreur éventuel */}
      {error && (
        <div className="flex items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/10 p-4 text-sm text-destructive">
          <AlertCircle className="h-5 w-5 shrink-0" />
          <div className="flex-1">
            <p className="font-semibold">Erreur de chargement</p>
            <p className="text-xs opacity-90">{error}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => fetchData(true)}>
            Réessayer
          </Button>
        </div>
      )}

      {/* État de chargement */}
      {loading && (
        <div className="space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div
              key={i}
              className="flex h-16 animate-pulse items-center justify-between rounded-xl border border-border/60 bg-muted/40 px-4"
            >
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-full bg-muted" />
                <div className="space-y-1.5">
                  <div className="h-4 w-32 rounded bg-muted" />
                  <div className="h-3 w-20 rounded bg-muted/60" />
                </div>
              </div>
              <div className="h-6 w-16 rounded bg-muted" />
            </div>
          ))}
        </div>
      )}

      {/* Liste des patrouilles */}
      {!loading && filteredPatrols.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-muted text-2xl">🚴</div>
          <h3 className="mt-3 font-display font-bold text-base text-foreground">
            Aucune patrouille trouvée
          </h3>
          <p className="mt-1 text-xs text-muted-foreground max-w-sm">
            {searchQuery
              ? `Aucun résultat pour la recherche "${searchQuery}".`
              : "Aucune patrouille ne correspond aux filtres sélectionnés."}
          </p>
          {searchQuery && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setSearchQuery("")}
              className="mt-4 text-xs"
            >
              Réinitialiser la recherche
            </Button>
          )}
        </div>
      )}

      {!loading && filteredPatrols.length > 0 && (
        <div className="space-y-3">
          {filteredPatrols.map((patrol) => {
            const isFirst = patrol.rank === 1 && patrol.totalKm > 0;
            const isSecond = patrol.rank === 2 && patrol.totalKm > 0;
            const isThird = patrol.rank === 3 && patrol.totalKm > 0;
            const isExpanded = expandedPatrolId === patrol.id;
            const isStaff = isStaffPatrol(patrol);

            return (
              <div
                key={patrol.id}
                className={cn(
                  "overflow-hidden rounded-xl border transition-all duration-200",
                  isFirst
                    ? "border-amber-400/50 bg-gradient-to-r from-amber-500/10 via-amber-500/5 to-transparent shadow-sm"
                    : isSecond
                      ? "border-slate-300/60 bg-gradient-to-r from-slate-400/10 to-transparent"
                      : isThird
                        ? "border-amber-700/30 bg-gradient-to-r from-amber-700/10 to-transparent"
                        : "border-border/60 bg-card hover:border-border hover:shadow-xs",
                )}
              >
                <div
                  onClick={() => toggleExpand(patrol.id)}
                  className="flex cursor-pointer items-center justify-between p-3.5 sm:p-4 select-none"
                >
                  {/* Partie gauche : Rang, Icône, Nom et Badge */}
                  <div className="flex items-center gap-3 min-w-0">
                    {/* Badge de Rang */}
                    <div
                      className={cn(
                        "grid h-8 w-8 sm:h-9 sm:w-9 shrink-0 place-items-center rounded-full font-black text-sm shadow-xs",
                        isFirst
                          ? "bg-amber-400 text-amber-950 ring-2 ring-amber-300"
                          : isSecond
                            ? "bg-slate-200 text-slate-800"
                            : isThird
                              ? "bg-amber-700 text-white"
                              : "bg-muted text-muted-foreground",
                      )}
                    >
                      {isFirst ? <Crown className="h-4 w-4" /> : <span>{patrol.rank}</span>}
                    </div>

                    {/* Émoticône animal / scout */}
                    <span className="text-2xl shrink-0">{getPatrolEmblem(patrol.name)}</span>

                    {/* Nom et catégorie */}
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-black text-sm sm:text-base text-foreground truncate">
                          {patrol.name}
                        </span>

                        {isStaff ? (
                          <Badge
                            variant="outline"
                            className="border-purple-300 bg-purple-50 text-purple-700 text-[10px] py-0 px-1.5 dark:bg-purple-950/40 dark:text-purple-300"
                          >
                            Staff
                          </Badge>
                        ) : patrol.category === "femme" ? (
                          <Badge
                            variant="outline"
                            className="border-rose-300 bg-rose-50 text-rose-700 text-[10px] py-0 px-1.5 dark:bg-rose-950/40 dark:text-rose-300"
                          >
                            Filles
                          </Badge>
                        ) : (
                          <Badge
                            variant="outline"
                            className="border-sky-300 bg-sky-50 text-sky-700 text-[10px] py-0 px-1.5 dark:bg-sky-950/40 dark:text-sky-300"
                          >
                            Garçons
                          </Badge>
                        )}
                      </div>

                      <div className="flex items-center gap-2 text-xs text-muted-foreground mt-0.5">
                        <span>
                          {patrol.contributorsCount}{" "}
                          {patrol.contributorsCount > 1 ? "rouleurs" : "rouleur"}
                        </span>
                        {patrol.topContributor && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[140px] sm:max-w-[200px]">
                              Leader :{" "}
                              <strong className="text-foreground font-semibold">
                                {patrol.topContributor.name}
                              </strong>{" "}
                              ({patrol.topContributor.km} km)
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Partie droite : Kilomètres totaux et flèche */}
                  <div className="flex items-center gap-3 sm:gap-4 shrink-0 pl-2">
                    <div className="text-right">
                      <div className="flex items-baseline justify-end gap-1">
                        <span className="font-display text-lg sm:text-xl font-black text-foreground">
                          {patrol.totalKm.toLocaleString()}
                        </span>
                        <span className="text-xs font-bold text-muted-foreground">km</span>
                      </div>
                      <div className="text-[10px] font-semibold text-muted-foreground">
                        {patrol.percentage > 0 ? `${patrol.percentage}% du total` : "0 km"}
                      </div>
                    </div>

                    <div className="text-muted-foreground hover:text-foreground">
                      {isExpanded ? (
                        <ChevronUp className="h-4 w-4" />
                      ) : (
                        <ChevronDown className="h-4 w-4" />
                      )}
                    </div>
                  </div>
                </div>

                {/* Barre de progression relative */}
                {overallStats.totalKm > 0 && (
                  <div className="h-1 w-full bg-muted/40">
                    <div
                      className={cn(
                        "h-full transition-all duration-500",
                        isFirst
                          ? "bg-amber-400"
                          : isSecond
                            ? "bg-slate-400"
                            : isThird
                              ? "bg-amber-600"
                              : "bg-primary/70",
                      )}
                      style={{
                        width: `${Math.min(100, Math.max(patrol.percentage, patrol.totalKm > 0 ? 3 : 0))}%`,
                      }}
                    />
                  </div>
                )}

                {/* Vue détaillée dépliée : détail des scouts de la patrouille */}
                {isExpanded && (
                  <div className="border-t border-border/50 bg-muted/20 p-3 sm:p-4 animate-in slide-in-from-top-1 duration-200">
                    <div className="flex items-center justify-between pb-2 border-b border-border/40 text-xs font-semibold text-muted-foreground">
                      <span>Membres ayant contribué ({patrol.members.length})</span>
                      <span>Distance</span>
                    </div>

                    {patrol.members.length === 0 ? (
                      <div className="py-4 text-center text-xs text-muted-foreground italic">
                        Aucun kilomètre enregistré pour cette période.
                      </div>
                    ) : (
                      <div className="divide-y divide-border/30">
                        {patrol.members.map((member, mIdx) => (
                          <div
                            key={member.userId || mIdx}
                            className="flex items-center justify-between py-2 text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-[10px] font-mono text-muted-foreground w-4 text-center">
                                {mIdx + 1}.
                              </span>
                              <Link
                                to="/scout/$scoutId"
                                params={{ scoutId: member.userId }}
                                className="font-medium text-foreground hover:text-primary hover:underline"
                              >
                                {member.displayName}
                              </Link>
                              {mIdx === 0 && member.km > 0 && (
                                <span className="text-[10px] bg-amber-400/20 text-amber-700 dark:text-amber-300 font-bold px-1.5 py-0.2 rounded-full">
                                  Top
                                </span>
                              )}
                            </div>
                            <div className="font-bold text-foreground">
                              {member.km}{" "}
                              <span className="font-normal text-muted-foreground">km</span>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default PatrolsList;
