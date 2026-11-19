import { useState, type FormEvent } from "react";
import { CalendarDays, Clock, Info, Link2, MapPin, Mountain, Route, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { SportIcon } from "@/components/SportIcon";
import { SPORT_INFO, type ActivitySport } from "@/lib/database";
import {
  LEVEL_INFO,
  todayBrussels,
  type PlannedRide,
  type RideInput,
  type RideLevel,
} from "@/lib/plannedRides";
import { cn } from "@/lib/utils";

/**
 * Formulaire « proposer une sortie » (création et modification), partagé par
 * le site (dans une fenêtre) et l'app (écran plein). `variant` ne change que la taille.
 */
export function PlannedRideForm({
  initial,
  submitting,
  onSubmit,
  onCancel,
  variant = "site",
}: {
  initial?: PlannedRide | null;
  submitting: boolean;
  onSubmit: (input: RideInput) => void;
  onCancel?: () => void;
  variant?: "site" | "app";
}) {
  const app = variant === "app";
  const [title, setTitle] = useState(initial?.title ?? "");
  const [sport, setSport] = useState<ActivitySport>(initial?.sport ?? "velo");
  const [date, setDate] = useState(initial?.ride_date ?? "");
  const [time, setTime] = useState(initial?.start_time?.slice(0, 5) ?? "10:00");
  const [place, setPlace] = useState(initial?.meeting_point ?? "");
  const [placeUrl, setPlaceUrl] = useState(initial?.meeting_url ?? "");
  const [km, setKm] = useState(initial?.distance_km ? String(initial.distance_km) : "");
  const [dplus, setDplus] = useState(initial?.elevation_m ? String(initial.elevation_m) : "");
  const [level, setLevel] = useState<RideLevel>(initial?.level ?? "tous");
  const [max, setMax] = useState(initial?.max_participants ? String(initial.max_participants) : "");
  const [notes, setNotes] = useState(initial?.notes ?? "");
  const [error, setError] = useState("");

  const today = todayBrussels();
  const field = app ? "h-12 rounded-2xl text-[16px]" : "h-10";
  const labelCls = cn("flex items-center gap-1.5 font-semibold", app ? "text-[14px]" : "text-sm");

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (title.trim().length < 3) return setError("Donne un nom à la sortie (3 caractères min.).");
    if (!date) return setError("Choisis une date.");
    if (!initial && date < today) return setError("La date est déjà passée.");
    if (!time) return setError("Choisis une heure de départ.");
    if (place.trim().length < 2) return setError("Indique le lieu de rendez-vous.");
    if (placeUrl.trim() && !/^https:\/\//i.test(placeUrl.trim()))
      return setError("Le lien du lieu doit commencer par https://");
    const kmNum = km ? Number(km.replace(",", ".")) : null;
    if (kmNum !== null && (!Number.isFinite(kmNum) || kmNum < 0.5 || kmNum > 400))
      return setError("La distance doit être entre 0,5 et 400 km.");
    const dNum = dplus ? Math.round(Number(dplus)) : null;
    if (dNum !== null && (!Number.isFinite(dNum) || dNum < 0 || dNum > 8000))
      return setError("Le D+ doit être entre 0 et 8 000 m.");
    const maxNum = max ? Math.round(Number(max)) : null;
    if (maxNum !== null && (!Number.isFinite(maxNum) || maxNum < 2 || maxNum > 100))
      return setError("Le nombre de places doit être entre 2 et 100.");
    onSubmit({
      title: title.trim(),
      sport,
      ride_date: date,
      start_time: time,
      meeting_point: place.trim(),
      meeting_url: placeUrl.trim() || null,
      distance_km: kmNum,
      elevation_m: dNum,
      level,
      notes: notes.trim() || null,
      max_participants: maxNum,
    });
  };

  const chip = (active: boolean) =>
    cn(
      "inline-flex items-center justify-center gap-1.5 rounded-full border font-semibold transition",
      app ? "h-11 px-4 text-[15px]" : "h-9 px-3 text-sm",
      active
        ? "border-primary bg-primary text-primary-foreground shadow-sm"
        : "border-border bg-card text-foreground hover:border-primary/50",
    );

  return (
    <form onSubmit={submit} className={cn("space-y-4", app && "space-y-5")} noValidate>
      <div className="space-y-1.5">
        <Label htmlFor="ride-title" className={labelCls}>
          Nom de la sortie
        </Label>
        <Input
          id="ride-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={80}
          placeholder="Ex. Boucle des trois ponts"
          className={field}
          required
        />
      </div>

      <fieldset className="space-y-1.5">
        <legend className={cn(labelCls, "mb-1.5")}>Type de sortie</legend>
        <div className="flex flex-wrap gap-2">
          {(["velo", "course", "marche"] as const).map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={sport === s}
              onClick={() => setSport(s)}
              className={chip(sport === s)}
            >
              <SportIcon sport={s} className="h-4 w-4" />
              {SPORT_INFO[s].short}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ride-date" className={labelCls}>
            <CalendarDays className="h-4 w-4 text-primary" /> Date
          </Label>
          <Input
            id="ride-date"
            type="date"
            min={initial ? undefined : today}
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className={field}
            required
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ride-time" className={labelCls}>
            <Clock className="h-4 w-4 text-primary" /> Départ
          </Label>
          <Input
            id="ride-time"
            type="time"
            step={300}
            value={time}
            onChange={(e) => setTime(e.target.value)}
            className={field}
            required
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ride-place" className={labelCls}>
          <MapPin className="h-4 w-4 text-primary" /> Lieu de rendez-vous
        </Label>
        <Input
          id="ride-place"
          value={place}
          onChange={(e) => setPlace(e.target.value)}
          maxLength={160}
          placeholder="Ex. Local scout, rue de la Station"
          className={field}
          required
        />
        <div className="relative">
          <Link2 className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            id="ride-place-url"
            aria-label="Lien Google Maps du lieu (facultatif)"
            value={placeUrl}
            onChange={(e) => setPlaceUrl(e.target.value)}
            placeholder="Lien Google Maps (facultatif)"
            inputMode="url"
            className={cn(field, "pl-9")}
          />
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ride-km" className={labelCls}>
            <Route className="h-4 w-4 text-primary" /> km
          </Label>
          <Input
            id="ride-km"
            inputMode="decimal"
            value={km}
            onChange={(e) => setKm(e.target.value)}
            placeholder="40"
            className={field}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ride-dplus" className={labelCls}>
            <Mountain className="h-4 w-4 text-primary" /> D+
          </Label>
          <Input
            id="ride-dplus"
            inputMode="numeric"
            value={dplus}
            onChange={(e) => setDplus(e.target.value)}
            placeholder="300"
            className={field}
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ride-max" className={labelCls}>
            <Users className="h-4 w-4 text-primary" /> Places
          </Label>
          <Input
            id="ride-max"
            inputMode="numeric"
            value={max}
            onChange={(e) => setMax(e.target.value)}
            placeholder="∞"
            className={field}
          />
        </div>
      </div>

      <fieldset className="space-y-1.5">
        <legend className={cn(labelCls, "mb-1.5")}>Niveau</legend>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(LEVEL_INFO) as RideLevel[]).map((l) => (
            <button
              key={l}
              type="button"
              aria-pressed={level === l}
              onClick={() => setLevel(l)}
              className={chip(level === l)}
              title={LEVEL_INFO[l].hint}
            >
              {LEVEL_INFO[l].label}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="space-y-1.5">
        <Label htmlFor="ride-notes" className={labelCls}>
          <Info className="h-4 w-4 text-primary" /> Infos utiles (facultatif)
        </Label>
        <Textarea
          id="ride-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          maxLength={600}
          rows={app ? 3 : 2}
          placeholder="Casque obligatoire, prévoir pique-nique, retour vers 16h…"
          className={app ? "rounded-2xl text-[16px]" : undefined}
        />
      </div>

      {error && (
        <p
          role="alert"
          className="rounded-xl bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive"
        >
          {error}
        </p>
      )}

      <div className={cn("flex gap-2", app ? "flex-col" : "justify-end")}>
        {onCancel && !app && (
          <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
            Annuler
          </Button>
        )}
        <Button
          type="submit"
          disabled={submitting}
          className={cn("font-bold", app && "h-14 rounded-2xl text-[17px]")}
        >
          {submitting
            ? "Enregistrement…"
            : initial
              ? "Enregistrer les changements"
              : "Proposer la sortie"}
        </Button>
      </div>
    </form>
  );
}
