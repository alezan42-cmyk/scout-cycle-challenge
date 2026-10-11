import React, { useState, useEffect, useCallback } from "react";
import {
  Bike,
  Clock,
  ExternalLink,
  RotateCw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  Activity as ActivityIcon,
  Flame,
  ArrowRight,
} from "lucide-react";
import { Link } from "@tanstack/react-router";
import { supabase } from "@/lib/supabase";
import { approveActivity } from "@/lib/proofStorage";
import {
  db,
  type Patrol,
  getActivitySport,
  cleanActivityNote,
  getPatrolEmblem,
} from "@/lib/database";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useAuth } from "@/lib/useAuth";
import { cn } from "@/lib/utils";
import { isStaffPatrol, TROOP_STAFF_PATROL_NAME } from "@/lib/categories";
import { SportBadge, SPORT_COLORS } from "@/components/SportIcon";

export interface RecentActivityItem {
  id: string;
  userId: string;
  scoutName: string;
  scoutTotem?: string | null;
  scoutQuali?: string | null;
  patrolId: string;
  patrolName: string;
  patrolCategory: "homme" | "femme" | "staff";
  km: number;
  rideDate: string;
  createdAt: string;
  relativeTime: string;
  stravaLink?: string | null;
  proofPath?: string | null;
  note?: string | null;
  status: "approved" | "pending" | "rejected";
}

export interface RecentActivityFeedProps {
  /** Number of activities to display (default: 5) */
  limit?: number;
  /** Custom title */
  title?: string;
  /** Custom description */
  description?: string;
  /** Show link to log new km */
  showLogButton?: boolean;
  /** Compact presentation */
  compact?: boolean;
  /** Custom class name */
  className?: string;
}

