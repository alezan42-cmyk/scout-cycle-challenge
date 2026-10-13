import { createFileRoute } from "@tanstack/react-router";
import { AppPageShell } from "@/components/AppPageShell";
import { RecentActivityFeed } from "@/components/RecentActivityFeed";
export const Route = createFileRoute("/app/sorties")({ ssr: false, component: () => <AppPageShell title="Dernières sorties" description="Les kilomètres récemment enregistrés par toute la troupe."><RecentActivityFeed limit={30} title="Sorties récentes" description="Les dernières contributions de tous les scouts" showLogButton={false} /></AppPageShell> });
