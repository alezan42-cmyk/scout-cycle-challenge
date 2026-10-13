import { useCallback, useEffect, useMemo, useState } from "react";
import { BrushCleaning, Eye, Loader2, Play, UserX } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { supabase as supabaseClient } from "@/integrations/supabase/client";

const supabase = supabaseClient as unknown as SupabaseClient;

type Report = {
  source?: string;
  aperçu?: boolean;
  groupes_vides_supprimes?: number;
  comptes_a_rebours_desactives?: number;
  sorties_en_attente_supprimees?: number;
  sorties_validees_nettoyees?: number;
  photos_de_preuve_effacees?: number;
  fichiers_orphelins_effaces?: number;
  erreurs?: string[];
};

type Run = { id: string; ran_at: string; trigger_source: string; details: Report };

type Member = {
  id: string;
  full_name: string | null;
  totem: string | null;
  created_at: string;
  is_admin?: boolean | null;
};

const RULES = [
  "Photos de preuve : effacées 30 jours après la validation (les km restent).",
  "Sorties validées depuis 30 jours : lien Strava et description effacés ; km, D+, date et sport conservés.",
  "Sorties en attente : signalées après 30 jours, supprimées après 60 jours.",
  "Sorties à plusieurs restées vides : supprimées après 30 jours.",
  "Comptes à rebours dépassés : désactivés le lendemain.",
  "Fichiers qui ne servent plus à rien : effacés après 7 jours.",
  "Jamais touchés : km, D+, classements, titres, timeline, traces GPX des sorties.",
];

function summary(r: Report): string {
  const parts = [
    [r.photos_de_preuve_effacees, "photo(s) de preuve"],
    [r.sorties_en_attente_supprimees, "sortie(s) en attente"],
    [r.sorties_validees_nettoyees, "sortie(s) validée(s) nettoyée(s)"],
    [r.groupes_vides_supprimes, "sortie(s) à plusieurs vide(s)"],
    [r.comptes_a_rebours_desactives, "compte(s) à rebours"],
    [r.fichiers_orphelins_effaces, "fichier(s) orphelin(s)"],
  ]
    .filter(([n]) => Number(n) > 0)
    .map(([n, label]) => `${n} ${label}`);
  return parts.length ? parts.join(" · ") : "Rien à nettoyer";
}

const SIX_MONTHS = 182 * 24 * 3600 * 1000;