function formatRelativeTime(dateInput: string | Date | undefined): string {
  if (!dateInput) return "Récemment";
  const date = new Date(dateInput);
  if (isNaN(date.getTime())) return "Récemment";

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 0) {
    return "À l'instant";
  }
  if (diffInSeconds < 60) {
    return "À l'instant";
  }
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) {
    return `Il y a ${diffInMinutes} min`;
  }
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) {
    return `Il y a ${diffInHours} h`;
  }
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays === 1) {
    return "Hier";
  }
  if (diffInDays < 7) {
    return `Il y a ${diffInDays} j`;
  }
  const diffInWeeks = Math.floor(diffInDays / 7);
  if (diffInWeeks === 1) {
    return "Il y a 1 sem.";
  }
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export function RecentActivityFeed({
  limit = 5,
  title = "Dernières sorties enregistrées",
  description = "Flux en direct des récentes contributions vélo des patrouilles",
  showLogButton = true,
  compact = false,
  className,
}: RecentActivityFeedProps) {
  const { isAdmin, user } = useAuth();
  const [activities, setActivities] = useState<RecentActivityItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const handleQuickApprove = async (activityId: string) => {
    const { error } = await approveActivity(activityId);
    if (error) {
      toast.error("Erreur lors de la validation : " + error);
      return;
    }
    db.updateActivityStatus(activityId, "approved");
    toast.success("Sortie validée avec succès !");
    fetchActivities(true);
  };

  const fetchActivities = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      try {
        // 1. Récupérer les patrouilles
        const { data: patrolsData } = await supabase.from("patrols").select("id, name, category");

        let allPatrols = (patrolsData as Patrol[]) || [];
        if (allPatrols.length === 0) {
          allPatrols = db.getPatrols();
        }

        const patrolMap = new Map<string, Patrol>();
        allPatrols.forEach((p) => patrolMap.set(p.id, p));

        // 2. Récupérer les profils depuis Supabase
        const { data: profilesData } = await supabase
          .from("profiles_public")
          .select("id, full_name, totem, quali, patrol_id");

        const profileMap = new Map<
          string,
          {
            full_name?: string | null;
            totem?: string | null;
            quali?: string | null;
            patrol_id?: string | null;
          }
        >();
        (profilesData || []).forEach((p) => profileMap.set(p.id, p));

        // 3. Récupérer les activités réelles depuis Supabase
        // Visiteur sans compte : vue publique (ni lien Strava, ni photo, ni note libre).
        // Membre connecté : détail complet.
        const { data: actsData } = user
          ? await supabase
              .from("activities")
              .select(
                "id, user_id, km, ride_date, created_at, strava_link, proof_path, note, status",
              )
              .order("created_at", { ascending: false })
              .limit(limit * 2)
          : await supabase
              .from("activities_public")
              .select("id, user_id, km, ride_date, created_at, note, status")
              .order("created_at", { ascending: false })
              .limit(limit * 2);

        // Activités réelles dédupliquées par ID
        const combined = new Map<
          string,
          {
            id: string;
            user_id: string;
            km: number;
            ride_date: string;
            created_at: string;
            strava_link?: string | null;
            proof_path?: string | null;
            note?: string | null;
            status: "approved" | "pending" | "rejected";
          }
        >();

        (actsData || []).forEach((a) =>
          combined.set(a.id, a as typeof combined extends Map<string, infer V> ? V : never),
        );

        // Trier par date de création ou de sortie décroissante
        const sortedActs = Array.from(combined.values())
          .filter((a) => a.status !== "rejected")
          .sort((a, b) => {
            const timeA = new Date(a.created_at || a.ride_date).getTime();
            const timeB = new Date(b.created_at || b.ride_date).getTime();
            return timeB - timeA;
          })
          .slice(0, limit);

        // Mappage avec les informations complètes du scout et de sa patrouille
        const mappedItems: RecentActivityItem[] = sortedActs.map((act) => {
          const prof = profileMap.get(act.user_id);
          const patrolId = prof?.patrol_id || "patrol-staff";
          const patrol = patrolMap.get(patrolId);

          let displayName = prof?.totem || prof?.full_name || "Scout";
          if (prof?.totem && prof?.quali) {
            displayName = `${prof.totem} ${prof.quali}`;
          }

          const patrolName = patrol ? patrol.name : TROOP_STAFF_PATROL_NAME;
          const patrolCategory = patrol ? patrol.category : "staff";

          const timestampToUse = act.created_at || act.ride_date;

          return {
            id: act.id,
            userId: act.user_id,
            scoutName: displayName,
            scoutTotem: prof?.totem || null,
            scoutQuali: prof?.quali || null,
            patrolId,
            patrolName,
            patrolCategory,
            km: Number(act.km) || 0,
            rideDate: act.ride_date || new Date().toISOString().slice(0, 10),
            createdAt: timestampToUse,
            relativeTime: formatRelativeTime(timestampToUse),
            stravaLink: act.strava_link,
            proofPath: act.proof_path,
            note: act.note,
            status: act.status || "approved",
          };
        });

        setActivities(mappedItems);
        setLastUpdated(new Date());
      } catch (err) {
        console.warn("Erreur chargement RecentActivityFeed :", err);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [limit, user],
  );

  useEffect(() => {
    fetchActivities();
    return db.subscribe(() => fetchActivities(false));
  }, [fetchActivities]);

  return (
    <Card className={cn("overflow-hidden border-border/80 shadow-md", className)}>
      <CardHeader
        className={cn(
          "bg-gradient-to-r from-primary/10 via-amber-500/5 to-transparent pb-3.5",
          compact && "p-4 pb-3",
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ActivityIcon className="h-4 w-4" />
            </span>
            <div>
              <CardTitle className="font-display text-lg font-bold flex items-center gap-2">
                <span>{title}</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-600 dark:text-emerald-400">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  Direct
                </span>
              </CardTitle>
              {!compact && <CardDescription className="text-xs">{description}</CardDescription>}
            </div>
          </div>

          <div className="flex items-center gap-1.5">
            {lastUpdated && (
              <span className="text-[11px] text-muted-foreground hidden sm:inline">
                {lastUpdated.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fetchActivities(true)}
              disabled={loading || refreshing}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
              title="Rafraîchir les activités"
            >
              <RotateCw className={cn("h-4 w-4", refreshing && "animate-spin text-primary")} />
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardContent className={cn("p-4 sm:p-5", compact && "p-3 sm:p-4")}>
        {/* Loading State */}
        {loading && (
          <div className="space-y-3">
            {[1, 2, 3, 4, 5].slice(0, limit).map((i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-xl border border-border/50 bg-muted/30 p-3 animate-pulse"
              >
                <div className="flex items-center gap-3">
                  <div className="h-8 w-8 rounded-full bg-muted" />
                  <div className="space-y-1.5">
                    <div className="h-3.5 w-24 rounded bg-muted" />
                    <div className="h-2.5 w-16 rounded bg-muted/70" />
                  </div>
                </div>
                <div className="h-5 w-14 rounded bg-muted" />
              </div>
            ))}
          </div>
        )}

        {/* Empty State */}
        {!loading && activities.length === 0 && (
          <div className="py-8 text-center text-muted-foreground">
            <Bike className="mx-auto h-8 w-8 opacity-40 mb-2" />
            <p className="text-sm font-semibold">Aucune sortie récente</p>
            <p className="text-xs mt-0.5">Sois le premier scout à enregistrer tes kilomètres !</p>
            {showLogButton && (
              <Button asChild size="sm" className="mt-3 text-xs rounded-xl font-bold">
                <Link to="/mes-km">
                  <Bike className="mr-1.5 h-3.5 w-3.5" />
                  Ajouter ma sortie
                </Link>
              </Button>
            )}
          </div>
        )}

        {/* List of Recent Activities */}
        {!loading && activities.length > 0 && (
          <div className="divide-y divide-border/40">
            {activities.map((act) => {
              const emblem = getPatrolEmblem(act.patrolName);
              const isStaff = isStaffPatrol({ name: act.patrolName, category: act.patrolCategory });

              return (
                <div
                  key={act.id}
                  className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0 hover:bg-muted/20 px-1 rounded-lg transition-colors"
                >
                  {/* Left: Avatar / Emblem & Scout info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-muted/60 text-lg shadow-2xs border border-border/60">
                      {emblem}
                    </span>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-display font-bold text-sm text-foreground truncate">
                          {act.scoutName}
                        </span>

                        {/* Patrol Badge */}
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold px-1.5 py-0 h-4.5",
                            isStaff
                              ? "border-purple-300 bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300"
                              : act.patrolCategory === "femme"
                                ? "border-rose-300 bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300"
                                : "border-sky-300 bg-sky-50 text-sky-700 dark:bg-sky-950/40 dark:text-sky-300",
                          )}
                        >
                          {act.patrolName}
                        </Badge>

                        {/* Sport Badge */}
                        <SportBadge
                          sport={getActivitySport(act)}
                          className="px-1.5 py-0 h-4.5"
                          iconClassName="h-2.5 w-2.5"
                        />
                      </div>

                      {/* Ride metadata & note */}
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5 flex-wrap">
                        <span className="flex items-center gap-1 font-medium">
                          <Clock className="h-3 w-3" />
                          {act.relativeTime}
                        </span>

                        {act.stravaLink ? (
                          <>
                            <span>•</span>
                            <a
                              href={act.stravaLink}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-0.5 text-orange-600 hover:text-orange-500 font-semibold"
                            >
                              <span>Strava</span>
                              <ExternalLink className="h-2.5 w-2.5" />
                            </a>
                          </>
                        ) : act.status === "approved" ? (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-0.5 text-emerald-600 dark:text-emerald-400 font-semibold">
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Validé
                            </span>
                          </>
                        ) : (
                          <>
                            <span>•</span>
                            <span className="inline-flex items-center gap-0.5 text-amber-600 dark:text-amber-400 font-semibold">
                              <AlertCircle className="h-2.5 w-2.5" />
                              En attente
                            </span>
                            {isAdmin && (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleQuickApprove(act.id);
                                }}
                                className="ml-1 inline-flex items-center gap-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/25 transition-colors cursor-pointer"
                                title="Valider immédiatement cette sortie"
                              >
                                <CheckCircle2 className="h-2.5 w-2.5" />
                                <span>Valider</span>
                              </button>
                            )}
                          </>
                        )}

                        {cleanActivityNote(act.note) && (
                          <>
                            <span>•</span>
                            <span className="truncate max-w-[130px] sm:max-w-[200px] italic text-muted-foreground">
                              &ldquo;{cleanActivityNote(act.note)}&rdquo;
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Distance Badge */}
                  <div className="shrink-0 text-right pl-2">
                    <div
                      className={cn(
                        "inline-flex items-baseline gap-1 rounded-xl px-2.5 py-1 shadow-2xs border",
                        SPORT_COLORS[getActivitySport(act)].soft,
                      )}
                    >
                      <span className="font-display font-black text-sm sm:text-base">
                        +{act.km}
                      </span>
                      <span className="text-[10px] font-bold uppercase">km</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer with Call to Action */}
        {showLogButton && (
          <div className="mt-4 pt-3 border-t border-border/50 flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              Chaque kilomètre compte pour le classement !
            </span>
            <Button
              asChild
              size="sm"
              variant="ghost"
              className="h-7 text-xs font-bold text-primary gap-1 px-2"
            >
              <Link to="/mes-km">
                <span>Mes km</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default RecentActivityFeed;
