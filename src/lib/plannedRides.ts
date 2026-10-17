import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import type { ActivitySport } from "@/lib/database";

// Client non typé : les nouvelles tables ne sont pas dans les types générés
const supabase = supabaseClient as unknown as SupabaseClient;

/**
 * « Sorties prévues » : propositions de sorties de groupe et réponses
 * (je viens / peut-être / je ne peux pas). Réservé aux membres connectés.
 */

export type RideLevel = "tous" | "tranquille" | "sportif";
export type RsvpStatus = "yes" | "maybe" | "no";

export const LEVEL_INFO: Record<RideLevel, { label: string; hint: string }> = {
  tous: { label: "Tous niveaux", hint: "On attend tout le monde" },
  tranquille: { label: "Balade tranquille", hint: "Rythme cool, pauses" },
  sportif: { label: "Sportif", hint: "Ça roule vite" },
};

export const RSVP_LABEL: Record<RsvpStatus, string> = {
  yes: "Je viens",
  maybe: "Peut-être",
  no: "Je ne peux pas",
};

export interface PlannedRide {
  id: string;
  created_by: string;
  title: string;
  sport: ActivitySport;
  ride_date: string;
  start_time: string;
  meeting_point: string;
  meeting_url: string | null;
  distance_km: number | null;
  elevation_m: number | null;
  level: RideLevel;
  notes: string | null;
  max_participants: number | null;
  cancelled: boolean;
  created_at: string;
}

export interface RideResponse {
  ride_id: string;
  user_id: string;
  status: RsvpStatus;
}

export interface Member {
  id: string;
  name: string;
  patrol: string | null;
}

export interface RideWithPeople extends PlannedRide {
  organizer: Member | null;
  going: Member[];
  maybe: Member[];
  notGoing: Member[];
  myStatus: RsvpStatus | null;
  isFull: boolean;
  isPast: boolean;
}

export type RideInput = Omit<PlannedRide, "id" | "created_by" | "created_at" | "cancelled">;

/** Date du jour à Bruxelles, au format AAAA-MM-JJ */
export function todayBrussels() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Brussels" }).format(new Date());
}

const memberName = (p: { totem: string | null; quali: string | null; full_name: string | null }) =>
  p.totem ? `${p.totem}${p.quali ? ` ${p.quali}` : ""}` : p.full_name || "Scout";

export function usePlannedRides(userId: string | undefined) {
  return useQuery<RideWithPeople[]>({
    queryKey: ["planned-rides", userId],
    enabled: !!userId,
    staleTime: 20_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const today = todayBrussels();
      // Sorties à venir + celles des 14 derniers jours
      const since = new Date(Date.now() - 14 * 864e5).toISOString().slice(0, 10);
      const [rides, responses, people] = await Promise.all([
        supabase
          .from("planned_rides")
          .select("*")
          .gte("ride_date", since)
          .order("ride_date", { ascending: true })
          .order("start_time", { ascending: true }),
        supabase.from("planned_ride_responses").select("ride_id, user_id, status"),
        supabase.from("profiles_public").select("id, full_name, totem, quali, patrols(name)"),
      ]);
      if (rides.error) throw rides.error;
      if (responses.error) throw responses.error;

      const members = new Map<string, Member>();
      for (const p of (people.data ?? []) as unknown as {
        id: string;
        full_name: string | null;
        totem: string | null;
        quali: string | null;
        patrols: { name: string } | null;
      }[]) {
        members.set(p.id, { id: p.id, name: memberName(p), patrol: p.patrols?.name ?? null });
      }
      const who = (id: string) => members.get(id) ?? { id, name: "Scout", patrol: null };

      const byRide = new Map<string, RideResponse[]>();
      for (const r of (responses.data ?? []) as RideResponse[]) {
        const list = byRide.get(r.ride_id) ?? [];
        list.push(r);
        byRide.set(r.ride_id, list);
      }

      return ((rides.data ?? []) as PlannedRide[]).map((ride) => {
        const list = byRide.get(ride.id) ?? [];
        const pick = (s: RsvpStatus) =>
          list
            .filter((r) => r.status === s)
            .map((r) => who(r.user_id))
            .sort((a, b) => a.name.localeCompare(b.name));
        const going = pick("yes");
        return {
          ...ride,
          distance_km: ride.distance_km === null ? null : Number(ride.distance_km),
          organizer: who(ride.created_by),
          going,
          maybe: pick("maybe"),
          notGoing: pick("no"),
          myStatus: list.find((r) => r.user_id === userId)?.status ?? null,
          isFull: ride.max_participants !== null && going.length >= ride.max_participants,
          isPast: ride.ride_date < today,
        };
      });
    },
  });
}

