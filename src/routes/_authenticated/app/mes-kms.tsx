import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppPageShell } from "@/components/AppPageShell";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { SPORT_INFO, getActivitySport } from "@/lib/database";
import { Badge } from "@/components/ui/badge";
type Activity = { id: string; km: number; ride_date: string; status: string; note?: string | null; elevation_m?: number | null };
function MyActivitiesPage() {
  const { user } = useAuth(); const [activities, setActivities] = useState<Activity[]>([]);
  useEffect(() => { if (user?.id) void supabase.from("activities").select("id,km,ride_date,status,note,elevation_m").eq("user_id", user.id).order("ride_date", { ascending: false }).then(({ data }) => setActivities((data ?? []) as Activity[])); }, [user?.id]);
  return <AppPageShell title="Mes kms enregistrés" description="Ton historique personnel, du plus récent au plus ancien."><div className="space-y-3">{activities.length ? activities.map((a) => <article key={a.id} className="rounded-2xl border bg-card p-4"><div className="flex items-center justify-between gap-3"><div className="font-display text-lg font-bold">{Number(a.km).toLocaleString("fr-BE")} km</div><Badge variant={a.status === "approved" ? "default" : "outline"}>{a.status === "approved" ? "Validé" : a.status === "pending" ? "En attente" : "Refusé"}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{new Date(`${a.ride_date}T12:00:00`).toLocaleDateString("fr-BE")} · {SPORT_INFO[getActivitySport(a)].label}{a.elevation_m ? ` · ${a.elevation_m} m D+` : ""}</p></article>) : <p className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground">Aucune sortie enregistrée pour le moment.</p>}</div></AppPageShell>;
}
export const Route = createFileRoute("/_authenticated/app/mes-kms")({ ssr: false, component: MyActivitiesPage });
