import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "@tanstack/react-router";
import { Check, ChevronRight, CircleHelp, Loader2, Send, Sparkles, Trophy } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { SupabaseClient } from "@supabase/supabase-js";

interface NameSuggestion {
  id: string;
  name: string;
  alezan_name_votes: Array<{ count: number }>;
}

const voteCount = (suggestion: NameSuggestion) => suggestion.alezan_name_votes?.[0]?.count ?? 0;
const pollDb = supabase as unknown as SupabaseClient;

export function AlezanNamePoll() {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<NameSuggestion[]>([]);
  const [newSuggestion, setNewSuggestion] = useState("");
  const [hasVoted, setHasVoted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const fetchSuggestions = useCallback(async () => {
    const { data, error: fetchError } = await pollDb
      .from("alezan_name_suggestions")
      .select("id, name, alezan_name_votes(count)");

    if (fetchError) {
      setError("Le vote est momentanément indisponible. Réessaie un peu plus tard.");
      setLoading(false);
      return;
    }

    const sorted = (data ?? []) as NameSuggestion[];
    sorted.sort((a, b) => voteCount(b) - voteCount(a));
    setSuggestions(sorted);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      setLoading(true);
      setError("");
      const [{ data, error: fetchError }, voteResult] = await Promise.all([
        pollDb.from("alezan_name_suggestions").select("id, name, alezan_name_votes(count)"),
        user
          ? pollDb.from("alezan_name_votes").select("id").eq("user_id", user.id).limit(1)
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (cancelled) return;
      if (fetchError) {
        setError("Le vote est momentanément indisponible. Réessaie un peu plus tard.");
      } else {
        const sorted = (data ?? []) as NameSuggestion[];
        sorted.sort((a, b) => voteCount(b) - voteCount(a));
        setSuggestions(sorted);
      }
      if (voteResult.error) setError("Impossible de vérifier ton vote pour le moment.");
      setHasVoted(Boolean(voteResult.data?.length));
      setLoading(false);
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [user]);

  const handleVote = async (suggestionId: string) => {
    if (!user || hasVoted || busyId) return;
    setBusyId(suggestionId);
    setError("");
    const { error: voteError } = await pollDb
      .from("alezan_name_votes")
      .insert({ suggestion_id: suggestionId, user_id: user.id });

    if (voteError) {
      setError("Ton vote n’a pas pu être enregistré. Vérifie ta connexion et réessaie.");
    } else {
      setHasVoted(true);
      setMessage("Ton vote est dans la course, merci !");
      await fetchSuggestions();
    }
    setBusyId(null);
  };

  const handleSuggest = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const name = newSuggestion.trim();
    if (!user || !name || submitting) return;

    setSubmitting(true);
    setError("");
    setMessage("");
    const { error: suggestionError } = await pollDb
      .from("alezan_name_suggestions")
      .insert({ name, submitted_by: user.id });

    if (suggestionError) {
      setError("Cette proposition n’a pas pu être ajoutée. Réessaie dans un instant.");
    } else {
      setNewSuggestion("");
      setMessage("Merci ! Ton idée rejoint la liste.");
      await fetchSuggestions();
    }
    setSubmitting(false);
  };

  const leadingVotes = Math.max(1, ...suggestions.map(voteCount));

  return (
    <section
      aria-labelledby="alezan-poll-title"
      className="overflow-hidden rounded-3xl border border-orange-200/80 bg-gradient-to-br from-orange-50 via-card to-amber-50 shadow-sm dark:border-orange-900/50 dark:from-orange-950/30 dark:via-card dark:to-amber-950/20"
    >
      <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_minmax(260px,0.8fr)] lg:items-center lg:gap-8">
        <div>
          <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-orange-200 bg-white/80 px-3 py-1 text-xs font-bold text-orange-800 shadow-sm dark:border-orange-900 dark:bg-orange-950/50 dark:text-orange-200">
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Le grand vote de la troupe
          </div>
          <h2
            id="alezan-poll-title"
            className="font-display text-xl font-black tracking-tight sm:text-2xl"
          >
            Quel nom pour notre cheval ?
          </h2>
          <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">
            Aide-nous à trouver le nom qui accompagnera toutes les aventures d’Alezan 42. Choisis
            ton favori ou propose une idée !
          </p>

          {!user && (
            <Button
              asChild
              variant="outline"
              className="mt-4 rounded-xl border-orange-300 bg-white/70 font-bold dark:bg-card"
            >
              <Link to="/auth">
                Connecte-toi pour participer <ChevronRight className="ml-1 h-4 w-4" />
              </Link>
            </Button>
          )}
        </div>

        <div className="rounded-2xl border border-orange-100 bg-white/75 p-4 shadow-sm dark:border-orange-900/50 dark:bg-background/70 sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <p className="text-xs font-black uppercase tracking-wider text-muted-foreground">
              Les idées en lice
            </p>
            <span className="inline-flex items-center gap-1 text-xs font-semibold text-orange-700 dark:text-orange-300">
              <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
              {suggestions.length} {suggestions.length > 1 ? "noms" : "nom"}
            </span>
          </div>

          {loading ? (
            <div
              className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground"
              role="status"
            >
              <Loader2 className="h-4 w-4 animate-spin" /> Chargement des propositions…
            </div>
          ) : suggestions.length ? (
            <ol className="space-y-2.5">
              {suggestions.map((suggestion, index) => {
                const votes = voteCount(suggestion);
                const percentage = Math.round((votes / leadingVotes) * 100);
                const isLeading = index === 0 && votes > 0;

                return (
                  <li key={suggestion.id}>
                    <div className="relative overflow-hidden rounded-xl border border-border/70 bg-background/80">
                      <div
                        className="absolute inset-y-0 left-0 rounded-xl bg-orange-100/70 transition-[width] duration-500 dark:bg-orange-950/40"
                        style={{ width: `${percentage}%` }}
                        aria-hidden="true"
                      />
                      <div className="relative flex items-center justify-between gap-3 px-3 py-2.5">
                        <div className="flex min-w-0 items-center gap-2.5">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-orange-100 text-xs font-black text-orange-800 dark:bg-orange-900/70 dark:text-orange-100">
                            {isLeading ? (
                              <Trophy className="h-3.5 w-3.5" aria-label="En tête" />
                            ) : (
                              index + 1
                            )}
                          </span>
                          <span className="truncate text-sm font-bold">{suggestion.name}</span>
                          <span className="shrink-0 text-xs text-muted-foreground">
                            {votes} voix
                          </span>
                        </div>
                        {user && !hasVoted && (
                          <Button
                            type="button"
                            size="sm"
                            variant={isLeading ? "default" : "outline"}
                            className="h-8 shrink-0 rounded-lg px-3 font-bold"
                            disabled={busyId !== null}
                            onClick={() => void handleVote(suggestion.id)}
                            aria-label={`Voter pour ${suggestion.name}`}
                          >
                            {busyId === suggestion.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              "Je vote"
                            )}
                          </Button>
                        )}
                        {hasVoted && (
                          <span className="inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5" />
                            <span className="sr-only">Vote enregistré</span>
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <div className="rounded-xl border border-dashed border-orange-200 px-4 py-6 text-center dark:border-orange-900">
              <CircleHelp className="mx-auto mb-2 h-5 w-5 text-orange-600" />
              <p className="text-sm font-semibold">Aucun nom proposé pour l’instant.</p>
              <p className="mt-1 text-xs text-muted-foreground">À toi d’ouvrir le bal !</p>
            </div>
          )}

          {hasVoted && (
            <p className="mt-3 text-sm font-semibold text-emerald-700 dark:text-emerald-400">
              {message || "Merci, ton vote est enregistré !"}
            </p>
          )}

          {user && !hasVoted && (
            <form onSubmit={(event) => void handleSuggest(event)} className="mt-4 flex gap-2">
              <Input
                value={newSuggestion}
                onChange={(event) => setNewSuggestion(event.target.value)}
                maxLength={40}
                placeholder="Une idée de nom ?"
                aria-label="Proposer un nom pour le cheval"
                className="h-10 min-w-0 rounded-xl bg-background"
              />
              <Button
                type="submit"
                variant="secondary"
                className="h-10 shrink-0 rounded-xl font-bold"
                disabled={!newSuggestion.trim() || submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <Send className="mr-1.5 h-4 w-4" /> Proposer
                  </>
                )}
              </Button>
            </form>
          )}

          {message && !hasVoted && (
            <p
              className="mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400"
              role="status"
            >
              {message}
            </p>
          )}
          {error && (
            <p className="mt-2 text-xs font-medium text-destructive" role="alert">
              {error}
            </p>
          )}
          <p className="mt-3 text-[11px] text-muted-foreground">
            Un vote par personne. Les résultats évoluent avec chaque voix.
          </p>
        </div>
      </div>
    </section>
  );
}
