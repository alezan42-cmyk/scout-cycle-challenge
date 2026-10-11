import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import {
  Trash2,
  Bike,
  ExternalLink,
  Clock,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Flame,
  Award,
  Footprints,
  PersonStanding,
  MapPin,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { DailyDistanceForm } from "@/components/DailyDistanceForm";
import { groupSizes, pelotonMultiplier, type PelotonActivity } from "@/lib/peloton";
import { supabase } from "@/integrations/supabase/client";
import { gpxDownloadUrl, gpxFileName } from "@/lib/gpxDownload";
import { deleteActivity as deleteActivityWithFiles } from "@/lib/proofStorage";
import {
  db,
  type Profile,
  getActivitySport,
  cleanActivityNote,
  type ActivitySport,
  SPORT_INFO,
} from "@/lib/database";
import { cn } from "@/lib/utils";
import { SportBadge, SPORT_COLORS } from "@/components/SportIcon";
import { CorrectionNotice } from "@/components/CorrectionNotice";

export const Route = createFileRoute("/_authenticated/mes-km")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mes kilomètres — ALEZAN 42" },
      {
        name: "description",
        content:
          "Enregistre tes sorties vélo, course à pied ou marche avec capture, Strava ou GPX.",
      },
      { property: "og:title", content: "Mes kilomètres — ALEZAN 42" },
      {
        property: "og:description",
        content: "Ajoute tes km de vélo, course à pied et marche pour ta patrouille.",
      },
    ],
  }),
  component: MesKm,
});

type Act = {
  id: string;
  user_id: string;
  ride_date: string;
  km: number;
  elevation_m?: number | null;
  status: "pending" | "approved" | "rejected";
  strava_link: string | null;
  proof_path: string | null;
  gpx_path?: string | null;
  note?: string | null;
  group_ride_id?: string | null;
  created_at: string;
};

export const statusLabel = {
  pending: "En attente",
  approved: "Validé",
  rejected: "Refusé",
} as const;