function errorMessage(e: unknown) {
  const msg = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? e);
  if (/déjà passée|annulée|complète|introuvable/.test(msg)) return msg;
  if (/check constraint|violates/i.test(msg)) return "Un des champs n'est pas valide.";
  return "Oups, ça n'a pas marché. Réessaie dans un instant.";
}

export function usePlannedRideActions(userId: string | undefined) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["planned-rides"] });

  const respond = useMutation({
    mutationFn: async ({ rideId, status }: { rideId: string; status: RsvpStatus | null }) => {
      if (!userId) throw new Error("Connexion requise");
      if (status === null) {
        const { error } = await supabase
          .from("planned_ride_responses")
          .delete()
          .eq("ride_id", rideId)
          .eq("user_id", userId);
        if (error) throw error;
        return;
      }
      const { error } = await supabase
        .from("planned_ride_responses")
        .upsert({ ride_id: rideId, user_id: userId, status }, { onConflict: "ride_id,user_id" });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const save = useMutation({
    mutationFn: async ({ id, input }: { id?: string | undefined; input: RideInput }) => {
      if (!userId) throw new Error("Connexion requise");
      const row = {
        ...input,
        title: input.title.trim(),
        meeting_point: input.meeting_point.trim(),
        meeting_url: input.meeting_url?.trim() || null,
        notes: input.notes?.trim() || null,
      };
      const { error } = id
        ? await supabase.from("planned_rides").update(row).eq("id", id)
        : await supabase.from("planned_rides").insert({ ...row, created_by: userId });
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const setCancelled = useMutation({
    mutationFn: async ({ id, cancelled }: { id: string; cancelled: boolean }) => {
      const { error } = await supabase.from("planned_rides").update({ cancelled }).eq("id", id);
      if (error) throw error;
    },
    onSettled: refresh,
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("planned_rides").delete().eq("id", id);
      if (error) throw error;
    },
    onSettled: refresh,
  });

  return { respond, save, setCancelled, remove, errorMessage };
}

// ---------- Affichage ----------

export function formatRideDate(date: string, style: "long" | "short" = "long") {
  const d = new Date(`${date}T12:00:00`);
  return d.toLocaleDateString("fr-BE", {
    weekday: style === "long" ? "long" : "short",
    day: "numeric",
    month: style === "long" ? "long" : "short",
  });
}

export const formatRideTime = (t: string) => t.slice(0, 5).replace(":", "h");

export function relativeDay(date: string) {
  const today = todayBrussels();
  const diff = Math.round(
    (Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 864e5,
  );
  if (diff === 0) return "Aujourd'hui";
  if (diff === 1) return "Demain";
  if (diff > 1 && diff < 7) return `Dans ${diff} jours`;
  return null;
}

/** Lien d'itinéraire : le lien fourni, sinon une recherche Google Maps du lieu */
export function meetingMapUrl(ride: Pick<PlannedRide, "meeting_point" | "meeting_url">) {
  return (
    ride.meeting_url ||
    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(ride.meeting_point)}`
  );
}

/** Fichier .ics pour ajouter la sortie à son agenda (durée estimée selon la distance) */
export function downloadIcs(ride: PlannedRide) {
  const [h, m] = ride.start_time.split(":").map(Number);
  const start = new Date(`${ride.ride_date}T00:00:00`);
  start.setHours(h ?? 9, m ?? 0, 0, 0);
  const minutes = ride.distance_km
    ? Math.max(60, Math.round((ride.distance_km / (ride.sport === "velo" ? 18 : 8)) * 60) + 30)
    : 120;
  const end = new Date(start.getTime() + minutes * 60_000);
  const fmt = (d: Date) =>
    d
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}/, "");
  const esc = (s: string) => s.replace(/[\\,;]/g, (c) => `\\${c}`).replace(/\n/g, "\\n");
  const desc = [
    ride.distance_km ? `${ride.distance_km} km` : null,
    ride.elevation_m ? `${ride.elevation_m} m D+` : null,
    LEVEL_INFO[ride.level].label,
    ride.notes,
  ]
    .filter(Boolean)
    .join(" · ");
  const ics = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//ALEZAN 42//Sorties prevues//FR",
    "BEGIN:VEVENT",
    `UID:${ride.id}@alezan42`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${esc(`ALEZAN 42 · ${ride.title}`)}`,
    `LOCATION:${esc(ride.meeting_point)}`,
    `DESCRIPTION:${esc(desc)}`,
    "END:VEVENT",
    "END:VCALENDAR",
  ].join("\r\n");
  const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = `sortie-${ride.ride_date}.ics`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
