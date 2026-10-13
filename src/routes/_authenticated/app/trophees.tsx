import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AppPageShell } from "@/components/AppPageShell";
import { DistanceTrophyCollection, NearestDistanceTrophy } from "@/components/DistanceTrophies";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import type { DistanceActivity } from "@/lib/distanceTrophies";
function TrophiesPage() {
  const { user } = useAuth(); const [activities, setActivities] = useState<DistanceActivity[]>([]);
  useEffect(() => { if (user?.id) void supabase.from("activities").select("km,note,status").eq("user_id", user.id).eq("status", "approved").then(({ data }) => setActivities((data ?? []) as DistanceActivity[])); }, [user?.id]);
  return <AppPageShell title="Mes trophées" description="Gagnés ou à décrocher sur une seule sortie."><NearestDistanceTrophy activities={activities} compact /><DistanceTrophyCollection activities={activities} /></AppPageShell>;
}
export const Route = createFileRoute("/_authenticated/app/trophees")({ ssr: false, component: TrophiesPage });