/** Onglet « Ménage » : journal, lancement manuel, sorties anciennes, comptes inactifs. */
export function CleanupAdmin() {
  const [runs, setRuns] = useState<Run[]>([]);
  const [busy, setBusy] = useState<"apercu" | "lancer" | null>(null);
  const [preview, setPreview] = useState<Report | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [lastRide, setLastRide] = useState<Map<string, string>>(new Map());
  const [oldPending, setOldPending] = useState(0);

  const load = useCallback(async () => {
    const thirty = new Date(Date.now() - 30 * 864e5).toISOString();
    const [r, p, a, pend] = await Promise.all([
      supabase.from("cleanup_runs").select("*").order("ran_at", { ascending: false }).limit(5),
      supabase.from("profiles").select("id, full_name, totem, created_at, is_admin"),
      supabase.from("activities").select("user_id, ride_date"),
      supabase
        .from("activities")
        .select("id", { count: "exact", head: true })
        .eq("status", "pending")
        .lt("created_at", thirty),
    ]);
    setRuns((r.data as Run[] | null) ?? []);
    setMembers((p.data as Member[] | null) ?? []);
    const last = new Map<string, string>();
    for (const act of (a.data ?? []) as { user_id: string; ride_date: string }[]) {
      const prev = last.get(act.user_id);
      if (!prev || act.ride_date > prev) last.set(act.user_id, act.ride_date);
    }
    setLastRide(last);
    setOldPending(pend.count ?? 0);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (dryRun: boolean) => {
    if (
      !dryRun &&
      !confirm("Lancer le ménage maintenant ? Les éléments listés seront supprimés.")
    ) {
      return;
    }
    setBusy(dryRun ? "apercu" : "lancer");
    try {
      const { data, error } = await supabase.functions.invoke("menage", {
        body: { dry_run: dryRun },
      });
      if (error) throw error;
      const report = data as Report;
      if (dryRun) setPreview(report);
      else {
        setPreview(null);
        toast.success("Ménage terminé : " + summary(report));
        await load();
      }
      if (report.erreurs?.length) toast.warning(report.erreurs.join(" · "));
    } catch (e) {
      toast.error("Ménage impossible : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(null);
    }
  };

  const inactive = useMemo(() => {
    const now = Date.now();
    return members
      .filter((m) => !m.is_admin)
      .filter((m) => now - Date.parse(m.created_at) > 30 * 864e5)
      .map((m) => ({ ...m, last: lastRide.get(m.id) ?? null }))
      .filter((m) => !m.last || now - Date.parse(m.last) > SIX_MONTHS)
      .sort((a, b) => (a.last ?? "").localeCompare(b.last ?? ""));
  }, [members, lastRide]);

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-2 border-b pb-4">
          <BrushCleaning className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Ménage automatique</h2>
            <p className="text-xs text-muted-foreground">Chaque nuit vers 3 h, sans rien faire.</p>
          </div>
        </div>
        <ul className="mt-4 space-y-1.5 text-sm text-foreground">
          {RULES.map((r) => (
            <li key={r} className="flex gap-2">
              <span className="text-primary">•</span>
              <span>{r}</span>
            </li>
          ))}
        </ul>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" disabled={busy !== null} onClick={() => run(true)}>
            {busy === "apercu" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Eye className="mr-1 h-4 w-4" />
            )}
            Aperçu
          </Button>
          <Button disabled={busy !== null} onClick={() => run(false)}>
            {busy === "lancer" ? (
              <Loader2 className="mr-1 h-4 w-4 animate-spin" />
            ) : (
              <Play className="mr-1 h-4 w-4" />
            )}
            Lancer maintenant
          </Button>
        </div>
        {preview && (
          <p className="mt-3 rounded-xl bg-muted/60 p-3 text-sm">
            <strong>Si on lançait maintenant :</strong> {summary(preview)}
          </p>
        )}
        {oldPending > 0 && (
          <p className="mt-3 rounded-xl bg-amber-500/10 p-3 text-sm text-amber-800 dark:text-amber-300">
            ⚠️ {oldPending} sortie{oldPending > 1 ? "s" : ""} en attente depuis plus de 30 jours : à
            valider ou refuser dans l&apos;onglet Sorties, sinon suppression à 60 jours.
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
        <h3 className="border-b pb-3 font-display text-base font-bold text-foreground">
          Derniers ménages
        </h3>
        {runs.length === 0 ? (
          <p className="py-4 text-center text-xs text-muted-foreground">
            Aucun ménage pour l&apos;instant.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {runs.map((r) => (
              <li key={r.id} className="rounded-xl border bg-muted/20 p-3 text-sm">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>
                    {new Date(r.ran_at).toLocaleString("fr-BE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <span>{r.trigger_source === "admin" ? "lancé par un admin" : "nuit"}</span>
                </div>
                <div className="mt-1 text-foreground">{summary(r.details)}</div>
                {r.details.erreurs && r.details.erreurs.length > 0 && (
                  <div className="mt-1 text-xs text-destructive">
                    {r.details.erreurs.join(" · ")}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-6">
        <div className="flex items-center gap-2 border-b pb-3">
          <UserX className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-display text-base font-bold text-foreground">
            Comptes inactifs ({inactive.length})
          </h3>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          Aucune sortie depuis 6 mois (ou jamais). Rien n&apos;est supprimé automatiquement : à vous
          de voir.
        </p>
        {inactive.length > 0 && (
          <ul className="mt-3 divide-y text-sm">
            {inactive.map((m) => (
              <li key={m.id} className="flex justify-between gap-3 py-2">
                <span className="font-semibold text-foreground">
                  {m.totem || m.full_name || "Sans nom"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {m.last
                    ? `dernière sortie : ${new Date(m.last).toLocaleDateString("fr-BE")}`
                    : "aucune sortie"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
