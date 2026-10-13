import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, type FormEvent } from "react";
import {
  Heart,
  Bike,
  ArrowLeft,
  ExternalLink,
  Trophy,
  Sparkles,
  Flame,
  Target,
  Gift,
  Footprints,
  Edit,
  Plus,
  Save,
  Trash2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/lib/supabase";
import { db } from "@/lib/database";
import { useAuth } from "@/lib/useAuth";
import type { SupabaseClient } from "@supabase/supabase-js";

type GoalIcon = "bike" | "walk" | "target";

interface SolidarityGoal {
  id: string;
  title: string;
  subtitle: string | null;
  description: string;
  goal_km: number;
  icon: GoalIcon;
  sort_order: number;
}

const solidarityDb = supabase as unknown as SupabaseClient;
const goalIconComponents = { bike: Bike, walk: Footprints, target: Target };
const goalAccentClasses: Record<GoalIcon, { icon: string; progress: string; percent: string }> = {
  bike: {
    icon: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    progress: "[&>div]:bg-orange-500",
    percent: "text-orange-400",
  },
  walk: {
    icon: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    progress: "[&>div]:bg-emerald-500",
    percent: "text-emerald-500",
  },
  target: {
    icon: "bg-rose-500/10 text-rose-400 border-rose-500/20",
    progress: "[&>div]:bg-rose-500",
    percent: "text-rose-500",
  },
};

export const Route = createFileRoute("/solidarite")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "ASBL Profitivisme & Solidarité — ALEZAN 42" },
      {
        name: "description",
        content:
          "Objectifs solidaires, 24h et marche parrainée de la troupe ALEZAN 42 au profit de l'ASBL Profitivisme.",
      },
      { property: "og:title", content: "ASBL Profitivisme & Solidarité — ALEZAN 42" },
      {
        property: "og:description",
        content:
          "Profiter de la vie malgré tout. Pédaler ensemble pour soutenir l'ASBL Profitivisme.",
      },
    ],
    links: [
      { rel: "canonical", href: "https://alezan42-cycling.lesscoutsdemoustier.be/solidarite" },
    ],
  }),
  component: SolidarityPage,
});

