// Adapter exposing the Standalone Database through the Supabase interface
// Guarantees zero breakage for existing components while running 100% locally.

import {
  db,
  type Patrol,
  type Profile,
  type Activity,
  type UserRole,
  type TimelineEvent,
} from "@/lib/database";

type AnyRow = Record<string, unknown>;

class MockQueryBuilder {
  private table: string;
  private filters: Array<(row: AnyRow) => boolean> = [];
  private orderField?: string;
  private orderAsc = true;
  private isSingle = false;
  private isMaybeSingle = false;
  private isDelete = false;
  private selectColumns = "*";

  constructor(table: string) {
    this.table = table;
  }

  select(columns = "*") {
    this.selectColumns = columns;
    return this;
  }

  eq(column: string, value: unknown) {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  neq(column: string, value: unknown) {
    this.filters.push((row) => row[column] !== value);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }) {
    this.orderField = column;
    this.orderAsc = options?.ascending ?? true;
    return this;
  }

  single() {
    this.isSingle = true;
    return this;
  }

  maybeSingle() {
    this.isMaybeSingle = true;
    return this;
  }

  delete() {
    this.isDelete = true;
    return this;
  }

  async insert(data: unknown) {
    const list = Array.isArray(data) ? data : [data];
    const inserted: AnyRow[] = [];
    for (const item of list) {
      const rowItem = (typeof item === "object" && item !== null ? item : {}) as AnyRow;
      if (this.table === "activities") {
        const act = db.addActivity({
          user_id: (rowItem["user_id"] as string) || "usr-anon",
          ride_date: (rowItem["ride_date"] as string) || new Date().toISOString().slice(0, 10),
          km: Number(rowItem["km"]) || 0,
          proof_path: (rowItem["proof_path"] as string) || null,
          strava_link: (rowItem["strava_link"] as string) || null,
          note: (rowItem["note"] as string) || null,
        });
        inserted.push(act as unknown as AnyRow);
      } else if (this.table === "patrols") {
        const cat = (rowItem["category"] as "homme" | "femme" | "staff") || "homme";
        const p = db.addPatrol((rowItem["name"] as string) || "Nouvelle Patrouille", cat);
        inserted.push(p as unknown as AnyRow);
      } else if (this.table === "timeline") {
        const t = db.addTimelineEvent({
          year: Number(rowItem["year"]) || new Date().getFullYear(),
          date_str: (rowItem["date_str"] as string) || "2026",
          title: (rowItem["title"] as string) || "",
          description: (rowItem["description"] as string) || "",
          image_url: (rowItem["image_url"] as string) || null,
          drive_url: (rowItem["drive_url"] as string) || null,
          tag: (rowItem["tag"] as string) || "Événement",
        });
        inserted.push(t as unknown as AnyRow);
      } else if (this.table === "user_roles") {
        db.setAdmin(rowItem["user_id"] as string);
        inserted.push(rowItem);
      }
    }
    return { data: Array.isArray(data) ? inserted : inserted[0], error: null };
  }

  async update(patch: Record<string, unknown>) {
    if (this.table === "profiles") {
      const profiles = db.getProfiles();
      const matched = profiles.filter((p) => this.filters.every((f) => f(p as unknown as AnyRow)));
      for (const p of matched) {
        db.updateProfile(p.id, patch);
      }
      return { data: matched, error: null };
    }
    if (this.table === "activities") {
      const acts = db.getActivities();
      const matched = acts.filter((a) => this.filters.every((f) => f(a as unknown as AnyRow)));
      for (const a of matched) {
        if (patch["status"]) {
          db.updateActivityStatus(a.id, patch["status"] as "approved" | "rejected" | "pending");
        }
      }
      return { data: matched, error: null };
    }
    return { data: [], error: null };
  }

