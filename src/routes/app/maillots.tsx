import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppPageShell } from "@/components/AppPageShell";
import { JerseysPanel } from "@/components/JerseysPanel";
import { computeJerseys, type JerseyCandidate } from "@/lib/jerseys";
import { supabase } from "@/integrations/supabase/client";
import type { JerseyCategory } from "@/lib/jerseys";
type Profile = { id: string; full_name: string | null; totem: string | null; quali: string | null; patrol_id: string | null; is_admin?: boolean; patrols: { name: string; category: string } | null };
type Activity = { user_id: string; km: number; elevation_m?: number | null; ride_date: string; status: string; note?: string | null };
function JerseysPage() {
  const [jerseys, setJerseys] = useState(computeJerseys([]));
  useEffect(() => {
    let live = true;
    void Promise.all([
      supabase.from("profiles_public").select("id,full_name,totem,quali,patrol_id,is_admin,patrols(name,category)"),
      supabase.from("activities_public").select("user_id,km,elevation_m,ride_date,status,note").eq("status", "approved"),
    ]).then(([profilesResult, activitiesResult]) => {
      if (!live || profilesResult.error || activitiesResult.error) return;
      const profiles = (profilesResult.data ?? []) as unknown as Profile[];
      const activities = (activitiesResult.data ?? []) as unknown as Activity[];
      const totals = new Map<string, { km: number; dplus: number }>();
      for (const activity of activities) {
        const total = totals.get(activity.user_id) ?? { km: 0, dplus: 0 };
        total.km += Number(activity.km || 0);
        total.dplus += Number(activity.elevation_m || 0);
        totals.set(activity.user_id, total);
      }
      const candidates: JerseyCandidate[] = profiles.flatMap((profile) => {
        const total = totals.get(profile.id); const patrol = profile.patrols;
        if (!total || !patrol) return [];
        const category: JerseyCategory = profile.is_admin ? "staff" : patrol.category === "femme" ? "femme" : patrol.category === "staff" ? "staff" : "homme";
        return [{ user_id: profile.id, display_name: profile.totem || profile.full_name || "Scout", patrol_name: patrol.name, category, km: total.km, dplus: total.dplus }];
      });
      setJerseys(computeJerseys(candidates));
    });
    return () => { live = false; };
  }, []);
  return <AppPageShell title="Maillots" description="Les détenteurs actuels des maillots de la troupe."><JerseysPanel jerseys={jerseys} periodLabel="Toutes périodes" /></AppPageShell>;
}
export const Route = createFileRoute("/app/maillots")({ ssr: false, component: JerseysPage });
