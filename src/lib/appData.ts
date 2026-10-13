import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseClient } from "@/integrations/supabase/client";

// Client non typé : les vues publiques ne sont pas toutes dans les types générés
const supabase = supabaseClient as unknown as SupabaseClient;
import { getActivitySport, type ActivitySport } from "@/lib/database";
import { isStaffPatrol, isTroopStaffPatrol, TROOP_STAFF_PATROL_NAME } from "@/lib/categories";
import { monthRange, weekRange } from "@/lib/useAuth";

/**
 * Données de la troupe pour l'app installée : une seule lecture des vues
 * publiques (mêmes règles que le classement du site), puis tout est calculé ici.
 */

export type AppPeriod = "week" | "month" | "all";
export type AppSport = ActivitySport | "all";

export const PERIOD_LABEL: Record<AppPeriod, string> = {
  week: "Cette semaine",
  month: "Ce mois",
  all: "Depuis le début",
};

type PublicProfile = {
  id: string;
  full_name: string | null;
  totem: string | null;
  quali: string | null;
  patrol_id: string | null;
  is_admin: boolean | null;
  patrols: { id: string; name: string; category: string } | null;
};
type PublicActivity = {
  user_id: string;
  km: number;
  elevation_m: number | null;
  ride_date: string;
  status: string;
  note: string | null;
};
type Patrol = { id: string; name: string; category: string };

export interface TroopData {
  profiles: PublicProfile[];
  activities: PublicActivity[];
  patrols: Patrol[];
}

export interface ScoutRow {
  user_id: string;
  name: string;
  patrol_id: string | null;
  patrol_name: string;
  is_staff: boolean;
  km: number;
  rides: number;
}

export interface PatrolRow {
  id: string;
  name: string;
  is_staff: boolean;
  km: number;
  members: number;
}

export function useTroopData() {
  return useQuery<TroopData>({
    queryKey: ["app-troop-data"],
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    queryFn: async () => {
      const [p, a, pt] = await Promise.all([
        supabase
          .from("profiles_public")
          .select("id, full_name, totem, quali, patrol_id, is_admin, patrols(id, name, category)"),
        supabase
          .from("activities_public")
          .select("user_id, km, elevation_m, ride_date, status, note"),
        supabase.from("patrols").select("id, name, category").order("name"),
      ]);
      if (p.error) throw p.error;
      if (a.error) throw a.error;
      return {
        profiles: (p.data ?? []) as unknown as PublicProfile[],
        activities: (a.data ?? []) as unknown as PublicActivity[],
        patrols: (pt.data ?? []) as unknown as Patrol[],
      };
    },
  });
}

export function periodRange(period: AppPeriod) {
  return period === "week" ? weekRange(0) : period === "month" ? monthRange(0) : null;
}

function inScope(a: PublicActivity, period: AppPeriod, sport: AppSport) {
  if (a.status !== "approved") return false;
  const r = periodRange(period);
  if (r && (a.ride_date < r.from || a.ride_date > r.to)) return false;
  return sport === "all" || getActivitySport(a) === sport;
}

const displayName = (p: PublicProfile) =>
  p.totem ? `${p.totem}${p.quali ? ` ${p.quali}` : ""}` : p.full_name || "Scout";

export function rankScouts(data: TroopData | undefined, period: AppPeriod, sport: AppSport) {
  if (!data) return [] as ScoutRow[];
  const totals = new Map<string, { km: number; rides: number }>();
  for (const a of data.activities) {
    if (!inScope(a, period, sport)) continue;
    const t = totals.get(a.user_id) ?? { km: 0, rides: 0 };
    t.km += Number(a.km || 0);
    t.rides += 1;
    totals.set(a.user_id, t);
  }
  return data.profiles
    .map((p) => {
      const staff = isStaffPatrol(p.patrols) || (!p.patrols && !!p.is_admin);
      const t = totals.get(p.id) ?? { km: 0, rides: 0 };
      return {
        user_id: p.id,
        name: displayName(p),
        patrol_id: p.patrol_id,
        patrol_name: p.patrols?.name || (staff ? TROOP_STAFF_PATROL_NAME : "Sans patrouille"),
        is_staff: staff,
        km: Math.round(t.km * 10) / 10,
        rides: t.rides,
      };
    })
    .sort((a, b) => b.km - a.km || a.name.localeCompare(b.name));
}

export function rankPatrols(data: TroopData | undefined, period: AppPeriod, sport: AppSport) {
  if (!data) return [] as PatrolRow[];
  const scouts = rankScouts(data, period, sport);
  const list = data.patrols.some((p) => isStaffPatrol(p))
    ? data.patrols
    : [...data.patrols, { id: "staff", name: TROOP_STAFF_PATROL_NAME, category: "staff" }];
  return list
    .map((p) => {
      const staff = isStaffPatrol(p);
      const main = staff && (isTroopStaffPatrol(p) || p.id === "staff");
      const members = scouts.filter(
        (s) => s.patrol_id === p.id || (main && s.is_staff && !s.patrol_id),
      );
      return {
        id: p.id,
        name: p.name,
        is_staff: staff,
        km: Math.round(members.reduce((sum, s) => sum + s.km, 0) * 10) / 10,
        members: members.length,
      };
    })
    .sort((a, b) => b.km - a.km || a.name.localeCompare(b.name));
}

/** Rang (1, 2, …) en ne comptant que les lignes qui ont des km ; null si 0 km. */
export function rankOf<T extends { km: number }>(rows: T[], match: (row: T) => boolean) {
  const ranked = rows.filter((r) => r.km > 0);
  const i = ranked.findIndex(match);
  return i < 0 ? null : i + 1;
}

const nf = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 });
export const formatKm = (km: number) => nf.format(km);

export interface MyActivity {
  id: string;
  km: number;
  ride_date: string;
  status: "approved" | "pending" | "rejected";
  note: string | null;
  elevation_m: number | null;
  strava_link: string | null;
  proof_path: string | null;
  group_ride_id: string | null;
  created_at: string;
}

/** Les sorties du membre connecté (toutes, y compris en attente). */
export function useMyActivities(userId: string | undefined) {
  return useQuery<MyActivity[]>({
    queryKey: ["app-my-activities", userId],
    enabled: !!userId,
    staleTime: 15_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("activities")
        .select(
          "id, km, ride_date, status, note, elevation_m, strava_link, proof_path, group_ride_id, created_at",
        )
        .eq("user_id", userId!)
        .order("ride_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as MyActivity[];
    },
  });
}

export interface NextEvent {
  id: string;
  title: string;
  subtitle: string | null;
  target_date: string;
}

/** Prochain compte à rebours actif (à venir). */
export function useNextEvent() {
  return useQuery<NextEvent | null>({
    queryKey: ["app-next-event"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data } = await supabase
        .from("countdowns")
        .select("id, title, subtitle, target_date, is_active")
        .eq("is_active", true)
        .gte("target_date", new Date().toISOString())
        .order("target_date", { ascending: true })
        .limit(1);
      return ((data ?? [])[0] as unknown as NextEvent | undefined) ?? null;
    },
  });
}

export function daysUntil(iso: string) {
  return Math.max(0, Math.ceil((Date.parse(iso) - Date.now()) / 864e5));
}
