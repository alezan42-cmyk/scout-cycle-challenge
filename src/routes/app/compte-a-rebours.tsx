import { createFileRoute } from "@tanstack/react-router";
import { AppPageShell } from "@/components/AppPageShell";
import { CountdownBanner } from "@/components/CountdownBanner";
import { useAuth } from "@/lib/useAuth";
function CountdownPage() { const { isAdmin } = useAuth(); return <AppPageShell title="Compte à rebours" description="Les prochains rendez-vous de la troupe."><CountdownBanner isAdmin={isAdmin} /></AppPageShell>; }
export const Route = createFileRoute("/app/compte-a-rebours")({ ssr: false, component: CountdownPage });
