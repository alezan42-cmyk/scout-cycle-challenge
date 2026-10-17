import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  Clock,
  HelpCircle,
  MapPin,
  Mountain,
  Navigation,
  Pencil,
  Plus,
  Route as RouteIcon,
  Shield,
  Trash2,
  Users,
  X,
  Ban,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
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
import { PlannedRideForm } from "@/components/PlannedRideForm";
import { SportBadge, SportIcon } from "@/components/SportIcon";
import { useAuth } from "@/lib/useAuth";
import { SPORT_INFO, type ActivitySport } from "@/lib/database";
import {
  downloadIcs,
  formatRideTime,
  LEVEL_INFO,
  meetingMapUrl,
  relativeDay,
  RSVP_LABEL,
  usePlannedRideActions,
  usePlannedRides,
  type Member,
  type RideWithPeople,
  type RsvpStatus,
} from "@/lib/plannedRides";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/sorties-prevues")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sorties prévues — ALEZAN 42" },
      {
        name: "description",
        content: "Propose une sortie de groupe et dis si tu viens : date, heure, rendez-vous.",
      },
    ],
  }),
  component: PlannedRidesPage,
});

type SportFilter = ActivitySport | "all";

function PlannedRidesPage() {
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = usePlannedRides(user?.id);
  const actions = usePlannedRideActions(user?.id);
  const [sport, setSport] = useState<SportFilter>("all");
  const [mine, setMine] = useState(false);
  const [editing, setEditing] = useState<RideWithPeople | "new" | null>(null);
  const [toDelete, setToDelete] = useState<RideWithPeople | null>(null);
  const [showPast, setShowPast] = useState(false);

  const filtered = useMemo(
    () =>
      (data ?? []).filter(
        (r) =>
          (sport === "all" || r.sport === sport) &&
          (!mine || r.created_by === user?.id || r.myStatus === "yes" || r.myStatus === "maybe"),
      ),
    [data, sport, mine, user?.id],
  );
  const upcoming = filtered.filter((r) => !r.isPast);
  const past = filtered.filter((r) => r.isPast).reverse();
  const myNext = (data ?? []).find((r) => !r.isPast && !r.cancelled && r.myStatus === "yes");

  const respond = (ride: RideWithPeople, status: RsvpStatus) => {
    const next = ride.myStatus === status ? null : status;
    actions.respond.mutate(
      { rideId: ride.id, status: next },
      {
        onSuccess: () =>
          toast.success(
            next === "yes"
              ? "C'est noté, à bientôt sur la route ! 🚴"
              : next === "maybe"
                ? "Noté comme « peut-être »."
                : next === "no"
                  ? "Noté, ce sera pour une prochaine fois."
                  : "Réponse retirée.",
          ),
        onError: (e) => toast.error(actions.errorMessage(e)),
      },
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-8 md:py-12">
        {/* En-tête */}
        <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Shield className="h-3.5 w-3.5" />
              <span>Visible uniquement par les membres connectés</span>
            </div>
            <h1 className="mt-2 font-display text-3xl font-black text-foreground md:text-4xl">
              Sorties prévues
            </h1>
            <p className="mt-1 max-w-xl text-sm text-muted-foreground">
              Propose une sortie à la troupe, ou rejoins celle d'un autre : date, heure, lieu de
              rendez-vous… et dis si tu viens !
            </p>
          </div>
          <Button size="lg" className="font-bold shadow-md" onClick={() => setEditing("new")}>
            <Plus className="mr-1.5 h-5 w-5" />
            Proposer une sortie
          </Button>
        </div>

        {/* Ma prochaine sortie */}
        {myNext && (
          <div className="flex flex-col gap-3 rounded-2xl border border-primary/30 bg-primary/10 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <CalendarClock className="h-5 w-5" />
              </span>
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-primary">
                  Ta prochaine sortie
                </p>
                <p className="font-display text-lg font-black leading-tight text-foreground">
                  {myNext.title}
                </p>
                <p className="text-sm text-muted-foreground">
                  {relativeDay(myNext.ride_date) ?? longDate(myNext.ride_date)} à{" "}
                  {formatRideTime(myNext.start_time)} · {myNext.meeting_point}
                </p>
              </div>
            </div>
            <Button variant="outline" onClick={() => downloadIcs(myNext)} className="shrink-0">
              <CalendarPlus className="mr-1.5 h-4 w-4" />
              Ajouter à mon agenda
            </Button>
          </div>
        )}

        {/* Filtres */}
        <div className="flex flex-wrap items-center gap-2">
          {(["all", "velo", "course", "marche"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sport === s}
              onClick={() => setSport(s)}
              className={cn(
                "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition",
                sport === s
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-foreground hover:border-primary/50",
              )}
            >
              {s !== "all" && <SportIcon sport={s} className="h-4 w-4" />}
              {s === "all" ? "Toutes" : SPORT_INFO[s].short}
            </button>
          ))}
          <span className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <button
            type="button"
            aria-pressed={mine}
            onClick={() => setMine((v) => !v)}
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-semibold transition",
              mine
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-foreground hover:border-primary/50",
            )}
          >
            <Check className="h-4 w-4" />
            Mes sorties
          </button>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className="grid gap-4 md:grid-cols-2">
            {[0, 1].map((i) => (
              <div key={i} className="h-64 animate-pulse rounded-2xl border bg-card" />
            ))}
          </div>
        ) : upcoming.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-border bg-card p-10 text-center">
            <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-primary/10 text-primary">
              <CalendarClock className="h-7 w-7" />
            </div>
            <h2 className="mt-3 font-display text-xl font-black text-foreground">
              Aucune sortie prévue pour l'instant
            </h2>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">
              Lance la première ! Choisis une date, un lieu de rendez-vous, et la troupe pourra
              s'inscrire.
            </p>
            <Button className="mt-4 font-bold" onClick={() => setEditing("new")}>
              <Plus className="mr-1.5 h-4 w-4" />
              Proposer une sortie
            </Button>
          </div>
        ) : (
          <div className="grid items-start gap-4 md:grid-cols-2">
            {upcoming.map((ride) => (
              <RideCard
                key={ride.id}
                ride={ride}
                canManage={ride.created_by === user?.id || isAdmin}
                busy={actions.respond.isPending}
                onRespond={(s) => respond(ride, s)}
                onEdit={() => setEditing(ride)}
                onToggleCancel={() =>
                  actions.setCancelled.mutate(
                    { id: ride.id, cancelled: !ride.cancelled },
                    {
                      onSuccess: () =>
                        toast.success(ride.cancelled ? "Sortie réactivée" : "Sortie annulée"),
                      onError: (e) => toast.error(actions.errorMessage(e)),
                    },
                  )
                }
                onDelete={() => setToDelete(ride)}
              />
            ))}
          </div>
        )}

        {past.length > 0 && (
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowPast((v) => !v)}
              className="text-sm font-semibold text-muted-foreground hover:text-foreground"
              aria-expanded={showPast}
            >
              {showPast ? "Masquer" : "Voir"} les sorties des 2 dernières semaines ({past.length})
            </button>
            {showPast && (
              <div className="mt-3 grid items-start gap-4 opacity-80 md:grid-cols-2">
                {past.map((ride) => (
                  <RideCard
                    key={ride.id}
                    ride={ride}
                    canManage={ride.created_by === user?.id || isAdmin}
                    busy
                    onRespond={() => undefined}
                    onEdit={() => undefined}
                    onToggleCancel={() => undefined}
                    onDelete={() => setToDelete(ride)}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </main>

      {/* Proposer / modifier */}
      <Dialog open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="font-display text-xl font-black">
              {editing === "new" ? "Proposer une sortie" : "Modifier la sortie"}
            </DialogTitle>
            <DialogDescription>
              Visible uniquement par les membres de la troupe. Tu seras inscrit d'office.
            </DialogDescription>
          </DialogHeader>
          {editing !== null && (
            <PlannedRideForm
              initial={editing === "new" ? null : editing}
              submitting={actions.save.isPending}
              onCancel={() => setEditing(null)}
              onSubmit={(input) =>
                actions.save.mutate(
                  { id: editing === "new" ? undefined : editing.id, input },
                  {
                    onSuccess: () => {
                      toast.success(
                        editing === "new" ? "Sortie proposée à la troupe ! 🎉" : "Sortie modifiée",
                      );
                      setEditing(null);
                    },
                    onError: (e) => toast.error(actions.errorMessage(e)),
                  },
                )
              }
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={toDelete !== null} onOpenChange={(o) => !o && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer « {toDelete?.title} » ?</AlertDialogTitle>
            <AlertDialogDescription>
              La sortie et toutes les réponses seront effacées. Pour prévenir les participants,
              préfère « Annuler la sortie ».
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Garder</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() =>
                toDelete &&
                actions.remove.mutate(toDelete.id, {
                  onSuccess: () => toast.success("Sortie supprimée"),
                  onError: (e) => toast.error(actions.errorMessage(e)),
                })
              }
            >
              Supprimer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

const longDate = (d: string) =>
  new Date(`${d}T12:00:00`).toLocaleDateString("fr-BE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

function initials(name: string) {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

function People({ people, label }: { people: Member[]; label: string }) {
  if (people.length === 0) return null;
  return (
    <div className="space-y-1.5">
      <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label} ({people.length})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {people.map((p) => (
          <span
            key={p.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/50 py-0.5 pl-0.5 pr-2.5 text-xs font-semibold text-foreground"
            title={p.patrol ?? undefined}
          >
            <span className="grid h-5 w-5 place-items-center rounded-full bg-primary/15 text-[9px] font-black text-primary">
              {initials(p.name)}
            </span>
            {p.name}
          </span>
        ))}
      </div>
    </div>
  );
}

function RideCard({
  ride,
  canManage,
  busy,
  onRespond,
  onEdit,
  onToggleCancel,
  onDelete,
}: {
  ride: RideWithPeople;
  canManage: boolean;
  busy: boolean;
  onRespond: (s: RsvpStatus) => void;
  onEdit: () => void;
  onToggleCancel: () => void;
  onDelete: () => void;
}) {
  const d = new Date(`${ride.ride_date}T12:00:00`);
  const rel = relativeDay(ride.ride_date);
  const open = !ride.isPast && !ride.cancelled;
  const placesLeft =
    ride.max_participants !== null ? Math.max(0, ride.max_participants - ride.going.length) : null;

  return (
    <article
      className={cn(
        "overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm transition hover:shadow-md",
        ride.cancelled && "opacity-70",
        ride.myStatus === "yes" && open && "border-primary/40 ring-1 ring-primary/20",
      )}
    >
      <div className="flex gap-4 p-4 sm:p-5">
        {/* Date */}
        <div className="flex w-16 shrink-0 flex-col items-center rounded-xl border border-primary/20 bg-primary/10 py-2 text-center">
          <span className="text-[10px] font-bold uppercase tracking-wide text-primary">
            {d.toLocaleDateString("fr-BE", { weekday: "short" })}
          </span>
          <span className="font-display text-3xl font-black leading-none text-foreground">
            {d.getDate()}
          </span>
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
            {d.toLocaleDateString("fr-BE", { month: "short" })}
          </span>
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <SportBadge sport={ride.sport} />
            <Badge variant="outline" className="text-[10px] font-semibold">
              {LEVEL_INFO[ride.level].label}
            </Badge>
            {rel && open && (
              <Badge className="bg-amber-500/15 text-[10px] font-bold text-amber-800 hover:bg-amber-500/15 dark:text-amber-300">
                {rel}
              </Badge>
            )}
            {ride.cancelled && (
              <Badge variant="destructive" className="text-[10px] font-bold">
                Annulée
              </Badge>
            )}
            {ride.isFull && open && (
              <Badge variant="secondary" className="text-[10px] font-bold">
                Complet
              </Badge>
            )}
          </div>
          <h2 className="font-display text-xl font-black leading-tight text-foreground">
            {ride.title}
          </h2>
          <ul className="space-y-1 text-sm text-foreground/85">
            <li className="flex items-center gap-2">
              <Clock className="h-4 w-4 shrink-0 text-primary" />
              <span>
                Départ à <strong>{formatRideTime(ride.start_time)}</strong>
              </span>
            </li>
            <li className="flex items-start gap-2">
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
              <span className="min-w-0">
                {ride.meeting_point}{" "}
                <a
                  href={meetingMapUrl(ride)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-0.5 whitespace-nowrap font-semibold text-primary hover:underline"
                >
                  <Navigation className="h-3 w-3" /> Itinéraire
                </a>
              </span>
            </li>
            {(ride.distance_km || ride.elevation_m) && (
              <li className="flex items-center gap-3">
                {ride.distance_km && (
                  <span className="flex items-center gap-1.5">
                    <RouteIcon className="h-4 w-4 text-primary" />
                    {ride.distance_km.toLocaleString("fr-BE")} km
                  </span>
                )}
                {ride.elevation_m ? (
                  <span className="flex items-center gap-1.5">
                    <Mountain className="h-4 w-4 text-primary" />
                    {ride.elevation_m} m D+
                  </span>
                ) : null}
              </li>
            )}
            <li className="flex items-center gap-2 text-muted-foreground">
              <Users className="h-4 w-4 shrink-0" />
              <span>
                Proposée par <strong className="text-foreground">{ride.organizer?.name}</strong>
                {placesLeft !== null && placesLeft > 0 && open && (
                  <>
                    {" "}
                    · {placesLeft} place{placesLeft > 1 ? "s" : ""} restante
                    {placesLeft > 1 ? "s" : ""}
                  </>
                )}
              </span>
            </li>
          </ul>
          {ride.notes && (
            <p className="whitespace-pre-line rounded-xl bg-muted/50 px-3 py-2 text-sm text-foreground/80">
              {ride.notes}
            </p>
          )}
        </div>
      </div>

      <div className="space-y-3 border-t border-border/60 bg-muted/20 px-4 py-3 sm:px-5">
        <People people={ride.going} label="Ils viennent" />
        <People people={ride.maybe} label="Peut-être" />
        {ride.going.length === 0 && ride.maybe.length === 0 && (
          <p className="text-xs text-muted-foreground">Personne n'a encore répondu.</p>
        )}

        {open && (
          <div className="grid grid-cols-3 gap-2" role="group" aria-label="Ma réponse">
            {(
              [
                ["yes", Check, "border-emerald-600 bg-emerald-600 text-white"],
                ["maybe", HelpCircle, "border-amber-500 bg-amber-500 text-white"],
                ["no", X, "border-slate-500 bg-slate-500 text-white"],
              ] as const
            ).map(([s, Icon, activeCls]) => {
              const active = ride.myStatus === s;
              const disabled = busy || (s === "yes" && ride.isFull && !active);
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={active}
                  disabled={disabled}
                  onClick={() => onRespond(s)}
                  className={cn(
                    "inline-flex h-10 items-center justify-center gap-1.5 rounded-xl border text-sm font-bold transition disabled:opacity-50",
                    active ? activeCls : "border-border bg-card text-foreground hover:bg-muted",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {RSVP_LABEL[s]}
                </button>
              );
            })}
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          {open ? (
            <button
              type="button"
              onClick={() => downloadIcs(ride)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground"
            >
              <CalendarPlus className="h-3.5 w-3.5" />
              Ajouter à mon agenda
            </button>
          ) : (
            <span />
          )}
          {canManage && (
            <div className="flex items-center gap-1">
              {!ride.isPast && (
                <>
                  <Button size="sm" variant="ghost" onClick={onEdit} className="h-8 px-2 text-xs">
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    Modifier
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={onToggleCancel}
                    className="h-8 px-2 text-xs"
                  >
                    {ride.cancelled ? (
                      <RotateCcw className="mr-1 h-3.5 w-3.5" />
                    ) : (
                      <Ban className="mr-1 h-3.5 w-3.5" />
                    )}
                    {ride.cancelled ? "Réactiver" : "Annuler"}
                  </Button>
                </>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={onDelete}
                aria-label="Supprimer la sortie"
                className="h-8 px-2 text-xs text-destructive hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}
