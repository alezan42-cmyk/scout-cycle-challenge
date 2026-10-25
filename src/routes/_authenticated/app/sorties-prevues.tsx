import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import {
  CalendarClock,
  CalendarPlus,
  Check,
  ChevronDown,
  HelpCircle,
  MapPin,
  Mountain,
  Navigation,
  Pencil,
  Plus,
  Route as RouteIcon,
  Trash2,
  X,
  Ban,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { AppPageShell } from "@/components/AppPageShell";
import { AppCard, AppEmpty, Segmented } from "@/components/app/AppUi";
import { PlannedRideForm } from "@/components/PlannedRideForm";
import { WhatsAppGroupCard } from "@/components/WhatsAppGroupCard";
import { SportIcon, SPORT_COLORS } from "@/components/SportIcon";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useAuth } from "@/lib/useAuth";
import { SPORT_INFO } from "@/lib/database";
import {
  downloadIcs,
  formatRideTime,
  LEVEL_INFO,
  meetingMapUrl,
  relativeDay,
  RSVP_LABEL,
  usePlannedRideActions,
  usePlannedRides,
  type RideWithPeople,
  type RsvpStatus,
} from "@/lib/plannedRides";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/app/sorties-prevues")({
  ssr: false,
  component: PlannedRidesScreen,
});

function PlannedRidesScreen() {
  const { user, isAdmin } = useAuth();
  const { data, isLoading } = usePlannedRides(user?.id);
  const actions = usePlannedRideActions(user?.id);
  const [tab, setTab] = useState<"all" | "mine">("all");
  const [editing, setEditing] = useState<RideWithPeople | "new" | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);

  const rides = useMemo(
    () =>
      (data ?? []).filter(
        (r) =>
          !r.isPast &&
          (tab === "all" ||
            r.created_by === user?.id ||
            r.myStatus === "yes" ||
            r.myStatus === "maybe"),
      ),
    [data, tab, user?.id],
  );

  const respond = (ride: RideWithPeople, status: RsvpStatus) => {
    const next = ride.myStatus === status ? null : status;
    actions.respond.mutate(
      { rideId: ride.id, status: next },
      {
        onSuccess: () => next === "yes" && toast.success("C'est noté, à bientôt sur la route ! 🚴"),
        onError: (e) => toast.error(actions.errorMessage(e)),
      },
    );
  };

  return (
    <AppPageShell
      title="Sorties prévues"
      description="Propose une sortie ou rejoins la troupe"
      action={
        <button
          type="button"
          onClick={() => setEditing("new")}
          aria-label="Proposer une sortie"
          className="grid h-11 w-11 place-items-center rounded-full bg-primary text-primary-foreground shadow-md active:scale-95"
        >
          <Plus className="h-6 w-6" strokeWidth={2.6} />
        </button>
      }
    >
      <WhatsAppGroupCard userId={user?.id} isAdmin={isAdmin} variant="app" />

      <Segmented
        value={tab}
        onChange={setTab}
        options={[
          { value: "all", label: "À venir" },
          { value: "mine", label: "Mes sorties" },
        ]}
      />

      {isLoading ? (
        <AppEmpty title="Chargement des sorties…" />
      ) : rides.length === 0 ? (
        <div className="space-y-4">
          <AppEmpty
            icon={CalendarClock}
            title={tab === "mine" ? "Tu n'es inscrit à aucune sortie" : "Aucune sortie prévue"}
            text="Lance la première : choisis une date et un lieu de rendez-vous !"
          />
          <button
            type="button"
            onClick={() => setEditing("new")}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-primary text-[17px] font-bold text-primary-foreground shadow-sm active:scale-[0.99]"
          >
            <Plus className="h-5 w-5" /> Proposer une sortie
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {rides.map((ride) => (
            <RideItem
              key={ride.id}
              ride={ride}
              expanded={openId === ride.id}
              onToggle={() => setOpenId((id) => (id === ride.id ? null : ride.id))}
              canManage={ride.created_by === user?.id || isAdmin}
              busy={actions.respond.isPending}
              onRespond={(s) => respond(ride, s)}
              onEdit={() => setEditing(ride)}
              onToggleCancel={() =>
                actions.setCancelled.mutate(
                  { id: ride.id, cancelled: !ride.cancelled },
                  { onError: (e) => toast.error(actions.errorMessage(e)) },
                )
              }
              onDelete={() => {
                if (window.confirm(`Supprimer « ${ride.title} » et toutes les réponses ?`))
                  actions.remove.mutate(ride.id, {
                    onSuccess: () => toast.success("Sortie supprimée"),
                    onError: (e) => toast.error(actions.errorMessage(e)),
                  });
              }}
            />
          ))}
        </div>
      )}

      <Sheet open={editing !== null} onOpenChange={(o) => !o && setEditing(null)}>
        <SheetContent
          side="bottom"
          className="max-h-[92dvh] overflow-y-auto rounded-t-3xl px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-6"
        >
          <SheetHeader className="mb-4 text-left">
            <SheetTitle className="font-display text-[22px] font-black">
              {editing === "new" ? "Proposer une sortie" : "Modifier la sortie"}
            </SheetTitle>
          </SheetHeader>
          {editing !== null && (
            <PlannedRideForm
              variant="app"
              initial={editing === "new" ? null : editing}
              submitting={actions.save.isPending}
              onSubmit={(input) =>
                actions.save.mutate(
                  { id: editing === "new" ? undefined : editing.id, input },
                  {
                    onSuccess: () => {
                      toast.success(editing === "new" ? "Sortie proposée ! 🎉" : "Sortie modifiée");
                      setEditing(null);
                    },
                    onError: (e) => toast.error(actions.errorMessage(e)),
                  },
                )
              }
            />
          )}
        </SheetContent>
      </Sheet>
    </AppPageShell>
  );
}

