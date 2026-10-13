import { createFileRoute } from "@tanstack/react-router";
import { AppPageShell } from "@/components/AppPageShell";
import { ChallengesPanel } from "@/components/ChallengesPanel";
export const Route = createFileRoute("/app/defis")({
  ssr: false,
  component: () => (
    <AppPageShell title="Défis" description="Les défis à relever et le classement des points.">
      <ChallengesPanel />
    </AppPageShell>
  ),
});
