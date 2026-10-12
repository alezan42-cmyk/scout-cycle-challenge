import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { toast } from "sonner";
import {
  Award,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Flag,
  LoaderCircle,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  Trophy,
  UserRound,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import type { Database } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/defis")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Défis entre scouts — ALEZAN 42" },
      { name: "description", content: "Lance un défi à un scout, relève-le et gagne des points." },
    ],
  }),
  component: ScoutChallenges,
});

type Challenge = Database["public"]["Tables"]["scout_challenges"]["Row"];
type Scout = {
  id: string;
  full_name: string | null;
  totem: string | null;
  patrol_id: string | null;
};
type Score = { user_id: string; points: number };
type Tab = "mine" | "ranking" | "review";

const statusText: Record<Challenge["status"], string> = {
  pending: "À accepter",
  accepted: "À relever",
  declined: "Décliné",
  submitted: "À valider",
  approved: "Validé",
  rejected: "Refusé",
};

const statusStyle: Record<Challenge["status"], string> = {
  pending: "border-amber-300 bg-amber-50 text-amber-800 dark:bg-amber-950/40 dark:text-amber-200",
  accepted: "border-sky-300 bg-sky-50 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200",
  declined: "border-muted bg-muted text-muted-foreground",
  submitted:
    "border-violet-300 bg-violet-50 text-violet-800 dark:bg-violet-950/40 dark:text-violet-200",
  approved:
    "border-emerald-300 bg-emerald-50 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200",
  rejected: "border-rose-300 bg-rose-50 text-rose-800 dark:bg-rose-950/40 dark:text-rose-200",
};

const displayDate = (value: string) =>
  new Intl.DateTimeFormat("fr-BE", { dateStyle: "medium" }).format(new Date(value));

