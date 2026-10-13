import { createFileRoute } from "@tanstack/react-router";
import { AppPageShell } from "@/components/AppPageShell";
import { Leaderboard } from "@/components/Leaderboard";
export const Route = createFileRoute("/app/classement")({ ssr: false, component: () => <AppPageShell title="Classement" description="Les kilomètres validés de la troupe."><Leaderboard /></AppPageShell> });