function MesKm() {
  const { user } = Route.useRouteContext();
  const [acts, setActs] = useState<Act[]>([]);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [patrolMap, setPatrolMap] = useState<Record<string, string>>({});
  const [sportFilter, setSportFilter] = useState<"all" | ActivitySport>("all");
  const [pelotonSizes, setPelotonSizes] = useState<Map<string, number>>(new Map());

  const load = useCallback(async () => {
    // 1. Load user profile from Supabase
    let p: Profile | null = null;
    try {
      const { data: prof } = (await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle()) as { data: Profile | null };
      p = prof;
    } catch {
      // ignore
    }

    if (!p) {
      p =
        db.getProfile(user.id) ||
        db.getProfiles().find((pr) => pr.email?.toLowerCase() === user.email?.toLowerCase()) ||
        null;
    }
    setProfile(p);

    // 2. Load patrols map
    try {
      const { data: pts } = (await supabase.from("patrols").select("id, name")) as {
        data: Array<{ id: string; name: string }> | null;
      };
      if (pts) {
        const map: Record<string, string> = {};
        pts.forEach((item: { id: string; name: string }) => {
          map[item.id] = item.name;
        });
        setPatrolMap(map);
      }
    } catch {
      // ignore
    }

    // 3. Load activities strictly from Supabase
    try {
      const res = (await supabase
        .from("activities")
        .select("*")
        .eq("user_id", user.id)
        .order("ride_date", { ascending: false })) as { data: Act[] | null };

      const list = res?.data || [];
      setActs(list);

      // Taille des sorties à plusieurs (classement Peloton)
      const groupIds = [...new Set(list.map((a) => a.group_ride_id).filter(Boolean))] as string[];
      if (groupIds.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { data: linked } = (await (supabase as any)
          .from("activities")
          .select("user_id, km, status, group_ride_id")
          .in("group_ride_id", groupIds)) as { data: PelotonActivity[] | null };
        setPelotonSizes(groupSizes(linked || []));
      } else {
        setPelotonSizes(new Map());
      }
    } catch {
      setActs([]);
    }
  }, [user.id, user.email]);

  useEffect(() => {
    load();
    return db.subscribe(load);
  }, [load]);

  const remove = async (a: Act) => {
    if (confirm("Supprimer cette sortie de ton historique ?")) {
      const { error } = await deleteActivityWithFiles(a.id);
      if (error) {
        toast.error("Erreur : " + error);
      } else {
        db.deleteActivity(a.id);
        toast.success("Sortie supprimée");
      }
      load();
    }
  };

  const approvedActs = acts.filter((a) => a.status === "approved");
  const pendingActs = acts.filter((a) => a.status === "pending");

  const veloApprovedActs = approvedActs.filter((a) => getActivitySport(a) === "velo");
  const courseApprovedActs = approvedActs.filter((a) => getActivitySport(a) === "course");

  const totalVeloKm = veloApprovedActs.reduce((s, a) => s + Number(a.km || 0), 0);
  const totalCourseKm = courseApprovedActs.reduce((s, a) => s + Number(a.km || 0), 0);
  const totalMarcheKm = approvedActs
    .filter((a) => getActivitySport(a) === "marche")
    .reduce((s, a) => s + Number(a.km || 0), 0);
  const totalKm = approvedActs.reduce((s, a) => s + Number(a.km || 0), 0);

  const filteredActs = useMemo(() => {
    if (sportFilter === "velo") return acts.filter((a) => getActivitySport(a) === "velo");
    if (sportFilter !== "all") return acts.filter((a) => getActivitySport(a) === sportFilter);
    return acts;
  }, [acts, sportFilter]);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-5xl px-4 py-8 md:py-12 space-y-8">
        {/* Corrections faites par le staff (km modifiés, sortie supprimée ou refusée) */}
        <CorrectionNotice userId={user?.id} />

        {/* Profile incomplete warning */}
        {profile && (!profile.patrol_id || !profile.onboarded) && (
          <div className="flex flex-col gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <AlertCircle className="h-5 w-5 shrink-0 text-amber-600" />
              <div>
                <p className="text-sm font-bold text-foreground">
                  Ton profil scout n'est pas encore complet !
                </p>
                <p className="text-xs text-muted-foreground">
                  Choisis ta patrouille pour que tes kilomètres soient crédités au classement
                  général.
                </p>
              </div>
            </div>
            <Button asChild size="sm" className="self-start sm:self-auto font-semibold">
              <Link to="/profil">Compléter mon profil</Link>
            </Button>
          </div>
        )}

        {/* User Stats Overview Banner */}
        <div className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-bark via-bark/95 to-bark/90 p-6 text-bark-foreground shadow-lg">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-display text-2xl font-black text-white">
                  {profile?.totem || profile?.full_name || user.email}
                </span>
                {profile?.is_chef && (
                  <span className="rounded-full bg-amber-400 px-2 py-0.5 text-[10px] font-black uppercase text-amber-950">
                    Chef
                  </span>
                )}
              </div>
              <p className="mt-1 text-xs text-bark-foreground/80">
                {profile?.patrol_id
                  ? `Patrouille : ${patrolMap[profile.patrol_id] || db.getPatrols().find((p) => p.id === profile.patrol_id)?.name || "Non assignée"}`
                  : "Aucune patrouille sélectionnée"}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <div className="rounded-xl border border-white/10 bg-black/40 px-3.5 py-2 text-center backdrop-blur">
                <div className="font-display text-xl font-black text-primary flex items-center justify-center gap-1">
                  <Bike className="h-4 w-4" />
                  <span>{totalVeloKm.toFixed(1)}</span>
                  <span className="text-xs text-bark-foreground/70">km</span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-bark-foreground/75">
                  Vélo validés
                </div>
              </div>

              <div className="rounded-xl border border-purple-400/20 bg-purple-950/40 px-3.5 py-2 text-center backdrop-blur">
                <div className="font-display text-xl font-black text-purple-300 flex items-center justify-center gap-1">
                  <Footprints className="h-4 w-4" />
                  <span>{totalCourseKm.toFixed(1)}</span>
                  <span className="text-xs text-purple-200/70">km</span>
                </div>
                <div className="text-[10px] font-bold uppercase tracking-wider text-purple-200/75">
                  Course validée
                </div>
              </div>

              {totalMarcheKm > 0 && (
                <div className="rounded-xl border border-sky-400/20 bg-sky-950/40 px-3.5 py-2 text-center backdrop-blur">
                  <div className="font-display text-xl font-black text-sky-300 flex items-center justify-center gap-1">
                    <PersonStanding className="h-4 w-4" />
                    <span>{totalMarcheKm.toFixed(1)}</span>
                    <span className="text-xs text-sky-200/70">km</span>
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-sky-200/75">
                    Marche validée
                  </div>
                </div>
              )}

              {pendingActs.length > 0 && (
                <div className="rounded-xl border border-amber-400/20 bg-amber-500/10 px-3 py-2 text-center backdrop-blur">
                  <div className="font-display text-xl font-black text-amber-300">
                    {pendingActs.length}
                  </div>
                  <div className="text-[10px] font-bold uppercase tracking-wider text-amber-200/80">
                    En attente
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Two Columns: Form + Ride History */}
        <div className="grid gap-8 lg:grid-cols-[1.1fr_1.2fr]">
          {/* Add Activity Form with Patrol Dropdown Selector */}
          <DailyDistanceForm
            defaultPatrolId={profile?.patrol_id || undefined}
            onSuccess={load}
            title="Enregistrer une sortie"
            description="Lien Strava, photo de compteur ou fichier GPX"
          />

          {/* Ride History */}
          <section className="space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h2 className="font-display text-xl font-bold text-foreground">
                Mon historique ({acts.length})
              </h2>

              {/* Filtre par Sport */}
              <div className="flex items-center gap-1 rounded-lg bg-muted p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setSportFilter("all")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-semibold transition-all",
                    sportFilter === "all"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  Tous ({acts.length})
                </button>
                <button
                  type="button"
                  onClick={() => setSportFilter("velo")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1",
                    sportFilter === "velo"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Bike className="h-3 w-3 text-primary" />
                  <span>Vélo ({acts.filter((a) => getActivitySport(a) === "velo").length})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setSportFilter("course")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1",
                    sportFilter === "course"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Footprints className="h-3 w-3 text-purple-600" />
                  <span>
                    Course ({acts.filter((a) => getActivitySport(a) === "course").length})
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setSportFilter("marche")}
                  className={cn(
                    "px-2.5 py-1 rounded-md font-semibold transition-all flex items-center gap-1",
                    sportFilter === "marche"
                      ? "bg-card text-foreground shadow-xs"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <PersonStanding className="h-3 w-3 text-sky-600" />
                  <span>
                    Marche ({acts.filter((a) => getActivitySport(a) === "marche").length})
                  </span>
                </button>
              </div>
            </div>

            {filteredActs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border bg-card p-12 text-center text-muted-foreground">
                <Bike className="mx-auto h-10 w-10 text-muted-foreground/40 mb-3" />
                <p className="font-semibold text-foreground">
                  Aucune sortie enregistrée pour l'instant
                </p>
                <p className="text-xs mt-1">
                  Utilise le formulaire ci-contre pour ajouter ta première sortie !
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {filteredActs.map((a) => {
                  const sport = getActivitySport(a);
                  const displayNote = cleanActivityNote(a.note) || SPORT_INFO[sport].label;

                  return (
                    <div
                      key={a.id}
                      className="group relative flex items-center justify-between gap-4 rounded-2xl border border-border/80 bg-card p-4 transition hover:border-primary/40 hover:shadow-sm"
                    >
                      <div className="flex items-center gap-3">
                        <span
                          className={cn(
                            "grid h-12 w-12 shrink-0 place-items-center rounded-xl font-display text-lg font-black",
                            SPORT_COLORS[sport].soft,
                          )}
                        >
                          {Number(a.km).toFixed(1)}
                          <span className="text-[10px] font-normal text-muted-foreground">km</span>
                        </span>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-sm font-bold text-foreground">{displayNote}</span>

                            {Number(a.elevation_m) > 0 && (
                              <span className="rounded-full border border-red-400/50 bg-red-500/5 px-2 py-0.5 text-[10px] font-bold text-red-600">
                                {Math.round(Number(a.elevation_m)).toLocaleString("fr-BE")} m D+
                              </span>
                            )}

                            {/* Badge Sport */}
                            <SportBadge sport={sport} />

                            {a.group_ride_id && (
                              <Badge
                                variant="outline"
                                className="gap-1 border-orange-300 bg-orange-50 text-[10px] font-bold text-orange-700 dark:border-orange-800 dark:bg-orange-950/40 dark:text-orange-300"
                                title="Sortie à plusieurs : seuls les participants dont la sortie est validée comptent"
                              >
                                <Users className="h-3 w-3" />
                                Peloton ·{" "}
                                {(() => {
                                  const n = pelotonSizes.get(a.group_ride_id) ?? 0;
                                  const m = pelotonMultiplier(n);
                                  return m > 0
                                    ? `${n} validés · ×${m.toLocaleString("fr-BE")}`
                                    : "en attente des autres";
                                })()}
                              </Badge>
                            )}

                            {/* Status badge */}
                            {a.status === "approved" ? (
                              <Badge className="bg-emerald-500/15 text-emerald-700 hover:bg-emerald-500/20 border-emerald-500/30 gap-1 text-[10px]">
                                <CheckCircle2 className="h-3 w-3" />
                                Validé
                              </Badge>
                            ) : a.status === "rejected" ? (
                              <Badge variant="destructive" className="gap-1 text-[10px]">
                                <XCircle className="h-3 w-3" />
                                Refusé
                              </Badge>
                            ) : (
                              <Badge
                                variant="outline"
                                className="bg-amber-500/10 text-amber-700 border-amber-500/30 gap-1 text-[10px]"
                              >
                                <Clock className="h-3 w-3" />
                                En attente
                              </Badge>
                            )}

                            {/* GPX badge if attached */}
                            {a.gpx_path && (
                              <a
                                href={gpxDownloadUrl(
                                  a.gpx_path,
                                  `sortie ${a.ride_date} ${a.km} km`,
                                )}
                                download={gpxFileName(`sortie ${a.ride_date} ${a.km} km`)}
                                title="Télécharger le tracé GPX"
                              >
                                <Badge
                                  variant="outline"
                                  className="text-[10px] border-cyan-400/40 bg-cyan-500/10 text-cyan-700 hover:bg-cyan-500/20 dark:text-cyan-300 gap-1 cursor-pointer"
                                >
                                  <MapPin className="h-2.5 w-2.5" />
                                  <span>Tracé GPX ⤓</span>
                                </Badge>
                              </a>
                            )}
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                            <span>
                              {new Date(a.ride_date).toLocaleDateString("fr-FR", {
                                weekday: "short",
                                day: "numeric",
                                month: "long",
                              })}
                            </span>
                            {a.strava_link && (
                              <a
                                href={a.strava_link}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-orange-600 hover:underline"
                              >
                                Strava <ExternalLink className="h-3 w-3" />
                              </a>
                            )}
                            {a.proof_path && !a.strava_link && (
                              <span className="text-muted-foreground italic">Capture jointe</span>
                            )}
                          </div>
                        </div>
                      </div>

                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => remove(a)}
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive rounded-lg"
                        title="Supprimer la sortie"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