function ScoutChallenges() {
  const { user, isAdmin } = useAuth();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [scores, setScores] = useState<Score[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("mine");
  const [completionNotes, setCompletionNotes] = useState<Record<string, string>>({});
  const [reviewPoints, setReviewPoints] = useState<Record<string, string>>({});
  const [form, setForm] = useState({ challengedId: "", title: "", description: "", points: "10" });

  const load = useCallback(async (quiet = false) => {
    if (quiet) setRefreshing(true);
    else setLoading(true);

    const [scoutResult, challengeResult, scoreResult] = await Promise.all([
      supabase
        .from("profiles_public")
        .select("id, full_name, totem, patrol_id")
        .order("full_name", { ascending: true }),
      supabase.from("scout_challenges").select("*").order("created_at", { ascending: false }),
      supabase.rpc("scout_challenge_leaderboard"),
    ]);

    if (scoutResult.error) toast.error("Impossible de charger la liste des scouts.");
    else {
      const rows = (scoutResult.data ?? []) as Array<{
        id: string | null;
        full_name: string | null;
        totem: string | null;
        patrol_id: string | null;
      }>;
      setScouts(rows.flatMap((row) => (row.id ? [{ ...row, id: row.id }] : [])));
    }

    if (challengeResult.error) {
      console.error("Erreur de chargement des défis :", challengeResult.error);
      toast.error(
        "Le tableau des défis n’est pas encore disponible. Vérifie que la migration Supabase est appliquée.",
      );
      setChallenges([]);
    } else {
      setChallenges(challengeResult.data ?? []);
    }

    if (scoreResult.error) {
      console.error("Erreur du classement des défis :", scoreResult.error);
      setScores([]);
    } else {
      setScores(scoreResult.data ?? []);
    }
    setLoading(false);
    setRefreshing(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const scoutById = useMemo(() => new Map(scouts.map((scout) => [scout.id, scout])), [scouts]);
  const labelFor = (id: string) => {
    const scout = scoutById.get(id);
    if (!scout) return "Scout";
    return scout.totem
      ? `${scout.full_name || "Scout"} · ${scout.totem}`
      : scout.full_name || "Scout";
  };
  const myChallenges = challenges.filter(
    (challenge) => challenge.challenger_id === user?.id || challenge.challenged_id === user?.id,
  );
  const pendingReviews = challenges.filter((challenge) => challenge.status === "submitted");
  const rankedScouts = [...scores]
    .map((score) => ({ ...score, scout: scoutById.get(score.user_id) }))
    .sort((a, b) => b.points - a.points);

  const createChallenge = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const points = Number(form.points);
    if (!form.challengedId || !form.title.trim() || !form.description.trim()) {
      toast.error("Complète le défi et choisis le scout qui le relèvera.");
      return;
    }
    if (!Number.isInteger(points) || points < 1 || points > 100) {
      toast.error("Propose entre 1 et 100 points.");
      return;
    }
    setCreating(true);
    const { error } = await supabase.rpc("create_scout_challenge", {
      _challenged_id: form.challengedId,
      _title: form.title.trim(),
      _description: form.description.trim(),
      _proposed_points: points,
    });
    setCreating(false);
    if (error) {
      toast.error(error.message || "Impossible d’envoyer le défi.");
      return;
    }
    toast.success(`Défi envoyé à ${labelFor(form.challengedId)} !`);
    setForm({ challengedId: "", title: "", description: "", points: "10" });
    setCreateOpen(false);
    await load(true);
  };

  const respond = async (challenge: Challenge, accept: boolean) => {
    const { error } = await supabase.rpc("respond_scout_challenge", {
      _challenge_id: challenge.id,
      _accept: accept,
    });
    if (error) toast.error(error.message || "Impossible d’enregistrer ta réponse.");
    else {
      toast.success(accept ? "Défi accepté ! À toi de jouer." : "Défi décliné.");
      await load(true);
    }
  };

  const submitCompletion = async (challenge: Challenge) => {
    const { error } = await supabase.rpc("submit_scout_challenge", {
      _challenge_id: challenge.id,
      _completion_note: completionNotes[challenge.id]?.trim() || null,
    });
    if (error) toast.error(error.message || "Impossible de soumettre le défi.");
    else {
      toast.success("Défi transmis au staff pour validation.");
      await load(true);
    }
  };

  const review = async (challenge: Challenge, approve: boolean) => {
    const awardedPoints = approve
      ? Number(reviewPoints[challenge.id] ?? challenge.proposed_points)
      : null;
    if (
      approve &&
      (!Number.isInteger(awardedPoints) || awardedPoints! < 1 || awardedPoints! > 100)
    ) {
      toast.error("Attribue un nombre entier de points entre 1 et 100.");
      return;
    }
    const { error } = await supabase.rpc("review_scout_challenge", {
      _challenge_id: challenge.id,
      _approve: approve,
      _awarded_points: awardedPoints,
    });
    if (error) toast.error(error.message || "Impossible d’enregistrer la validation.");
    else {
      toast.success(
        approve
          ? `${awardedPoints} points attribués à ${labelFor(challenge.challenged_id)}.`
          : "Défi refusé.",
      );
      await load(true);
    }
  };

  const tabs: { id: Tab; label: string; count?: number }[] = [
    {
      id: "mine",
      label: "Mes défis",
      count: myChallenges.filter((item) => item.status === "pending").length,
    },
    { id: "ranking", label: "Classement" },
    ...(isAdmin
      ? [{ id: "review" as const, label: "À valider", count: pendingReviews.length }]
      : []),
  ];

  return (
    <main className="min-h-screen bg-background px-3 py-5 sm:px-5 sm:py-8">
      <div className="mx-auto max-w-4xl space-y-5 sm:space-y-7">
        <section className="overflow-hidden rounded-3xl border border-primary/15 bg-gradient-to-br from-primary/10 via-card to-amber-500/10 p-5 shadow-sm sm:p-8">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 sm:gap-4">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-primary text-primary-foreground shadow-sm sm:h-14 sm:w-14">
                <Flag className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.16em] text-primary">
                  Défis entre scouts
                </p>
                <h1 className="mt-1 font-display text-2xl font-black text-foreground sm:text-3xl">
                  À toi de relever le défi !
                </h1>
                <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                  Lance un défi à un autre scout. Il propose les points, le staff vérifie la
                  réussite et décide du score final.
                </p>
              </div>
            </div>
            <Button
              type="button"
              onClick={() => setCreateOpen((open) => !open)}
              className="min-h-11 w-full shrink-0 rounded-xl font-bold sm:w-auto"
            >
              {createOpen ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
              {createOpen ? "Fermer" : "Lancer un défi"}
            </Button>
          </div>
        </section>

        {createOpen && (
          <form
            onSubmit={createChallenge}
            className="space-y-4 rounded-2xl border border-primary/20 bg-card p-4 shadow-sm sm:p-6"
          >
            <div className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-primary" />
              <h2 className="font-display text-lg font-black">Propose un défi</h2>
            </div>
            <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <div className="space-y-2">
                <Label htmlFor="challenge-target">À quel scout ?</Label>
                <select
                  id="challenge-target"
                  required
                  value={form.challengedId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, challengedId: event.target.value }))
                  }
                  className="h-11 w-full rounded-md border border-input bg-background px-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:text-sm"
                >
                  <option value="">Choisir un scout</option>
                  {scouts
                    .filter((scout) => scout.id !== user?.id)
                    .map((scout) => (
                      <option key={scout.id} value={scout.id}>
                        {labelFor(scout.id)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="challenge-points">Points proposés</Label>
                <Input
                  id="challenge-points"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  required
                  value={form.points}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, points: event.target.value }))
                  }
                  className="h-11"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="challenge-title">Le défi</Label>
              <Input
                id="challenge-title"
                required
                minLength={3}
                maxLength={100}
                value={form.title}
                onChange={(event) =>
                  setForm((current) => ({ ...current, title: event.target.value }))
                }
                placeholder="Ex. Faire une sortie de 15 km cette semaine"
                className="h-11"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="challenge-description">Détails et règles</Label>
              <Textarea
                id="challenge-description"
                required
                minLength={3}
                maxLength={600}
                value={form.description}
                onChange={(event) =>
                  setForm((current) => ({ ...current, description: event.target.value }))
                }
                placeholder="Explique comment réussir le défi. Le staff validera la réalisation avant d’attribuer les points."
                className="min-h-24 resize-y text-base md:text-sm"
              />
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCreateOpen(false)}
                className="min-h-11 rounded-xl"
              >
                Annuler
              </Button>
              <Button type="submit" disabled={creating} className="min-h-11 rounded-xl font-bold">
                {creating ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Send className="mr-2 h-4 w-4" />
                )}
                Envoyer le défi
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              Tu proposes de 1 à 100 points. Le staff peut modifier le nombre attribué après
              vérification.
            </p>
          </form>
        )}

        <div className="flex items-center justify-between gap-3">
          <div
            className="-mx-1 flex min-w-0 flex-1 gap-1 overflow-x-auto px-1 pb-1"
            role="tablist"
            aria-label="Tableau des défis"
          >
            {tabs.map((item) => (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={tab === item.id}
                onClick={() => setTab(item.id)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-3 text-sm font-bold transition sm:px-4 ${
                  tab === item.id
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-muted/70 text-muted-foreground hover:bg-muted hover:text-foreground"
                }`}
              >
                {item.label}
                {!!item.count && (
                  <span className="rounded-full bg-background/20 px-2 py-0.5 text-xs">
                    {item.count}
                  </span>
                )}
              </button>
            ))}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={() => void load(true)}
            disabled={refreshing}
            aria-label="Actualiser le tableau"
            className="h-11 w-11 shrink-0 rounded-xl"
          >
            <RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          </Button>
        </div>

        {loading ? (
          <div className="flex min-h-48 items-center justify-center rounded-2xl border bg-card text-muted-foreground">
            <LoaderCircle className="mr-2 h-5 w-5 animate-spin" /> Chargement des défis…
          </div>
        ) : tab === "ranking" ? (
          <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-6">
            <div className="mb-4 flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-xl bg-amber-500/15 text-amber-700 dark:text-amber-300">
                <Trophy className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-display text-xl font-black">Classement des défis</h2>
                <p className="text-xs text-muted-foreground">
                  Seuls les points validés par le staff comptent.
                </p>
              </div>
            </div>
            {rankedScouts.length ? (
              <ol className="space-y-2">
                {rankedScouts.map((entry, index) => (
                  <li
                    key={entry.user_id}
                    className="flex items-center gap-3 rounded-xl border bg-background p-3 sm:p-4"
                  >
                    <span
                      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black ${index === 0 ? "bg-amber-400 text-amber-950" : "bg-muted text-muted-foreground"}`}
                    >
                      {index === 0 ? <Award className="h-5 w-5" /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-bold">{labelFor(entry.user_id)}</span>
                      {entry.scout?.patrol_id && (
                        <span className="block text-xs text-muted-foreground">
                          Points de défis validés
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-lg font-black tabular-nums text-primary">
                        {entry.points}
                      </span>
                      <span className="text-[11px] font-semibold text-muted-foreground">
                        points
                      </span>
                    </span>
                  </li>
                ))}
              </ol>
            ) : (
              <EmptyState
                icon={<Trophy className="h-6 w-6" />}
                title="Le classement démarre bientôt"
                text="Les points apparaîtront ici après les premières validations du staff."
              />
            )}
          </section>
        ) : tab === "review" && isAdmin ? (
          <section className="space-y-3">
            {pendingReviews.length ? (
              pendingReviews.map((challenge) => (
                <ChallengeCard key={challenge.id} challenge={challenge} labelFor={labelFor}>
                  <div className="mt-4 rounded-xl bg-violet-50 p-3 dark:bg-violet-950/30 sm:p-4">
                    <div className="flex items-center gap-2 text-sm font-bold text-violet-900 dark:text-violet-100">
                      <ShieldCheck className="h-4 w-4" /> Vérification staff
                    </div>
                    <p className="mt-2 text-sm text-foreground">
                      {challenge.completion_note || "Aucun commentaire ajouté par le scout."}
                    </p>
                    <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
                      <div className="w-full space-y-1.5 sm:max-w-40">
                        <Label htmlFor={`award-${challenge.id}`}>Points à attribuer</Label>
                        <Input
                          id={`award-${challenge.id}`}
                          type="number"
                          min={1}
                          max={100}
                          step={1}
                          value={reviewPoints[challenge.id] ?? String(challenge.proposed_points)}
                          onChange={(event) =>
                            setReviewPoints((current) => ({
                              ...current,
                              [challenge.id]: event.target.value,
                            }))
                          }
                          className="h-11 bg-background"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2 sm:ml-auto sm:flex">
                        <Button
                          variant="outline"
                          onClick={() => void review(challenge, false)}
                          className="min-h-11 rounded-xl border-rose-300 text-rose-700 hover:bg-rose-50 dark:text-rose-300"
                        >
                          <X className="mr-1.5 h-4 w-4" /> Refuser
                        </Button>
                        <Button
                          onClick={() => void review(challenge, true)}
                          className="min-h-11 rounded-xl font-bold"
                        >
                          <Check className="mr-1.5 h-4 w-4" /> Valider
                        </Button>
                      </div>
                    </div>
                  </div>
                </ChallengeCard>
              ))
            ) : (
              <EmptyState
                icon={<ShieldCheck className="h-6 w-6" />}
                title="Aucun défi à valider"
                text="Les défis soumis par les scouts apparaîtront ici."
              />
            )}
          </section>
        ) : (
          <section className="space-y-3">
            {myChallenges.length ? (
              myChallenges.map((challenge) => {
                const received = challenge.challenged_id === user?.id;
                return (
                  <ChallengeCard key={challenge.id} challenge={challenge} labelFor={labelFor}>
                    {received && challenge.status === "pending" && (
                      <div className="mt-4 grid grid-cols-2 gap-2 sm:flex sm:justify-end">
                        <Button
                          variant="outline"
                          onClick={() => void respond(challenge, false)}
                          className="min-h-11 rounded-xl"
                        >
                          <X className="mr-1.5 h-4 w-4" /> Décliner
                        </Button>
                        <Button
                          onClick={() => void respond(challenge, true)}
                          className="min-h-11 rounded-xl font-bold"
                        >
                          <Check className="mr-1.5 h-4 w-4" /> Accepter
                        </Button>
                      </div>
                    )}
                    {received && challenge.status === "accepted" && (
                      <div className="mt-4 space-y-2">
                        <Label htmlFor={`completion-${challenge.id}`}>
                          Explique brièvement comment tu as relevé le défi
                        </Label>
                        <Textarea
                          id={`completion-${challenge.id}`}
                          maxLength={600}
                          value={completionNotes[challenge.id] ?? ""}
                          onChange={(event) =>
                            setCompletionNotes((current) => ({
                              ...current,
                              [challenge.id]: event.target.value,
                            }))
                          }
                          placeholder="Ton commentaire aidera le staff à valider la réussite."
                          className="min-h-20 resize-y text-base md:text-sm"
                        />
                        <div className="flex justify-end">
                          <Button
                            onClick={() => void submitCompletion(challenge)}
                            className="min-h-11 w-full rounded-xl font-bold sm:w-auto"
                          >
                            <Send className="mr-2 h-4 w-4" /> Envoyer au staff
                          </Button>
                        </div>
                      </div>
                    )}
                  </ChallengeCard>
                );
              })
            ) : (
              <EmptyState
                icon={<Flag className="h-6 w-6" />}
                title="Pas encore de défi"
                text="Lance un défi à un autre scout, ou attends d’en recevoir un."
              />
            )}
          </section>
        )}

        <p className="px-2 text-center text-xs text-muted-foreground">
          Un défi ne rapporte des points qu’après validation du staff. Le staff peut ajuster le
          score proposé.
        </p>
      </div>
    </main>
  );
}

