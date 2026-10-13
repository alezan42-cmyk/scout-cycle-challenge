import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Bike, ExternalLink, ImageIcon, Loader2, Medal, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { AppPageShell } from "@/components/AppPageShell";
import {
  AppCard,
  AppEmpty,
  AppList,
  AppListRow,
  AppSection,
  ChipRow,
} from "@/components/app/AppUi";
import { CorrectionNotice } from "@/components/CorrectionNotice";
import { SportIcon, SPORT_COLORS } from "@/components/SportIcon";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { useAuth } from "@/lib/useAuth";
import {
  formatKm,
  periodRange,
  useMyActivities,
  type AppSport,
  type MyActivity,
} from "@/lib/appData";
import { cleanActivityNote, getActivitySport, SPORT_INFO } from "@/lib/database";
import { deleteActivity } from "@/lib/proofStorage";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/mes-kms")({
  ssr: false,
  component: MyKmScreen,
});

const STATUS: Record<MyActivity["status"], { label: string; cls: string }> = {
  approved: { label: "Validée", cls: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-400" },
  pending: { label: "En attente", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  rejected: { label: "Refusée", cls: "bg-destructive/10 text-destructive" },
};

const monthLabel = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("fr-BE", { month: "long", year: "numeric" });

function MyKmScreen() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: acts = [], isLoading } = useMyActivities(user?.id);
  const [sport, setSport] = useState<AppSport>("all");
  const [open, setOpen] = useState<MyActivity | null>(null);
  const [deleting, setDeleting] = useState(false);

  const month = periodRange("month")!;
  const totals = useMemo(() => {
    const approved = acts.filter((a) => a.status === "approved");
    const sum = (list: MyActivity[]) => list.reduce((s, a) => s + Number(a.km || 0), 0);
    return {
      all: sum(approved),
      month: sum(approved.filter((a) => a.ride_date >= month.from && a.ride_date <= month.to)),
      pending: sum(acts.filter((a) => a.status === "pending")),
    };
  }, [acts, month.from, month.to]);

  const groups = useMemo(() => {
    const list = acts.filter((a) => sport === "all" || getActivitySport(a) === sport);
    const out: { label: string; items: MyActivity[] }[] = [];
    for (const a of list) {
      const label = monthLabel(a.ride_date);
      const last = out[out.length - 1];
      if (last?.label === label) last.items.push(a);
      else out.push({ label, items: [a] });
    }
    return out;
  }, [acts, sport]);

  const remove = async () => {
    if (!open) return;
    if (!window.confirm("Supprimer cette sortie ? Les km seront retirés du classement.")) return;
    setDeleting(true);
    const { error } = await deleteActivity(open.id);
    setDeleting(false);
    if (error) {
      toast.error("Suppression impossible : " + error);
      return;
    }
    toast.success("Sortie supprimée");
    setOpen(null);
    await qc.invalidateQueries({ queryKey: ["app-my-activities"] });
    await qc.invalidateQueries({ queryKey: ["app-troop-data"] });
  };

  return (
    <AppPageShell root title="Mes km">
      {user && <CorrectionNotice userId={user.id} />}

      <div className="grid grid-cols-3 gap-3">
        <Stat label="Ce mois" value={totals.month} />
        <Stat label="Au total" value={totals.all} />
        <Stat label="En attente" value={totals.pending} muted />
      </div>

      <AppList>
        <AppListRow
          to="/app/trophees"
          icon={Medal}
          iconClassName="bg-amber-500/15 text-amber-600"
          title="Mes trophées"
          subtitle="Gagnés et à décrocher"
        />
      </AppList>

      <AppSection title="Historique">
        <ChipRow
          value={sport}
          onChange={setSport}
          options={[
            { value: "all", label: "Tout" },
            ...(["velo", "course", "marche"] as const).map((s) => ({
              value: s,
              label: (
                <>
                  <SportIcon sport={s} className="h-4 w-4" />
                  {SPORT_INFO[s].short}
                </>
              ),
            })),
          ]}
        />
      </AppSection>

      {isLoading ? (
        <AppEmpty title="Chargement…" />
      ) : groups.length === 0 ? (
        <AppEmpty
          icon={Bike}
          title="Aucune sortie pour l'instant"
          text="Ta première sortie t'attend : vélo, course ou marche, tout compte."
        >
          <Link
            to="/app/enregistrer"
            className="inline-flex h-11 items-center rounded-2xl bg-primary px-5 text-[15px] font-bold text-primary-foreground"
          >
            Enregistrer une sortie
          </Link>
        </AppEmpty>
      ) : (
        groups.map((g) => (
          <AppSection key={g.label} title={g.label}>
            <AppCard className="divide-y divide-border/60 overflow-hidden">
              {g.items.map((a) => {
                const sp = getActivitySport(a);
                const note = cleanActivityNote(a.note);
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setOpen(a)}
                    className="flex min-h-[64px] w-full items-center gap-3.5 px-4 py-2.5 text-left active:bg-muted/70"
                  >
                    <span
                      className={cn(
                        "grid h-10 w-10 shrink-0 place-items-center rounded-xl border",
                        SPORT_COLORS[sp].soft,
                      )}
                    >
                      <SportIcon sport={sp} className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[16px] font-semibold text-foreground">
                        {note || SPORT_INFO[sp].label}
                      </span>
                      <span className="block truncate text-[13px] text-muted-foreground">
                        {new Date(`${a.ride_date}T12:00:00`).toLocaleDateString("fr-BE", {
                          weekday: "short",
                          day: "numeric",
                          month: "short",
                        })}
                        {Number(a.elevation_m) > 0 &&
                          ` · ${Math.round(Number(a.elevation_m))} m D+`}
                      </span>
                    </span>
                    <span className="flex shrink-0 flex-col items-end gap-1">
                      <span className="text-[16px] font-bold tabular-nums text-foreground">
                        {formatKm(Number(a.km))} km
                      </span>
                      {a.status !== "approved" && (
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-[11px] font-bold",
                            STATUS[a.status].cls,
                          )}
                        >
                          {STATUS[a.status].label}
                        </span>
                      )}
                    </span>
                  </button>
                );
              })}
            </AppCard>
          </AppSection>
        ))
      )}

      <Sheet open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <SheetContent
          side="bottom"
          className="rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))]"
        >
          {open && <ActivityDetail act={open} deleting={deleting} onDelete={remove} />}
        </SheetContent>
      </Sheet>
    </AppPageShell>
  );
}

