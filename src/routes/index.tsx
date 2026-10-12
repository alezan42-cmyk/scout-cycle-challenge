import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowRight, Award, Bike, Trophy } from "lucide-react";
import { ChallengesBanner } from "@/components/ChallengesPanel";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/useAuth";

export const Route = createFileRoute("/")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ALEZAN 42 — Accueil" },
      {
        name: "description",
        content: "Retrouve tes défis, tes kilomètres et le classement de la troupe.",
      },
      { property: "og:title", content: "ALEZAN 42 — Accueil" },
      {
        property: "og:description",
        content: "Retrouve tes défis, tes kilomètres et le classement de la troupe.",
      },
    ],
  }),
  component: Home,
});

function Home() {
  const { user, profile } = useAuth();
  const greeting = profile?.totem || profile?.full_name?.split(" ")[0] || "scout";

  return (
    <main className="mobile-home-page mx-auto max-w-5xl space-y-5 px-4 py-5 pb-8 md:space-y-8 md:py-10">
      <section className="rounded-3xl bg-gradient-to-br from-bark via-bark/95 to-orange-950 px-5 py-6 text-bark-foreground shadow-lg sm:px-8 sm:py-8">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-amber-300">ALEZAN 42</p>
        <h1 className="mt-2 font-display text-3xl font-black text-white sm:text-4xl">
          Toujours prêts, {greeting} !
        </h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-white/75 sm:text-base">
          Tes défis et tes sorties, au même endroit. Choisis simplement ce que tu veux faire.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row">
          <Button
            asChild
            size="lg"
            className="w-full justify-between rounded-xl font-bold sm:w-auto sm:justify-center"
          >
            <Link to={user ? "/mes-km" : "/auth"} hash="enregistrer">
              <span className="flex items-center gap-2">
                <Bike className="h-5 w-5" /> Enregistrer une sortie
              </span>
              <ArrowRight className="h-4 w-4 sm:hidden" />
            </Link>
          </Button>
          <Button
            asChild
            size="lg"
            variant="outline"
            className="w-full rounded-xl border-white/25 bg-white/10 font-semibold text-white hover:bg-white/20 hover:text-white sm:w-auto"
          >
            <Link to="/classement">
              <Trophy className="mr-2 h-4 w-4 text-amber-300" /> Voir le classement
            </Link>
          </Button>
        </div>
      </section>

      {user ? (
        <section aria-label="Défis en cours">
          <ChallengesBanner />
        </section>
      ) : (
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-amber-500/10 text-amber-600">
              <Award className="h-5 w-5" />
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-display text-lg font-bold">Défis et trophées</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                Connecte-toi pour retrouver tes défis et enregistrer tes sorties.
              </p>
            </div>
            <Button asChild size="sm" className="shrink-0 rounded-xl">
              <Link to="/auth">Connexion</Link>
            </Button>
          </div>
        </section>
      )}

      <section className="grid gap-3 sm:grid-cols-2">
        <Link
          to="/classement"
          className="group flex min-h-24 items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-amber-500/10 text-amber-600">
            <Trophy className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-bold">Classement</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              Patrouilles, scouts et défis
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" />
        </Link>
        <Link
          to={user ? "/mes-km" : "/auth"}
          className="group flex min-h-24 items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm transition hover:border-primary/40 hover:shadow-md"
        >
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary/10 text-primary">
            <Bike className="h-6 w-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-display font-bold">Mes kilomètres</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              {user ? "Trophées, historique et nouvelle sortie" : "Connecte-toi pour participer"}
            </span>
          </span>
          <ArrowRight className="h-4 w-4 text-muted-foreground transition group-hover:translate-x-1" />
        </Link>
      </section>
    </main>
  );
}
