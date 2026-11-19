import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Bike,
  Footprints,
  Medal,
  PersonStanding,
  Sparkles,
  UserRound,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SportBadge } from "@/components/SportIcon";
import { CumulativeDistanceLevels } from "@/components/DistanceTrophies";
import { supabase } from "@/integrations/supabase/client";
import { SPORT_INFO, getActivitySport, type ActivitySport } from "@/lib/database";
import { getBestSingleActivityDistances } from "@/lib/distanceTrophies";
import { useDistanceAwards } from "@/lib/useDistanceAwards";

export const Route = createFileRoute("/scout/$scoutId")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Profil scout — ALEZAN 42" },
      { name: "description", content: "Profil, sorties validées et badges de distance." },
    ],
  }),
  component: ScoutProfilePage,
});

type ScoutProfile = {
  id: string;
  full_name: string | null;
  totem: string | null;
  quali: string | null;
  scout_year: number | null;
  patrol_id: string | null;
};

type ScoutActivity = {
  id: string;
  user_id: string;
  km: number | null;
  elevation_m: number | null;
  ride_date: string | null;
  note: string | null;
  status: string | null;
};

type Patrol = { id: string; name: string };

const sportColors: Record<ActivitySport, string> = {
  velo: "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-200",
  course:
    "border-purple-300 bg-purple-50 text-purple-800 dark:border-purple-800 dark:bg-purple-950/50 dark:text-purple-200",
  marche:
    "border-sky-300 bg-sky-50 text-sky-800 dark:border-sky-800 dark:bg-sky-950/50 dark:text-sky-200",
};

function SportIcon({ sport }: { sport: ActivitySport }) {
  if (sport === "course") return <Footprints className="h-4 w-4" />;
  if (sport === "marche") return <PersonStanding className="h-4 w-4" />;
  return <Bike className="h-4 w-4" />;
}