function RideItem({
  ride,
  expanded,
  onToggle,
  canManage,
  busy,
  onRespond,
  onEdit,
  onToggleCancel,
  onDelete,
}: {
  ride: RideWithPeople;
  expanded: boolean;
  onToggle: () => void;
  canManage: boolean;
  busy: boolean;
  onRespond: (s: RsvpStatus) => void;
  onEdit: () => void;
  onToggleCancel: () => void;
  onDelete: () => void;
}) {
  const d = new Date(`${ride.ride_date}T12:00:00`);
  const rel = relativeDay(ride.ride_date);
  const open = !ride.cancelled;
  const going = ride.going;

  return (
    <AppCard className={cn("overflow-hidden", ride.cancelled && "opacity-70")}>
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3.5 p-4 text-left active:bg-muted/50"
      >
        <span className="flex w-14 shrink-0 flex-col items-center rounded-2xl bg-primary/10 py-1.5">
          <span className="text-[11px] font-bold uppercase text-primary">
            {d.toLocaleDateString("fr-BE", { weekday: "short" })}
          </span>
          <span className="font-display text-[26px] font-black leading-none text-foreground">
            {d.getDate()}
          </span>
          <span className="text-[11px] font-semibold uppercase text-muted-foreground">
            {d.toLocaleDateString("fr-BE", { month: "short" })}
          </span>
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-muted-foreground">
            <SportIcon
              sport={ride.sport}
              className={cn("h-4 w-4", SPORT_COLORS[ride.sport].text)}
            />
            {SPORT_INFO[ride.sport].short}
            {ride.cancelled ? (
              <span className="font-bold text-destructive">· Annulée</span>
            ) : rel ? (
              <span className="font-bold text-primary">· {rel}</span>
            ) : null}
          </span>
          <span className="mt-0.5 block text-[18px] font-bold leading-snug text-foreground">
            {ride.title}
          </span>
          <span className="mt-0.5 block truncate text-[14px] text-muted-foreground">
            {formatRideTime(ride.start_time)} · {ride.meeting_point}
          </span>
          <span className="mt-1.5 flex items-center gap-2 text-[13px] text-muted-foreground">
            <span className="flex -space-x-1.5">
              {going.slice(0, 4).map((p) => (
                <span
                  key={p.id}
                  className="grid h-6 w-6 place-items-center rounded-full border-2 border-card bg-primary/15 text-[9px] font-black text-primary"
                >
                  {p.name.slice(0, 2).toUpperCase()}
                </span>
              ))}
            </span>
            <span>
              <strong className="text-foreground">{going.length}</strong>{" "}
              {going.length > 1 ? "inscrits" : "inscrit"}
              {ride.max_participants ? ` / ${ride.max_participants}` : ""}
              {ride.maybe.length > 0 && ` · ${ride.maybe.length} peut-être`}
            </span>
          </span>
        </span>
        <ChevronDown
          className={cn(
            "mt-1 h-5 w-5 shrink-0 text-muted-foreground/60 transition-transform",
            expanded && "rotate-180",
          )}
        />
      </button>

      {expanded && (
        <div className="space-y-3 border-t border-border/60 px-4 py-3.5 text-[15px]">
          <a
            href={meetingMapUrl(ride)}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 rounded-2xl bg-muted/60 px-3.5 py-3 active:bg-muted"
          >
            <MapPin className="h-5 w-5 shrink-0 text-primary" />
            <span className="min-w-0 flex-1">
              <span className="block text-[12px] text-muted-foreground">Rendez-vous</span>
              <span className="block font-semibold text-foreground">{ride.meeting_point}</span>
            </span>
            <Navigation className="h-4 w-4 shrink-0 text-primary" />
          </a>
          <div className="flex flex-wrap gap-2 text-[14px]">
            <span className="rounded-full bg-muted/60 px-3 py-1 font-semibold">
              {LEVEL_INFO[ride.level].label}
            </span>
            {ride.distance_km && (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-3 py-1 font-semibold">
                <RouteIcon className="h-3.5 w-3.5" /> {ride.distance_km.toLocaleString("fr-BE")} km
              </span>
            )}
            {ride.elevation_m ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-3 py-1 font-semibold">
                <Mountain className="h-3.5 w-3.5" /> {ride.elevation_m} m
              </span>
            ) : null}
          </div>
          {ride.notes && (
            <p className="whitespace-pre-line text-[15px] leading-relaxed text-foreground/85">
              {ride.notes}
            </p>
          )}
          <p className="text-[13px] text-muted-foreground">
            Proposée par <strong className="text-foreground">{ride.organizer?.name}</strong>
          </p>
          {going.length > 0 && (
            <p className="text-[14px] text-foreground/85">
              <strong>Ils viennent :</strong> {going.map((p) => p.name).join(", ")}
            </p>
          )}
          {ride.maybe.length > 0 && (
            <p className="text-[14px] text-foreground/85">
              <strong>Peut-être :</strong> {ride.maybe.map((p) => p.name).join(", ")}
            </p>
          )}
          <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1 text-[14px] font-semibold">
            {open && (
              <button
                type="button"
                onClick={() => downloadIcs(ride)}
                className="inline-flex items-center gap-1.5 text-primary"
              >
                <CalendarPlus className="h-4 w-4" /> Agenda
              </button>
            )}
            {canManage && (
              <>
                <button type="button" onClick={onEdit} className="inline-flex items-center gap-1.5">
                  <Pencil className="h-4 w-4" /> Modifier
                </button>
                <button
                  type="button"
                  onClick={onToggleCancel}
                  className="inline-flex items-center gap-1.5"
                >
                  {ride.cancelled ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
                  {ride.cancelled ? "Réactiver" : "Annuler"}
                </button>
                <button
                  type="button"
                  onClick={onDelete}
                  className="inline-flex items-center gap-1.5 text-destructive"
                >
                  <Trash2 className="h-4 w-4" /> Supprimer
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {open && (
        <div
          className="grid grid-cols-3 gap-2 border-t border-border/60 p-3"
          role="group"
          aria-label="Ma réponse"
        >
          {(
            [
              ["yes", Check, "bg-emerald-600 text-white"],
              ["maybe", HelpCircle, "bg-amber-500 text-white"],
              ["no", X, "bg-slate-500 text-white"],
            ] as const
          ).map(([s, Icon, activeCls]) => {
            const active = ride.myStatus === s;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={active}
                disabled={busy || (s === "yes" && ride.isFull && !active)}
                onClick={() => onRespond(s)}
                className={cn(
                  "flex h-12 flex-col items-center justify-center rounded-2xl text-[13px] font-bold transition active:scale-95 disabled:opacity-50",
                  active ? activeCls : "bg-muted/70 text-foreground",
                )}
              >
                <Icon className="h-4 w-4" />
                {s === "no" ? "Pas dispo" : RSVP_LABEL[s]}
              </button>
            );
          })}
        </div>
      )}
    </AppCard>
  );
}
