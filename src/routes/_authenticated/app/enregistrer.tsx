import { createFileRoute } from "@tanstack/react-router";
import { DailyDistanceForm } from "@/components/DailyDistanceForm";
import { AppPageShell } from "@/components/AppPageShell";
import { useAuth } from "@/lib/useAuth";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
function RecordPage() {
  const { user } = useAuth();
  const [patrolId, setPatrolId] = useState<string>();
  useEffect(() => { if (user?.id) void supabase.from("profiles").select("patrol_id").eq("id", user.id).maybeSingle().then(({ data }) => setPatrolId(data?.patrol_id ?? undefined)); }, [user?.id]);
  return <AppPageShell title="Enregistrer mes kms" description="Ajoute une sortie vélo, course à pied ou marche."><DailyDistanceForm defaultPatrolId={patrolId} title="Nouvelle sortie" description="Choisis ta discipline et ajoute ta preuve." /></AppPageShell>;
}
export const Route = createFileRoute("/_authenticated/app/enregistrer")({ ssr: false, component: RecordPage });