function ChallengeCard({
  challenge,
  labelFor,
  children,
}: {
  challenge: Challenge;
  labelFor: (id: string) => string;
  children?: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="break-words font-display text-lg font-black text-foreground">
              {challenge.title}
            </h2>
            <Badge variant="outline" className={`rounded-full ${statusStyle[challenge.status]}`}>
              {statusText[challenge.status]}
            </Badge>
          </div>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {challenge.description}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <UserRound className="h-3.5 w-3.5" />
            <span>{labelFor(challenge.challenger_id)}</span>
            <ChevronRight className="h-3 w-3" />
            <span>{labelFor(challenge.challenged_id)}</span>
            <span aria-hidden="true">·</span>
            <Clock3 className="h-3.5 w-3.5" />
            <span>{displayDate(challenge.created_at)}</span>
          </p>
        </div>
        <div className="flex shrink-0 items-center justify-between gap-2 rounded-xl bg-amber-500/10 px-3 py-2 sm:justify-center sm:text-center">
          <span className="text-xs font-semibold text-muted-foreground">
            {challenge.status === "approved" ? "Attribués" : "Proposés"}
          </span>
          <span className="flex items-center gap-1 font-black tabular-nums text-amber-700 dark:text-amber-300">
            <Award className="h-4 w-4" /> {challenge.awarded_points ?? challenge.proposed_points}{" "}
            pts
          </span>
        </div>
      </div>
      {challenge.status === "approved" && (
        <p className="mt-3 flex items-center gap-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300">
          <CheckCircle2 className="h-4 w-4" /> Validé le{" "}
          {challenge.reviewed_at ? displayDate(challenge.reviewed_at) : "—"}
        </p>
      )}
      {children}
    </article>
  );
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex min-h-52 flex-col items-center justify-center rounded-2xl border border-dashed bg-card px-5 py-8 text-center">
      <span className="mb-3 grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
        {icon}
      </span>
      <h2 className="font-display text-lg font-black">{title}</h2>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{text}</p>
    </div>
  );
}