function Stat({ label, value, muted }: { label: string; value: number; muted?: boolean }) {
  return (
    <AppCard className="px-3 py-3.5 text-center">
      <p
        className={cn(
          "font-display text-[22px] font-black leading-none tabular-nums text-foreground",
          muted && value > 0 && "text-amber-700 dark:text-amber-400",
          muted && value === 0 && "text-muted-foreground",
        )}
      >
        {formatKm(value)}
      </p>
      <p className="mt-1.5 text-[12px] font-semibold text-muted-foreground">{label}</p>
    </AppCard>
  );
}

function ActivityDetail({
  act,
  deleting,
  onDelete,
}: {
  act: MyActivity;
  deleting: boolean;
  onDelete: () => void;
}) {
  const sp = getActivitySport(act);
  const note = cleanActivityNote(act.note);
  return (
    <div className="space-y-5 pt-2">
      <SheetHeader className="text-left">
        <div className="flex items-center gap-3">
          <span
            className={cn("grid h-12 w-12 place-items-center rounded-2xl", SPORT_COLORS[sp].solid)}
          >
            <SportIcon sport={sp} className="h-6 w-6" />
          </span>
          <div>
            <SheetTitle className="text-[20px]">
              {formatKm(Number(act.km))} km · {SPORT_INFO[sp].short}
            </SheetTitle>
            <SheetDescription className="text-[14px]">
              {new Date(`${act.ride_date}T12:00:00`).toLocaleDateString("fr-BE", {
                weekday: "long",
                day: "numeric",
                month: "long",
              })}
            </SheetDescription>
          </div>
        </div>
      </SheetHeader>

      <AppList>
        <AppListRow
          title="Statut"
          chevron={false}
          value={
            <span
              className={cn(
                "rounded-full px-2.5 py-1 text-[13px] font-bold",
                STATUS[act.status].cls,
              )}
            >
              {STATUS[act.status].label}
            </span>
          }
        />
        {Number(act.elevation_m) > 0 && (
          <AppListRow
            title="Dénivelé"
            chevron={false}
            value={`${Math.round(Number(act.elevation_m))} m`}
          />
        )}
        {note && <AppListRow title="Commentaire" subtitle={note} chevron={false} />}
        {act.group_ride_id && <AppListRow title="Sortie à plusieurs" chevron={false} value="Oui" />}
      </AppList>

      <div className="grid gap-2">
        {act.strava_link && (
          <a
            href={act.strava_link}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-muted text-[15px] font-semibold text-foreground"
          >
            <ExternalLink className="h-4 w-4" /> Voir sur Strava
          </a>
        )}
        {!act.strava_link && act.proof_path && (
          <a
            href={act.proof_path}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-2xl bg-muted text-[15px] font-semibold text-foreground"
          >
            <ImageIcon className="h-4 w-4" /> Voir la photo
          </a>
        )}
        <button
          type="button"
          onClick={onDelete}
          disabled={deleting}
          className="flex h-12 items-center justify-center gap-2 rounded-2xl text-[15px] font-semibold text-destructive active:bg-destructive/10"
        >
          {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
          Supprimer la sortie
        </button>
      </div>
    </div>
  );
}