function ScoutProfilePage() {
  const { scoutId } = Route.useParams();
  const { thresholds } = useDistanceAwards();
  const [profile, setProfile] = useState<ScoutProfile | null>(null);
  const [patrolName, setPatrolName] = useState<string | null>(null);
  const [patrolMemberCount, setPatrolMemberCount] = useState<number | null>(null);
  const [activities, setActivities] = useState<ScoutActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    async function loadProfile() {
      setLoading(true);
      setError(null);
      const [profileResult, activityResult] = (await Promise.all([
        supabase
          .from("profiles_public")
          .select("id,full_name,totem,quali,scout_year,patrol_id")
          .eq("id", scoutId)
          .maybeSingle(),
        supabase
          .from("activities_public")
          .select("id,user_id,km,elevation_m,ride_date,note,status")
          .eq("user_id", scoutId)
          .eq("status", "approved")
          .order("ride_date", { ascending: false }),
      ])) as unknown as [
        { data: ScoutProfile | null; error: unknown },
        { data: ScoutActivity[] | null; error: unknown },
      ];

      if (!active) return;
      if (profileResult.error || !profileResult.data) {
        setError("Ce profil est introuvable ou n’est pas accessible.");
        setLoading(false);
        return;
      }
      if (activityResult.error) {
        setError("Impossible de charger les sorties de ce scout.");
        setLoading(false);
        return;
      }

      const scout = profileResult.data as unknown as ScoutProfile;
      setProfile(scout);
      setActivities((activityResult.data || []) as unknown as ScoutActivity[]);

      if (scout.patrol_id) {
        const [{ data: patrol }, { count }] = (await Promise.all([
          supabase.from("patrols").select("id,name").eq("id", scout.patrol_id).maybeSingle(),
          supabase
            .from("profiles_public")
            .select("id", { count: "exact", head: true })
            .eq("patrol_id", scout.patrol_id),
        ])) as unknown as [{ data: Patrol | null }, { count: number | null }];
        if (active) {
          setPatrolName(patrol?.name ?? null);
          setPatrolMemberCount(count);
        }
      }
      if (active) setLoading(false);
    }

    void loadProfile();
    return () => {
      active = false;
    };
  }, [scoutId]);

  const earnedBadges = useMemo(() => {
    const best = getBestSingleActivityDistances(activities);
    return (Object.keys(thresholds.single_ride) as ActivitySport[]).flatMap((sport) =>
      thresholds.single_ride[sport].filter((km) => best[sport] >= km).map((km) => ({ sport, km })),
    );
  }, [activities, thresholds]);

  const displayName = profile?.totem
    ? `${profile.totem}${profile.quali ? ` ${profile.quali}` : ""}`
    : profile?.full_name || "Scout";

  if (loading) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <div className="h-40 animate-pulse rounded-2xl bg-muted" />
        <div className="mt-4 h-48 animate-pulse rounded-2xl bg-muted" />
      </main>
    );
  }

  if (error || !profile) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-8">
        <Card>
          <CardContent className="space-y-4 p-6 text-center">
            <p className="text-sm text-muted-foreground">{error || "Profil indisponible."}</p>
            <Button asChild variant="outline">
              <Link to="/">Retour à l’accueil</Link>
            </Button>
          </CardContent>
        </Card>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 py-8 sm:py-12">
      <Button asChild variant="ghost" size="sm" className="-ml-2 gap-2">
        <Link to="/">
          <ArrowLeft className="h-4 w-4" />
          Retour au classement
        </Link>
      </Button>

      <Card className="overflow-hidden border-primary/20">
        <div className="h-2 bg-gradient-to-r from-amber-500 via-orange-500 to-primary" />
        <CardContent className="flex flex-col gap-5 p-5 sm:flex-row sm:items-center sm:p-7">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-3xl bg-primary/10 text-primary">
            <UserRound className="h-10 w-10" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-2xl font-black sm:text-3xl">{displayName}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              {patrolName && <Badge variant="outline">Patrouille {patrolName}</Badge>}
              {patrolMemberCount !== null && patrolName && (
                <Badge variant="secondary">
                  {patrolMemberCount} personne{patrolMemberCount > 1 ? "s" : ""} dans la branche
                </Badge>
              )}
              {profile.scout_year && <Badge variant="secondary">{profile.scout_year}e année</Badge>}
              {profile.quali && !profile.totem && <Badge variant="outline">{profile.quali}</Badge>}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Medal className="h-5 w-5 text-amber-500" />
            Badges de distance
          </CardTitle>
        </CardHeader>
        <CardContent>
          {earnedBadges.length ? (
            <div className="flex flex-wrap gap-3">
              {earnedBadges.map(({ sport, km }) => (
                <div
                  key={`${sport}-${km}`}
                  title={`${SPORT_INFO[sport].label} : ${km} km sur une sortie validée`}
                  className={`flex min-w-24 flex-col items-center gap-1 rounded-2xl border px-4 py-3 shadow-sm ${sportColors[sport]}`}
                >
                  <SportIcon sport={sport} />
                  <span className="font-display text-lg font-black">{km} km</span>
                  <span className="text-[10px] font-semibold uppercase tracking-wide">
                    {SPORT_INFO[sport].short}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-xl border border-dashed p-5 text-center">
              <Sparkles className="mx-auto h-6 w-6 text-muted-foreground" />
              <p className="mt-2 text-sm text-muted-foreground">
                Les badges apparaîtront après les premières sorties validées.
              </p>
            </div>
          )}
          <p className="mt-4 text-xs text-muted-foreground">
            Chaque trophée se débloque quand une seule sortie validée atteint le palier de sa
            discipline.
          </p>
        </CardContent>
      </Card>

      <CumulativeDistanceLevels activities={activities} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Sorties validées</span>
            <Badge variant="secondary">
              {activities.length} sortie{activities.length === 1 ? "" : "s"}
            </Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {activities.length ? (
            <ul className="divide-y">
              {activities.map((activity) => {
                const sport = getActivitySport(activity);
                return (
                  <li
                    key={activity.id}
                    className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <SportBadge sport={sport} className="shrink-0" />
                      <time className="text-sm text-muted-foreground">
                        {activity.ride_date
                          ? new Date(`${activity.ride_date}T12:00:00`).toLocaleDateString("fr-FR", {
                              day: "numeric",
                              month: "long",
                              year: "numeric",
                            })
                          : "Date inconnue"}
                      </time>
                    </div>
                    <div className="flex items-center gap-3 text-sm font-semibold">
                      <span>{Number(activity.km || 0).toLocaleString("fr-FR")} km</span>
                      {Number(activity.elevation_m || 0) > 0 && (
                        <span className="text-muted-foreground">
                          {Number(activity.elevation_m).toLocaleString("fr-FR")} m D+
                        </span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="py-5 text-center text-sm text-muted-foreground">
              Aucune sortie validée pour le moment.
            </p>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
