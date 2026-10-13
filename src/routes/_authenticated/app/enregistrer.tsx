import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { DailyDistanceForm } from "@/components/DailyDistanceForm";
import { AppPageShell } from "@/components/AppPageShell";
import { useAuth } from "@/lib/useAuth";

function RecordScreen() {
  const { profile } = useAuth();
  const navigate = useNavigate();
  const qc = useQueryClient();
  return (
    <AppPageShell title="Nouvelle sortie">
      <DailyDistanceForm
        variant="app"
        {...(profile?.patrol_id ? { defaultPatrolId: profile.patrol_id } : {})}
        onSuccess={async () => {
          await Promise.all([
            qc.invalidateQueries({ queryKey: ["app-my-activities"] }),
            qc.invalidateQueries({ queryKey: ["app-troop-data"] }),
          ]);
          void navigate({ to: "/app/mes-kms" });
        }}
      />
    </AppPageShell>
  );
}

export const Route = createFileRoute("/_authenticated/app/enregistrer")({
  ssr: false,
  component: RecordScreen,
});