function SolidarityPage() {
  const { isAdmin } = useAuth();
  const [totalKm, setTotalKm] = useState<number>(0);
  const [goals, setGoals] = useState<SolidarityGoal[]>([]);
  const [goalsLoading, setGoalsLoading] = useState(true);
  const [goalsError, setGoalsError] = useState("");
  const [editingGoalId, setEditingGoalId] = useState<string | null>(null);
  const [goalFormOpen, setGoalFormOpen] = useState(false);
  const [savingGoal, setSavingGoal] = useState(false);
  const [goalTitle, setGoalTitle] = useState("");
  const [goalSubtitle, setGoalSubtitle] = useState("");
  const [goalDescription, setGoalDescription] = useState("");
  const [goalKm, setGoalKm] = useState("500");
  const [goalIcon, setGoalIcon] = useState<GoalIcon>("target");

  const loadGoals = useCallback(async () => {
    setGoalsLoading(true);
    const { data, error } = await solidarityDb
      .from("solidarity_goals")
      .select("id, title, subtitle, description, goal_km, icon, sort_order")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      setGoalsError("Les objectifs solidaires n’ont pas pu être chargés.");
    } else {
      setGoals((data ?? []) as SolidarityGoal[]);
      setGoalsError("");
    }
    setGoalsLoading(false);
  }, []);

  // Récupération des kilomètres collectifs (identique à ton composant CollectiveRouteMap)
  const loadCollectiveDistance = useCallback(async () => {
    try {
      const { data: actsData } = await supabase.from("activities_public").select("km, status");
      let kmSum = 0;
      if (actsData && actsData.length > 0) {
        kmSum = actsData
          .filter((a) => a.status === "approved" || a.status === "pending")
          .reduce((sum, item) => sum + (Number(item.km) || 0), 0);
      }
      setTotalKm(Math.round(kmSum * 10) / 10);
    } catch (err) {
      console.warn("Erreur chargement kilomètres collectifs :", err);
      setTotalKm(0);
    }
  }, []);

  useEffect(() => {
    loadCollectiveDistance();
    return db.subscribe(() => loadCollectiveDistance());
  }, [loadCollectiveDistance]);

  useEffect(() => {
    void loadGoals();
  }, [loadGoals]);

  const resetGoalForm = () => {
    setEditingGoalId(null);
    setGoalTitle("");
    setGoalSubtitle("");
    setGoalDescription("");
    setGoalKm("500");
    setGoalIcon("target");
    setGoalFormOpen(false);
  };

  const openGoalForm = (goal?: SolidarityGoal) => {
    if (goal) {
      setEditingGoalId(goal.id);
      setGoalTitle(goal.title);
      setGoalSubtitle(goal.subtitle ?? "");
      setGoalDescription(goal.description);
      setGoalKm(String(goal.goal_km));
      setGoalIcon(goal.icon);
    } else {
      setEditingGoalId(null);
      setGoalTitle("");
      setGoalSubtitle("");
      setGoalDescription("");
      setGoalKm("500");
      setGoalIcon("target");
    }
    setGoalsError("");
    setGoalFormOpen(true);
  };

  const handleSaveGoal = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!goalTitle.trim() || Number(goalKm) <= 0 || savingGoal) return;

    setSavingGoal(true);
    setGoalsError("");
    const payload = {
      title: goalTitle.trim(),
      subtitle: goalSubtitle.trim() || null,
      description: goalDescription.trim(),
      goal_km: Number(goalKm),
      icon: goalIcon,
      sort_order: editingGoalId
        ? (goals.find((goal) => goal.id === editingGoalId)?.sort_order ?? goals.length)
        : goals.length,
    };
    const result = editingGoalId
      ? await solidarityDb.from("solidarity_goals").update(payload).eq("id", editingGoalId)
      : await solidarityDb.from("solidarity_goals").insert(payload);

    if (result.error) {
      setGoalsError("L’objectif n’a pas pu être enregistré. Réessaie.");
    } else {
      resetGoalForm();
      await loadGoals();
    }
    setSavingGoal(false);
  };

  const handleDeleteGoal = async (goal: SolidarityGoal) => {
    if (!window.confirm(`Supprimer l’objectif « ${goal.title} » ?`)) return;
    setGoalsError("");
    const { error } = await solidarityDb.from("solidarity_goals").delete().eq("id", goal.id);
    if (error) {
      setGoalsError("L’objectif n’a pas pu être supprimé. Réessaie.");
    } else {
      await loadGoals();
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header Banner */}
      <section className="relative overflow-hidden bg-bark py-14 text-bark-foreground md:py-20">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-rose-500/20 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-rose-500/10 border border-rose-500/20 px-3 py-1 text-xs font-semibold uppercase tracking-widest text-rose-300">
                <Heart className="h-3.5 w-3.5 fill-rose-400 text-rose-400" />
                <span>ASBL Profitivisme — Ride On !</span>
              </div>
              <h1 className="mt-3 text-3xl font-black md:text-5xl text-white">
                Pédaler pour la Bonne Cause
              </h1>
              <p className="mt-2 max-w-xl text-base text-bark-foreground/80">
                Inspirés par l'énergie de Gilles Van der Spek et le documentaire de Charles Masset,
                la Troupe ALEZAN 42 met ses roues au service de la lutte contre le cancer.
              </p>
            </div>
            <div>
              <Button
                asChild
                variant="outline"
                className="gap-2 rounded-xl border-bark-foreground/30 bg-bark-foreground/10 text-bark-foreground hover:bg-bark-foreground/20 text-xs font-semibold"
              >
                <Link to="/">
                  <ArrowLeft className="h-4 w-4" />
                  Retour à l'accueil
                </Link>
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-10 space-y-8">
        {/* Objectifs solidaires gérés depuis Supabase */}
        {isAdmin && (
          <section className="space-y-4 rounded-2xl border border-primary/20 bg-primary/5 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-foreground">Gérer les objectifs</h2>
                <p className="text-xs text-muted-foreground">
                  Les changements sont enregistrés et visibles par toute la troupe.
                </p>
              </div>
              {!goalFormOpen && (
                <Button type="button" size="sm" onClick={() => openGoalForm()}>
                  <Plus className="mr-1.5 h-4 w-4" /> Ajouter un objectif
                </Button>
              )}
            </div>

            {goalFormOpen && (
              <form
                onSubmit={(event) => void handleSaveGoal(event)}
                className="grid gap-3 sm:grid-cols-2"
              >
                <label className="space-y-1 text-xs font-semibold text-foreground">
                  Nom de l’objectif
                  <input
                    required
                    maxLength={80}
                    value={goalTitle}
                    onChange={(event) => setGoalTitle(event.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-foreground">
                  Sous-titre
                  <input
                    maxLength={100}
                    value={goalSubtitle}
                    onChange={(event) => setGoalSubtitle(event.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-foreground">
                  Objectif en kilomètres
                  <input
                    required
                    type="number"
                    min="0.1"
                    step="0.1"
                    value={goalKm}
                    onChange={(event) => setGoalKm(event.target.value)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal"
                  />
                </label>
                <label className="space-y-1 text-xs font-semibold text-foreground">
                  Icône
                  <select
                    value={goalIcon}
                    onChange={(event) => setGoalIcon(event.target.value as GoalIcon)}
                    className="h-10 w-full rounded-lg border border-input bg-background px-3 text-sm font-normal"
                  >
                    <option value="target">Objectif</option>
                    <option value="bike">Vélo</option>
                    <option value="walk">Marche</option>
                  </select>
                </label>
                <label className="space-y-1 text-xs font-semibold text-foreground sm:col-span-2">
                  Description
                  <textarea
                    rows={3}
                    maxLength={500}
                    value={goalDescription}
                    onChange={(event) => setGoalDescription(event.target.value)}
                    className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm font-normal"
                  />
                </label>
                <div className="flex gap-2 sm:col-span-2">
                  <Button type="submit" disabled={savingGoal}>
                    <Save className="mr-1.5 h-4 w-4" />
                    {savingGoal ? "Enregistrement…" : editingGoalId ? "Enregistrer" : "Ajouter"}
                  </Button>
                  <Button type="button" variant="outline" onClick={resetGoalForm}>
                    <X className="mr-1.5 h-4 w-4" /> Annuler
                  </Button>
                </div>
              </form>
            )}
          </section>
        )}

        {goalsError && (
          <p
            role="alert"
            className="rounded-xl border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
          >
            {goalsError}
          </p>
        )}

        {goalsLoading ? (
          <p role="status" className="py-8 text-center text-sm text-muted-foreground">
            Chargement des objectifs solidaires…
          </p>
        ) : goals.length > 0 ? (
          <div className="grid gap-6 md:grid-cols-2">
            {goals.map((goal) => {
              const Icon = goalIconComponents[goal.icon] ?? Target;
              const accent = goalAccentClasses[goal.icon] ?? goalAccentClasses.target;
              const progress = Math.min(100, Math.round((totalKm / Number(goal.goal_km)) * 100));
              return (
                <article
                  key={goal.id}
                  className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm space-y-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl border ${accent.icon}`}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <div className="min-w-0">
                        <h3 className="truncate font-display font-bold text-foreground">
                          {goal.title}
                        </h3>
                        {goal.subtitle && (
                          <p className="text-xs text-muted-foreground">{goal.subtitle}</p>
                        )}
                      </div>
                    </div>
                    <span className="shrink-0 font-mono text-sm font-black text-foreground">
                      {totalKm} / {goal.goal_km} km
                    </span>
                  </div>
                  {goal.description && (
                    <p className="text-xs text-muted-foreground">{goal.description}</p>
                  )}
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-semibold">
                      <span className="text-muted-foreground">Progression</span>
                      <span className={accent.percent}>{progress}%</span>
                    </div>
                    <Progress
                      value={progress}
                      className={`h-2.5 rounded-full ${accent.progress}`}
                    />
                  </div>
                  {isAdmin && (
                    <div className="flex gap-2 border-t border-border/70 pt-3">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => openGoalForm(goal)}
                      >
                        <Edit className="mr-1.5 h-3.5 w-3.5" /> Modifier
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => void handleDeleteGoal(goal)}
                      >
                        <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Supprimer
                      </Button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
        ) : (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            Aucun objectif solidaire n’est disponible pour le moment.
          </p>
        )}

        {/* Section Histoire / Profitivisme */}
        <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm space-y-6">
          <div className="flex items-center gap-3">
            <span className="grid h-12 w-12 place-items-center rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/20 shrink-0">
              <Bike className="h-6 w-6" />
            </span>
            <div>
              <h2 className="font-display text-xl font-bold text-foreground">
                L'esprit du « Profitivisme »
              </h2>
              <p className="text-xs text-rose-400 font-medium">Profiter de la vie, malgré tout</p>
            </div>
          </div>

          <div className="space-y-4 text-sm text-muted-foreground leading-relaxed">
            <p>
              Derrière ce mot-valise se cache une philosophie de vie extraordinaire initiée par
              Gilles Van der Spek : un optimisme infaillible et un besoin viscéral de profiter de
              chaque instant, même face à l'adversité de la maladie.
            </p>
            <p>
              Cycliste passionné, il s'était lancé des défis fous — comme rouler 24 heures d'affilée
              dans une nacelle de la grande roue de Bruxelles — pour transformer son combat en un
              message d'espoir. Aujourd'hui, l'ASBL <strong>Profitivisme</strong> continue de faire
              vivre cet héritage en soutenant les personnes touchées par le cancer.
            </p>
          </div>

          <div className="pt-2 flex flex-wrap items-center justify-between gap-4 border-t border-border/80">
            <span className="text-xs text-muted-foreground italic">
              « You May Have Been Given A Cactus, But You Don't Have To Sit On It. » 🌵
            </span>
            <a
              href="https://profitivisme.org"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary hover:underline underline-offset-4"
            >
              Visiter le site de l'ASBL Profitivisme
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Appel à l'action */}
        <div className="text-center rounded-2xl bg-primary/10 border border-primary/20 p-6 sm:p-8 space-y-4">
          <div className="inline-flex items-center gap-1 text-xs font-bold text-primary">
            <Flame className="h-4 w-4" />
            <span>Chaque kilomètre compte</span>
          </div>
          <h2 className="font-display text-xl font-bold text-foreground">
            Prêt à porter les couleurs du Profitivisme ?
          </h2>
          <p className="text-xs sm:text-sm text-muted-foreground max-w-xl mx-auto">
            Enfilez vos casques, cumulez vos kilomètres sur la plateforme de la troupe ALEZAN 42 et
            portons ensemble ce magnifique projet solidaire !
          </p>
          <div className="pt-2">
            <Button asChild className="rounded-xl font-bold shadow-md">
              <Link to="/mes-km">Enregistrer mes kilomètres</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}

export default SolidarityPage;