  async execute() {
    if (this.isDelete) {
      if (this.table === "activities") {
        const acts = db.getActivities();
        const matched = acts.filter((a) => this.filters.every((f) => f(a as unknown as AnyRow)));
        matched.forEach((a) => db.deleteActivity(a.id));
      } else if (this.table === "patrols") {
        const patrols = db.getPatrols();
        const matched = patrols.filter((p) => this.filters.every((f) => f(p as unknown as AnyRow)));
        matched.forEach((p) => db.deletePatrol(p.id));
      } else if (this.table === "user_roles") {
        const profiles = db.getProfiles();
        const matched = profiles.filter((p) =>
          this.filters.every((f) => f(p as unknown as AnyRow)),
        );
        matched.forEach((p) => db.removeAdmin(p.id));
      }
      return { data: null, error: null };
    }

    let data: AnyRow[] = [];
    if (this.table === "activities") data = db.getActivities() as unknown as AnyRow[];
    else if (this.table === "patrols") data = db.getPatrols() as unknown as AnyRow[];
    else if (this.table === "profiles") data = db.getProfiles() as unknown as AnyRow[];
    else if (this.table === "timeline") data = db.getTimeline() as unknown as AnyRow[];
    else if (this.table === "user_roles") {
      data = db.getAdmins().map((uid) => ({ user_id: uid, role: "admin" })) as AnyRow[];
    }

    let result = data.filter((row) => this.filters.every((f) => f(row)));

    if (this.orderField) {
      const field = this.orderField;
      const asc = this.orderAsc;
      result.sort((a, b) => {
        const valA = String(a[field] ?? "");
        const valB = String(b[field] ?? "");
        if (valA < valB) return asc ? -1 : 1;
        if (valA > valB) return asc ? 1 : -1;
        return 0;
      });
    }

    if (this.selectColumns !== "*") {
      const cols = this.selectColumns.split(",").map((c) => c.trim());
      result = result.map((r) => {
        const picked: Record<string, unknown> = {};
        for (const c of cols) {
          picked[c] = r[c];
        }
        return picked;
      });
    }

    if (this.isSingle) {
      return { data: result[0] ?? null, error: result[0] ? null : { message: "Row not found" } };
    }
    if (this.isMaybeSingle) {
      return { data: result[0] ?? null, error: null };
    }
    return { data: result, error: null };
  }

  then<TResult1 = unknown, TResult2 = never>(
    onfulfilled?: ((value: unknown) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }
}

export function createMockSupabaseClient() {
  return {
    auth: {
      onAuthStateChange(callback: (event: string, session: unknown) => void) {
        const unsubscribe = db.subscribeAuth(callback);
        const session = db.getSession();
        setTimeout(() => callback("INITIAL_SESSION", session), 0);
        return {
          data: {
            subscription: {
              unsubscribe,
            },
          },
        };
      },
      async getSession() {
        return { data: { session: db.getSession() }, error: null };
      },
      async setSession(_session: unknown) {
        return { data: { session: db.getSession() }, error: null };
      },
      async getUser() {
        const u = db.getCurrentUser();
        return { data: { user: u }, error: null };
      },
      async signInWithPassword({ email }: { email: string; password?: string }) {
        const res = db.signIn(email);
        return {
          data: {
            user: res.user,
            session: db.getSession(),
          },
          error: null,
        };
      },
      async signUp({ email }: { email: string; password?: string; options?: unknown }) {
        return this.signInWithPassword({ email });
      },
      async signOut() {
        db.signOut();
        return { error: null };
      },
    },

    from(table: string) {
      return new MockQueryBuilder(table);
    },

    async rpc(name: string, params?: Record<string, unknown>) {
      if (name === "leaderboard") {
        const rows = db.getLeaderboard(
          params?._from as string | null,
          params?._to as string | null,
        );
        return { data: rows, error: null };
      }
      return { data: [], error: null };
    },

    storage: {
      from(_bucket: string) {
        return {
          async upload(path: string, _file: unknown) {
            return { data: { path }, error: null };
          },
          getPublicUrl(path: string) {
            return { data: { publicUrl: path } };
          },
        };
      },
    },
  };
}
