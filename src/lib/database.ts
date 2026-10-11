// Standalone Autonomous Database for ALEZAN 42
// 100% independent of Lovable and external cloud dependencies.
// Persists in localStorage with high-fidelity seed data and real-time subscriber events.

import { TROOP_STAFF_PATROL_NAME } from "@/lib/categories";

export type PatrolCategory = "homme" | "femme" | "staff";

export interface Patrol {
  id: string;
  name: string;
  category: PatrolCategory;
  emoji?: string | null;
  created_at: string;
}

const PATROL_EMOJI_STORAGE_KEY = "alezan_patrol_emojis";

export function getCustomPatrolEmojis(): Record<string, string> {
  try {
    const raw = localStorage.getItem(PATROL_EMOJI_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function setCustomPatrolEmoji(patrolIdOrName: string, emoji: string) {
  try {
    const map = getCustomPatrolEmojis();
    map[patrolIdOrName.toLowerCase().trim()] = emoji.trim();
    localStorage.setItem(PATROL_EMOJI_STORAGE_KEY, JSON.stringify(map));
  } catch {
    // Ignore error
  }
}

export function getPatrolEmblem(patrolName?: string | null, patrolId?: string | null): string {
  if (!patrolName) return "⚜️";

  // 1. Check custom overrides by ID or name
  const customMap = getCustomPatrolEmojis();
  if (patrolId && customMap[patrolId.toLowerCase().trim()]) {
    return customMap[patrolId.toLowerCase().trim()];
  }
  const nameKey = patrolName.toLowerCase().trim();
  if (customMap[nameKey]) {
    return customMap[nameKey];
  }

  // 2. Check if name already starts with an emoji (e.g. "🐱 Lynx")
  const emojiPrefixMatch = patrolName.match(
    /^([\p{Emoji_Presentation}\p{Extended_Pictographic}])/u,
  );
  if (emojiPrefixMatch) {
    return emojiPrefixMatch[1];
  }

  // 3. Smart Scout Animal & Section dictionary
  const n = nameKey;
  if (n.includes("baladin") || n.includes("castor") || n.includes("nuton")) return "🧸";
  if (
    n.includes("louvet") ||
    n.includes("seeonee") ||
    n.includes("waingunga") ||
    n.includes("loup") ||
    n.includes("meute")
  )
    return "🐺";
  if (n.includes("lynx")) return "🐱";
  if (n.includes("gazelle")) return "🦌";
  if (n.includes("girafe")) return "🦒";
  if (n.includes("marmotte")) return "🦫";
  if (n.includes("cougar") || n.includes("panthère")) return "🐆";
  if (n.includes("condor") || n.includes("aigle")) return "🦅";
  if (n.includes("jaguar") || n.includes("tigre")) return "🐅";
  if (n.includes("bison") || n.includes("buffle")) return "🦬";
  if (n.includes("faucon") || n.includes("épervier")) return "🦅";
  if (n.includes("pimiento") || n.includes("piment")) return "🌶️";
  if (n.includes("empire")) return "🏛️";
  if (n.includes("cerf") || n.includes("chevreuil") || n.includes("élan")) return "🦌";
  if (n.includes("renard")) return "🦊";
  if (n.includes("ours")) return "🐻";
  if (n.includes("lion")) return "🦁";
  if (n.includes("écureuil")) return "🐿️";
  if (n.includes("dauphin")) return "🐬";
  if (
    n.includes("staff") ||
    n.includes("chef") ||
    n.includes("maîtrise") ||
    n.includes("routi") ||
    n.includes("clan")
  )
    return "👑";

  return "⚜️";
}

export interface Profile {
  id: string;
  email: string | null;
  full_name: string | null;
  totem: string | null;
  quali: string | null;
  scout_year: number | null; // 1 to 4, or null for Chefs
  phone: string | null;
  birth_day?: number | null;
  birth_month?: number | null;
  strava_url: string | null;
  patrol_id: string | null;
  is_chef?: boolean | undefined;
  onboarded: boolean;
  created_at: string;
}

export type ActivitySport = "velo" | "course" | "marche";

/** Libellés et icônes des sports (affichage). */
export const SPORT_INFO: Record<
  ActivitySport,
  { label: string; short: string; emoji: string; verb: string }
> = {
  velo: { label: "Sortie vélo", short: "Vélo", emoji: "🚴", verb: "roulé" },
  course: { label: "Course à pied", short: "Course", emoji: "🏃", verb: "couru" },
  marche: { label: "Marche", short: "Marche", emoji: "🥾", verb: "marché" },
};

export function getActivitySport(act: { note?: string | null } | null | undefined): ActivitySport {
  if (!act?.note) return "velo";
  const n = act.note.toLowerCase();
  if (
    n.startsWith("[course]") ||
    n.startsWith("[course_a_pied]") ||
    n.startsWith("[run]") ||
    n.startsWith("[running]") ||
    n.includes("#course") ||
    n.includes("#run")
  ) {
    return "course";
  }
  if (
    n.startsWith("[marche]") ||
    n.startsWith("[walk]") ||
    n.startsWith("[rando]") ||
    n.includes("#marche") ||
    n.includes("#walk")
  ) {
    return "marche";
  }
  return "velo";
}

export function cleanActivityNote(note?: string | null): string {
  if (!note) return "";
  return note
    .replace(/^\[(course|course_a_pied|run|running|velo|marche|walk|rando)\]\s*/i, "")
    .trim();
}

export interface Activity {
  id: string;
  user_id: string;
  ride_date: string;
  km: number;
  proof_path: string | null;
  gpx_path?: string | null;
  strava_link: string | null;
  status: "pending" | "approved" | "rejected";
  sport?: ActivitySport;
  note: string | null;
  created_at: string;
}

export interface TimelineEvent {
  id: string;
  year: number;
  date_str: string;
  title: string;
  description: string;
  image_url: string | null;
  drive_url: string | null;
  tag: string;
  created_at: string;
}

export interface CountdownConfig {
  id: string;
  title: string;
  target_date: string; // ISO date string
  is_active: boolean;
  subtitle?: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role: "admin" | "user";
}

const STORAGE_KEY = "alezan_standalone_db_v2";

const SEED_PATROLS: Patrol[] = [
  {
    id: "patrol-staff",
    name: TROOP_STAFF_PATROL_NAME,
    category: "staff",
    created_at: "2026-09-01T00:00:00Z",
  },
  { id: "patrol-lynx", name: "Lynx", category: "femme", created_at: "2026-09-01T00:00:00Z" },
  {
    id: "patrol-gazelles",
    name: "Gazelles",
    category: "femme",
    created_at: "2026-09-01T00:00:00Z",
  },
  { id: "patrol-girafes", name: "Girafes", category: "femme", created_at: "2026-09-01T00:00:00Z" },
  {
    id: "patrol-marmottes",
    name: "Marmottes",
    category: "femme",
    created_at: "2026-09-01T00:00:00Z",
  },
  { id: "patrol-cougars", name: "Cougars", category: "homme", created_at: "2026-09-01T00:00:00Z" },
  { id: "patrol-condors", name: "Condors", category: "homme", created_at: "2026-09-01T00:00:00Z" },
  { id: "patrol-jaguars", name: "Jaguars", category: "homme", created_at: "2026-09-01T00:00:00Z" },
  { id: "patrol-bisons", name: "Bisons", category: "homme", created_at: "2026-09-01T00:00:00Z" },
  { id: "patrol-faucons", name: "Faucons", category: "homme", created_at: "2026-09-01T00:00:00Z" },
];

const SEED_PROFILES: Profile[] = [];

const SEED_ACTIVITIES: Activity[] = [];

const SEED_TIMELINE: TimelineEvent[] = [];

const SEED_COUNTDOWN: CountdownConfig = {
  id: "countdown-main",
  title: "Fin du Défi Vélo des Patrouilles 2026",
  subtitle: "Rassemblement de troupe et remise du Grand Trophée ALEZAN 42",
  target_date: "2026-11-15T18:00:00",
  is_active: true,
};

const SEED_USER_ROLES: UserRole[] = [
  { id: "role-gauthier", user_id: "usr-gauthier", role: "admin" },
];

export interface DatabaseState {
  patrols: Patrol[];
  profiles: Profile[];
  activities: Activity[];
  timeline: TimelineEvent[];
  countdown: CountdownConfig;
  user_roles: UserRole[];
  currentUser: { id: string; email: string } | null;
}

class StandaloneDatabase {
  private state: DatabaseState;
  private listeners: Set<() => void> = new Set();
  private authListeners: Set<(event: string, session: unknown) => void> = new Set();

  constructor() {
    this.state = this.loadState();
    if (typeof window !== "undefined") {
      this.syncFromServer();
      setInterval(() => this.syncFromServer(), 3000);
    }
  }

  private async syncFromServer() {
    try {
      const res = await fetch("/api/db");
      if (res.ok) {
        const serverData = await res.json();
        if (serverData && Array.isArray(serverData.profiles) && serverData.profiles.length > 0) {
          const hasChanges =
            serverData.profiles?.length !== this.state.profiles?.length ||
            serverData.activities?.length !== this.state.activities?.length ||
            serverData.timeline?.length !== this.state.timeline?.length;

          if (hasChanges) {
            const currentLocalUser = this.state.currentUser;
            this.state = {
              ...serverData,
              currentUser: currentLocalUser,
            };
            if (typeof window !== "undefined") {
              localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
            }
            this.notify();
          }
        } else {
          // Initialize server with local state
          fetch("/api/db", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(this.state),
          }).catch(() => {});
        }
      }
    } catch {
      // ignore offline/network hiccups
    }
  }

  private loadState(): DatabaseState {
    const GAUTHIER_UUID = "0a275bbb-6075-466a-88a0-4eb57e55e990";
    const isUUID = (val: string | null | undefined): boolean =>
      !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

    const sanitizeId = (id: string, email?: string | null): string => {
      if (isUUID(id)) return id;
      if (id === "usr-gauthier" || email?.toLowerCase() === "baudeletgauthier@gmail.com") {
        return GAUTHIER_UUID;
      }
      return (
        "00000000-0000-4000-8000-" +
        Math.abs(id.split("").reduce((a, c) => (a << 5) - a + c.charCodeAt(0), 0))
          .toString(16)
          .padStart(12, "0")
          .slice(-12)
      );
    };

    if (typeof window !== "undefined") {
      try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);

          // Clean out legacy fake profiles and fake activities
          const cleanProfiles = (parsed.profiles || []).filter((p: Profile) => {
            if (p.id?.startsWith("usr-")) return false;
            const email = p.email?.toLowerCase();
            if (email?.endsWith("@scout.fr")) return false;
            return true;
          });

          const cleanActivities = (parsed.activities || []).filter((a: Activity) => {
            if (
              a.id?.startsWith("act-") ||
              a.id?.startsWith("act-chef-") ||
              a.id?.startsWith("act-lw-")
            ) {
              return false;
            }
            if (a.user_id?.startsWith("usr-")) return false;
            return true;
          });

          // Migrate any legacy usr-gauthier IDs
          const migratedProfiles = cleanProfiles.map((p: Profile) => ({
            ...p,
            id: sanitizeId(p.id, p.email),
          }));

          let migratedCurrentUser = parsed.currentUser || null;
          if (migratedCurrentUser) {
            migratedCurrentUser = {
              ...migratedCurrentUser,
              id: sanitizeId(migratedCurrentUser.id, migratedCurrentUser.email),
            };
          }

          const migratedActivities = cleanActivities.map((a: Activity) => ({
            ...a,
            user_id: sanitizeId(a.user_id),
          }));

          const state: DatabaseState = {
            patrols: parsed.patrols?.length ? parsed.patrols : SEED_PATROLS,
            profiles: migratedProfiles,
            activities: migratedActivities,
            timeline: parsed.timeline?.length ? parsed.timeline : SEED_TIMELINE,
            countdown: parsed.countdown || SEED_COUNTDOWN,
            user_roles: parsed.user_roles?.length ? parsed.user_roles : SEED_USER_ROLES,
            currentUser: migratedCurrentUser,
          };

          // Save migrated state back to localStorage
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
          return state;
        }
      } catch (err) {
        console.warn("Failed to load local DB state:", err);
      }
    }

    return {
      patrols: [...SEED_PATROLS],
      profiles: [...SEED_PROFILES],
      activities: [...SEED_ACTIVITIES],
      timeline: [...SEED_TIMELINE],
      countdown: { ...SEED_COUNTDOWN },
      user_roles: [...SEED_USER_ROLES],
      currentUser: null,
    };
  }

  private saveState() {
    if (typeof window !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
        fetch("/api/db", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(this.state),
        }).catch(() => {});
      } catch (err) {
        console.warn("Failed to save local DB state:", err);
      }
    }
    this.notify();
  }

  public subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public subscribeAuth(fn: (event: string, session: unknown) => void): () => void {
    this.authListeners.add(fn);
    return () => this.authListeners.delete(fn);
  }

  private notify() {
    this.listeners.forEach((fn) => {
      try {
        fn();
      } catch {
        // ignore listener error
      }
    });
  }

  private notifyAuth(event: string) {
    const session = this.state.currentUser
      ? { user: this.state.currentUser, access_token: "standalone-token" }
      : null;
    this.authListeners.forEach((fn) => {
      try {
        fn(event, session);
      } catch {
        // ignore listener error
      }
    });
    this.notify();
  }

  // --- Auth APIs ---
  public getCurrentUser(): { id: string; email: string } | null {
    if (!this.state.currentUser) return null;
    const isUUID = (val: string | null | undefined): boolean =>
      !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);
    let uid = this.state.currentUser.id;
    if (!isUUID(uid)) {
      uid =
        uid === "usr-gauthier" || this.state.currentUser.email === "baudeletgauthier@gmail.com"
          ? "0a275bbb-6075-466a-88a0-4eb57e55e990"
          : "00000000-0000-4000-8000-000000000001";
      this.state.currentUser.id = uid;
      this.saveState();
    }
    return { ...this.state.currentUser, id: uid };
  }

  public getSession() {
    return this.state.currentUser
      ? { user: this.state.currentUser, access_token: "standalone-token" }
      : null;
  }

  public signIn(email: string) {
    const cleanEmail = email.trim().toLowerCase();
    let profile = this.state.profiles.find((p) => p.email?.toLowerCase() === cleanEmail);

    if (!profile) {
      const isGauthier = cleanEmail === "baudeletgauthier@gmail.com";
      const id = isGauthier
        ? "0a275bbb-6075-466a-88a0-4eb57e55e990"
        : typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "00000000-0000-4000-8000-" + Date.now().toString(16).padStart(12, "0");
      profile = {
        id,
        email: cleanEmail,
        full_name: cleanEmail.split("@")[0] || "Scout",
        totem: null,
        quali: null,
        scout_year: isGauthier ? null : 1,
        phone: null,
        strava_url: null,
        patrol_id: isGauthier ? "patrol-staff" : null,
        is_chef: isGauthier,
        onboarded: isGauthier,
        created_at: new Date().toISOString(),
      };
      this.state.profiles.push(profile);
    }

    if (cleanEmail === "baudeletgauthier@gmail.com" || cleanEmail.includes("admin")) {
      if (!this.state.user_roles.some((r) => r.user_id === profile!.id && r.role === "admin")) {
        this.state.user_roles.push({
          id: `role-${Date.now()}`,
          user_id: profile!.id,
          role: "admin",
        });
      }
    }

    this.state.currentUser = { id: profile.id, email: cleanEmail };
    this.saveState();
    this.notifyAuth("SIGNED_IN");
    return { user: this.state.currentUser, profile };
  }

  public signUp(
    email: string,
    metadata: {
      full_name: string;
      totem?: string | null;
      quali?: string | null;
      scout_year?: number | null;
      patrol_id?: string | null;
      phone?: string | null;
      birth_day?: number | null;
      birth_month?: number | null;
      is_chef?: boolean;
    },
  ) {
    const cleanEmail = email.trim().toLowerCase();
    let profile = this.state.profiles.find((p) => p.email?.toLowerCase() === cleanEmail);
    const isGauthier = cleanEmail === "baudeletgauthier@gmail.com";
    const id =
      profile?.id ||
      (isGauthier
        ? "0a275bbb-6075-466a-88a0-4eb57e55e990"
        : typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : "usr-" + Date.now());

    if (!profile) {
      profile = {
        id,
        email: cleanEmail,
        full_name: metadata.full_name,
        totem: metadata.totem || null,
        quali: metadata.quali || null,
        scout_year: metadata.scout_year ?? null,
        phone: metadata.phone || null,
        birth_day: metadata.birth_day ?? null,
        birth_month: metadata.birth_month ?? null,
        strava_url: null,
        patrol_id: metadata.patrol_id || (isGauthier ? "patrol-staff" : null),
        is_chef: metadata.is_chef ?? isGauthier,
        onboarded: true,
        created_at: new Date().toISOString(),
      };
      this.state.profiles.push(profile);
    } else {
      profile.full_name = metadata.full_name || profile.full_name;
      profile.totem = metadata.totem || profile.totem;
      profile.quali = metadata.quali || profile.quali;
      profile.scout_year = metadata.scout_year ?? profile.scout_year;
      profile.patrol_id = metadata.patrol_id || profile.patrol_id;
      profile.phone = metadata.phone || profile.phone;
      profile.onboarded = true;
    }

    if (isGauthier || cleanEmail.includes("admin")) {
      if (!this.state.user_roles.some((r) => r.user_id === id && r.role === "admin")) {
        this.state.user_roles.push({
          id: `role-${Date.now()}`,
          user_id: id,
          role: "admin",
        });
      }
    }

    this.state.currentUser = { id, email: cleanEmail };
    this.saveState();
    this.notifyAuth("SIGNED_IN");
    return { user: this.state.currentUser, profile };
  }

  public signOut() {
    this.state.currentUser = null;
    this.saveState();
    this.notifyAuth("SIGNED_OUT");
  }

  public isAdmin(userId?: string): boolean {
    const uid = userId || this.state.currentUser?.id;
    if (!uid) return false;
    return this.state.user_roles.some((r) => r.user_id === uid && r.role === "admin");
  }

  // --- Patrols APIs ---
  public getPatrols(): Patrol[] {
    return [...this.state.patrols];
  }

  public addPatrol(name: string, category: PatrolCategory): Patrol {
    const patrol: Patrol = {
      id: `patrol-${Date.now().toString(36)}`,
      name: name.trim(),
      category,
      created_at: new Date().toISOString(),
    };
    this.state.patrols.push(patrol);
    this.saveState();
    return patrol;
  }

  public deletePatrol(id: string) {
    this.state.patrols = this.state.patrols.filter((p) => p.id !== id);
    this.saveState();
  }

  // --- Profiles APIs ---
  public getProfiles(): Profile[] {
    return [...this.state.profiles];
  }

  public getProfile(id: string): Profile | null {
    return this.state.profiles.find((p) => p.id === id) || null;
  }

  public updateProfile(id: string, patch: Partial<Profile>): Profile | null {
    const idx = this.state.profiles.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const current = this.state.profiles[idx]!;

    // Check if patrol is Staff or Chefs
    const patrol = this.state.patrols.find(
      (pa) => pa.id === (patch.patrol_id || current.patrol_id),
    );
    const isStaffOrChef =
      patrol?.name.toLowerCase().includes("staff") ||
      patrol?.name.toLowerCase().includes("chef") ||
      patrol?.category === "staff" ||
      current.is_chef;

    const updated: Profile = {
      ...current,
      ...patch,
      is_chef: isStaffOrChef,
      scout_year: isStaffOrChef ? null : (patch.scout_year ?? current.scout_year),
    };
    this.state.profiles[idx] = updated;
    this.saveState();
    return updated;
  }

  // --- Activities APIs ---
  public getActivities(userId?: string): Activity[] {
    if (userId) {
      return this.state.activities.filter((a) => a.user_id === userId);
    }
    return [...this.state.activities];
  }

  public addActivity(data: {
    id?: string;
    user_id: string;
    ride_date: string;
    km: number;
    proof_path?: string | null;
    gpx_path?: string | null;
    strava_link?: string | null;
    sport?: ActivitySport;
    note?: string | null;
    status?: "approved" | "pending" | "rejected";
  }): Activity {
    const strava = data.strava_link?.trim();
    // Rule: Strava link -> approved, screenshot proof -> pending
    const status: "approved" | "pending" | "rejected" =
      data.status || (strava && strava.length > 0 ? "approved" : "pending");

    const activity: Activity = {
      id: data.id || `act-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      user_id: data.user_id,
      ride_date: data.ride_date,
      km: Number(data.km),
      proof_path: data.proof_path || null,
      gpx_path: data.gpx_path || null,
      strava_link: strava || null,
      status,
      sport: data.sport || getActivitySport(data),
      note: data.note || null,
      created_at: new Date().toISOString(),
    };

    this.state.activities.unshift(activity);
    this.saveState();
    return activity;
  }

  public updateActivityStatus(id: string, status: "approved" | "rejected" | "pending") {
    const act = this.state.activities.find((a) => a.id === id);
    if (act) {
      act.status = status;
      this.saveState();
    }
  }

  public deleteActivity(id: string) {
    this.state.activities = this.state.activities.filter((a) => a.id !== id);
    this.saveState();
  }

  // --- Timeline APIs ---
  public getTimeline(): TimelineEvent[] {
    return [...this.state.timeline].sort(
      (a, b) => b.year - a.year || b.date_str.localeCompare(a.date_str),
    );
  }

  public addTimelineEvent(event: Omit<TimelineEvent, "id" | "created_at">): TimelineEvent {
    const newEvent: TimelineEvent = {
      ...event,
      id: `tl-${Date.now().toString(36)}`,
      created_at: new Date().toISOString(),
    };
    this.state.timeline.unshift(newEvent);
    this.saveState();
    return newEvent;
  }

  public updateTimelineEvent(id: string, patch: Partial<TimelineEvent>) {
    const idx = this.state.timeline.findIndex((t) => t.id === id);
    if (idx !== -1) {
      this.state.timeline[idx] = { ...this.state.timeline[idx]!, ...patch };
      this.saveState();
    }
  }

  public deleteTimelineEvent(id: string) {
    this.state.timeline = this.state.timeline.filter((t) => t.id !== id);
    this.saveState();
  }

  // --- Countdown APIs ---
  public getCountdown(): CountdownConfig {
    return { ...this.state.countdown };
  }

  public updateCountdown(config: Partial<CountdownConfig>) {
    this.state.countdown = { ...this.state.countdown, ...config };
    this.saveState();
  }

  // --- Admin Roles ---
  public getAdmins(): string[] {
    return this.state.user_roles.filter((r) => r.role === "admin").map((r) => r.user_id);
  }

  public setAdmin(userId: string) {
    if (!this.state.user_roles.some((r) => r.user_id === userId && r.role === "admin")) {
      this.state.user_roles.push({
        id: `role-${Date.now()}`,
        user_id: userId,
        role: "admin",
      });
      this.saveState();
    }
  }

  public removeAdmin(userId: string) {
    this.state.user_roles = this.state.user_roles.filter(
      (r) => !(r.user_id === userId && r.role === "admin"),
    );
    this.saveState();
  }

  // --- Leaderboard Calculation ---
  public getLeaderboard(from?: string | null, to?: string | null) {
    // 1. Group approved activities by user_id
    const userKmMap = new Map<string, number>();
    for (const act of this.state.activities) {
      if (act.status !== "approved") continue;
      if (from && act.ride_date < from) continue;
      if (to && act.ride_date > to) continue;
      const current = userKmMap.get(act.user_id) || 0;
      userKmMap.set(act.user_id, current + Number(act.km));
    }

    // 2. Map profiles with patrol info
    const rows = this.state.profiles
      .filter((p) => !!p.patrol_id)
      .map((p) => {
        const patrol = this.state.patrols.find((pa) => pa.id === p.patrol_id);
        const km = userKmMap.get(p.id) || 0;
        const isChef =
          patrol?.name.toLowerCase().includes("staff") ||
          patrol?.name.toLowerCase().includes("chef") ||
          patrol?.category === "staff" ||
          p.is_chef;

        return {
          user_id: p.id,
          display_name: p.totem
            ? `${p.totem}${p.quali ? " " + p.quali : ""}`
            : p.full_name || "Scout",
          full_name: p.full_name || "Scout",
          totem: p.totem,
          quali: p.quali,
          scout_year: isChef ? null : p.scout_year,
          is_chef: isChef,
          patrol_id: p.patrol_id!,
          patrol_name: patrol?.name || "Patrouille",
          category: patrol?.category || "staff",
          km,
        };
      });

    return rows;
  }
}

export const db = new StandaloneDatabase();
