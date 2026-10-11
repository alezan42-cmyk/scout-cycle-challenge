import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronDown,
  ExternalLink,
  History,
  ImageIcon,
  ListChecks,
  Loader2,
  Pencil,
  Search,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { SportBadge, SportIcon, SPORT_COLORS } from "@/components/SportIcon";
import {
  getActivitySport,
  cleanActivityNote,
  SPORT_INFO,
  type ActivitySport,
} from "@/lib/database";
import { deleteActivity } from "@/lib/proofStorage";
import { CHALLENGE_START } from "@/lib/challengeStart";
import { correctionSummary, type ActivityCorrection } from "@/lib/corrections";
import { cn } from "@/lib/utils";

const supabase = supabaseClient as unknown as SupabaseClient;

type Act = {
  id: string;
  user_id: string;
  km: number;
  elevation_m: number | null;
  ride_date: string;
  status: "approved" | "pending" | "rejected";
  strava_link: string | null;
  proof_path: string | null;
  gpx_path: string | null;
  note: string | null;
  group_ride_id: string | null;
};
type Person = {
  id: string;
  full_name: string | null;
  totem: string | null;
  patrol_id: string | null;
};
type Patrol = { id: string; name: string };

const PAGE = 30;
const SPORTS: ActivitySport[] = ["velo", "course", "marche"];
const fmtDate = (d: string) =>
  new Date(d + "T12:00:00").toLocaleDateString("fr-BE", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
const nameOf = (p?: Person) => p?.totem || p?.full_name || "Scout";

/** Onglet Sorties : toutes les sorties, avec correction et suppression par les admins. */
export function AdminActivitiesManager({
  onChanged,
  reloadKey,
}: {
  onChanged?: () => void;
  /** change quand la liste « en attente » change (validation, refus) */
  reloadKey?: number;
}) {
  const [acts, setActs] = useState<Act[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [corrections, setCorrections] = useState<ActivityCorrection[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sport, setSport] = useState<"all" | ActivitySport>("all");
  const [status, setStatus] = useState<"all" | "approved" | "pending">("all");
  const [shown, setShown] = useState(PAGE);
  const [editing, setEditing] = useState<Act | null>(null);
  const [deleting, setDeleting] = useState<Act | null>(null);
  const [showLog, setShowLog] = useState(false);

  const load = useCallback(async () => {
    const [a, p, pt, c] = await Promise.all([
      supabase
        .from("activities")
        .select(
          "id, user_id, km, elevation_m, ride_date, status, strava_link, proof_path, gpx_path, note, group_ride_id",
        )
        .order("ride_date", { ascending: false })
        .order("created_at", { ascending: false }),
      supabase.from("profiles").select("id, full_name, totem, patrol_id"),
      supabase.from("patrols").select("id, name"),
      supabase
        .from("activity_corrections")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(30),
    ]);
    setActs((a.data as Act[] | null) ?? []);
    setPeople((p.data as Person[] | null) ?? []);
    setPatrols((pt.data as Patrol[] | null) ?? []);
    setCorrections((c.data as ActivityCorrection[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load, reloadKey]);

  const personById = useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const patrolById = useMemo(() => new Map(patrols.map((p) => [p.id, p.name])), [patrols]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return acts.filter((a) => {
      if (sport !== "all" && getActivitySport(a) !== sport) return false;
      if (status !== "all" && a.status !== status) return false;
      if (!q) return true;
      const p = personById.get(a.user_id);
      const hay = [
        p?.totem,
        p?.full_name,
        p?.patrol_id ? patrolById.get(p.patrol_id) : "",
        a.ride_date,
        fmtDate(a.ride_date),
        String(a.km),
        cleanActivityNote(a.note),
      ]
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [acts, query, sport, status, personById, patrolById]);

  const refresh = async () => {
    await load();
    onChanged?.();
  };

  const confirmDelete = async () => {
    if (!deleting) return;
    const { error } = await deleteActivity(deleting.id);
    if (error) toast.error("Suppression impossible : " + error);
    else toast.success("Sortie supprimée. Le scout verra un message sur sa page « Mes km ».");
    setDeleting(null);
    await refresh();
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b p-4">
        <div className="flex items-center gap-2">
          <ListChecks className="h-5 w-5 text-primary" />
          <div>
            <h2 className="font-display text-lg font-bold text-foreground">Toutes les sorties</h2>
            <p className="text-xs text-muted-foreground">
              Corriger ou supprimer une sortie qui ne correspond pas à sa preuve. Le scout est
              prévenu sur sa page « Mes km ».
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setShown(PAGE);
            }}
            placeholder="Chercher un scout, une patrouille, une date, des km…"
            className="h-10 pl-9"
          />
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {(["all", ...SPORTS] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSport(s)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-semibold",
                  sport === s ? "bg-background text-foreground shadow-sm" : "text-muted-foreground",
                )}
              >
                {s === "all" ? "Tous sports" : SPORT_INFO[s].short}
              </button>
            ))}
          </div>
          <div className="flex rounded-lg border bg-muted/40 p-0.5">
            {(
              [
                ["all", "Tous statuts"],
                ["approved", "Validées"],
                ["pending", "En attente"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setStatus(v)}
                className={cn(
                  "rounded-md px-2.5 py-1 font-semibold",
                  status === v
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <p className="py-6 text-center text-sm text-muted-foreground">
            <Loader2 className="mr-1 inline h-4 w-4 animate-spin" />
            Chargement…
          </p>
        ) : filtered.length === 0 ? (
          <p className="py-6 text-center text-sm text-muted-foreground">Aucune sortie trouvée.</p>
        ) : (
          <ul className="divide-y rounded-xl border">
            {filtered.slice(0, shown).map((a) => {
              const p = personById.get(a.user_id);
              const sp = getActivitySport(a);
              return (
                <li key={a.id} className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-center gap-3">
                    <span
                      className={cn(
                        "grid h-12 w-14 shrink-0 place-items-center rounded-xl border font-display text-base font-black leading-none",
                        SPORT_COLORS[sp].soft,
                      )}
                    >
                      {Number(a.km).toLocaleString("fr-BE")}
                      <span className="text-[9px] font-semibold uppercase">km</span>
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="truncate text-sm font-bold text-foreground">
                          {nameOf(p)}
                        </span>
                        {p?.patrol_id && (
                          <span className="text-xs text-muted-foreground">
                            {patrolById.get(p.patrol_id)}
                          </span>
                        )}
                      </div>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                        <span>{fmtDate(a.ride_date)}</span>
                        <SportBadge sport={sp} className="h-5" />
                        {Number(a.elevation_m) > 0 && (
                          <span>{Math.round(Number(a.elevation_m))} m D+</span>
                        )}
                        <span
                          className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
                            a.status === "approved"
                              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                              : "bg-amber-500/10 text-amber-700 dark:text-amber-400",
                          )}
                        >
                          {a.status === "approved" ? "validée" : "en attente"}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex shrink-0 gap-1.5 [&>*]:min-w-0 [&>*]:flex-1 [&>*]:px-2 sm:[&>*]:flex-none sm:[&>*]:px-3">
                    {a.strava_link ? (
                      <Button asChild variant="outline" size="sm" className="h-10 sm:h-8">
                        <a
                          href={a.strava_link}
                          target="_blank"
                          rel="noreferrer"
                          title="Voir sur Strava"
                        >
                          <ExternalLink className="h-4 w-4" />
                          <span className="ml-1">Strava</span>
                        </a>
                      </Button>
                    ) : a.proof_path ? (
                      <Button asChild variant="outline" size="sm" className="h-10 sm:h-8">
                        <a
                          href={a.proof_path}
                          target="_blank"
                          rel="noreferrer"
                          title="Voir la photo"
                        >
                          <ImageIcon className="h-4 w-4" />
                          <span className="ml-1">Photo</span>
                        </a>
                      </Button>
                    ) : null}
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 sm:h-8"
                      onClick={() => setEditing(a)}
                    >
                      <Pencil className="mr-1 h-4 w-4" />
                      <span>Modifier</span>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-10 border-destructive/40 text-destructive hover:bg-destructive/10 sm:h-8"
                      onClick={() => setDeleting(a)}
                    >
                      <Trash2 className="mr-1 h-4 w-4" />
                      <span>Supprimer</span>
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {filtered.length > shown && (
          <Button variant="outline" className="w-full" onClick={() => setShown(shown + PAGE)}>
            Voir plus ({filtered.length - shown} restantes)
          </Button>
        )}

        <div className="rounded-xl border bg-muted/20">
          <button
            type="button"
            onClick={() => setShowLog(!showLog)}
            className="flex w-full items-center justify-between gap-2 p-3 text-left text-sm font-semibold text-foreground"
            aria-expanded={showLog}
          >
            <span className="flex items-center gap-2">
              <History className="h-4 w-4 text-muted-foreground" />
              Journal des corrections ({corrections.length})
            </span>
            <ChevronDown className={cn("h-4 w-4 transition-transform", showLog && "rotate-180")} />
          </button>
          {showLog && (
            <ul className="space-y-1.5 border-t p-3 text-xs">
              {corrections.length === 0 && (
                <li className="text-muted-foreground">Aucune correction pour l&apos;instant.</li>
              )}
              {corrections.map((c) => (
                <li key={c.id} className="flex flex-wrap gap-x-2">
                  <span className="text-muted-foreground">
                    {new Date(c.created_at).toLocaleString("fr-BE", {
                      dateStyle: "short",
                      timeStyle: "short",
                    })}
                  </span>
                  <span className="font-semibold text-foreground">
                    {nameOf(personById.get(c.user_id))}
                  </span>
                  <span className="text-foreground">
                    sortie du {c.ride_date ? fmtDate(c.ride_date) : "?"} : {correctionSummary(c)}
                  </span>
                  <span className="text-muted-foreground">
                    par {c.admin_id ? nameOf(personById.get(c.admin_id)) : "?"}
                    {c.seen_at ? " · vu" : ""}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {editing && (
        <EditDialog
          act={editing}
          scoutName={nameOf(personById.get(editing.user_id))}
          onClose={() => setEditing(null)}
          onSaved={async () => {
            setEditing(null);
            await refresh();
          }}
        />
      )}

      <AlertDialog open={!!deleting} onOpenChange={(o) => !o && setDeleting(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer cette sortie ?</AlertDialogTitle>
            <AlertDialogDescription>
              {deleting &&
                `${nameOf(personById.get(deleting.user_id))} · ${fmtDate(deleting.ride_date)} · ${Number(
                  deleting.km,
                ).toLocaleString("fr-BE")} km. `}
              Les km disparaissent des classements et la photo est effacée. Le scout verra un
              message sur sa page « Mes km ». C&apos;est définitif.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              onClick={confirmDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditDialog({
  act,
  scoutName,
  onClose,
  onSaved,
}: {
  act: Act;
  scoutName: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [km, setKm] = useState(String(act.km));
  const [dplus, setDplus] = useState(act.elevation_m == null ? "" : String(act.elevation_m));
  const [date, setDate] = useState(act.ride_date);
  const [sport, setSport] = useState<ActivitySport>(getActivitySport(act));
  const [status, setStatus] = useState<"approved" | "pending">(
    act.status === "pending" ? "pending" : "approved",
  );
  const [saving, setSaving] = useState(false);

  const originalSport = getActivitySport(act);
  const groupLinkLost = !!act.group_ride_id && (date !== act.ride_date || sport !== originalSport);

  const save = async () => {
    const kmN = parseFloat(km.replace(",", "."));
    if (!kmN || kmN <= 0 || kmN > 1000) return toast.error("Distance invalide (0,1 à 1000 km)");
    const d = dplus.trim() === "" ? null : Math.round(Number(dplus.replace(",", ".")));
    if (d !== null && (isNaN(d) || d < 0 || d > 20000))
      return toast.error("Dénivelé invalide (0 à 20 000 m)");
    if (!date || date < CHALLENGE_START) return toast.error("Date avant le début du défi");

    const patch: Partial<Pick<Act, "km" | "elevation_m" | "ride_date" | "note" | "status">> = {};
    if (kmN !== Number(act.km)) patch.km = kmN;
    if (d !== act.elevation_m) patch.elevation_m = d;
    if (date !== act.ride_date) patch.ride_date = date;
    if (sport !== originalSport) {
      const text = cleanActivityNote(act.note);
      patch.note = sport === "velo" ? text || null : text ? `[${sport}] ${text}` : `[${sport}]`;
    }
    if (status !== act.status) patch.status = status;
    if (Object.keys(patch).length === 0) return onClose();

    setSaving(true);
    const { error } = await supabase.from("activities").update(patch).eq("id", act.id);
    setSaving(false);
    if (error) {
      toast.error(
        error.message.includes("date_debut_defi")
          ? "Date avant le début du défi"
          : "Modification impossible : " + error.message,
      );
      return;
    }
    toast.success("Sortie corrigée. Le scout verra un message sur sa page « Mes km ».");
    onSaved();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Corriger la sortie de {scoutName}</DialogTitle>
          <DialogDescription>
            {act.strava_link ? (
              <a
                href={act.strava_link}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary underline"
              >
                Ouvrir le Strava <ExternalLink className="h-3 w-3" />
              </a>
            ) : act.proof_path ? (
              <a
                href={act.proof_path}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 font-semibold text-primary underline"
              >
                Voir la photo <ExternalLink className="h-3 w-3" />
              </a>
            ) : (
              "Pas de preuve jointe."
            )}{" "}
            Le scout sera prévenu de la correction.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="edit-km">Distance (km)</Label>
              <Input
                id="edit-km"
                inputMode="decimal"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                className="h-11 text-lg font-bold"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-dplus">D+ (m, facultatif)</Label>
              <Input
                id="edit-dplus"
                inputMode="numeric"
                value={dplus}
                onChange={(e) => setDplus(e.target.value)}
                className="h-11"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="edit-date">Date</Label>
            <Input
              id="edit-date"
              type="date"
              min={CHALLENGE_START}
              max={new Date().toISOString().slice(0, 10)}
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="h-11"
            />
          </div>
          <div className="space-y-1.5">
            <Label>Sport</Label>
            <div className="grid grid-cols-3 gap-1.5 rounded-xl border bg-muted/40 p-1">
              {SPORTS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSport(s)}
                  className={cn(
                    "flex items-center justify-center gap-1.5 rounded-lg py-2 text-xs font-bold",
                    sport === s ? SPORT_COLORS[s].solid : "text-muted-foreground",
                  )}
                >
                  <SportIcon sport={s} className="h-4 w-4" />
                  {SPORT_INFO[s].short}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Statut</Label>
            <div className="grid grid-cols-2 gap-1.5 rounded-xl border bg-muted/40 p-1">
              {(
                [
                  ["approved", "Validée"],
                  ["pending", "En attente"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setStatus(v)}
                  className={cn(
                    "rounded-lg py-2 text-xs font-bold",
                    status === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
          {groupLinkLost && (
            <p className="rounded-lg bg-amber-500/10 p-2.5 text-xs text-amber-800 dark:text-amber-300">
              ⚠️ Cette sortie fait partie d&apos;une sortie à plusieurs : en changeant la date ou le
              sport, elle n&apos;en fera plus partie (classement Peloton).
            </p>
          )}
        </div>

        <DialogFooter className="grid grid-cols-2 gap-2 sm:flex">
          <Button variant="outline" onClick={onClose}>
            Annuler
          </Button>
          <Button onClick={save} disabled={saving}>
            {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
