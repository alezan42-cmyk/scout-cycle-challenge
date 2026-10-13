import { useEffect, useMemo, useState } from "react";
import { Users, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { pelotonMultiplier } from "@/lib/peloton";
import { SPORT_INFO, type ActivitySport } from "@/lib/database";

export type GroupChoice =
  | { mode: "seul" }
  | { mode: "nouveau"; companions: string[] }
  | {
      mode: "rejoindre";
      groupId: string;
      rideDate: string;
      sport: ActivitySport;
      /** nombre de personnes prévues dans la sortie (toi comprise) */
      size?: number;
    };

type Member = { id: string; name: string };
export type Invitation = {
  groupId: string;
  rideDate: string;
  sport: ActivitySport;
  createdByName: string;
  otherNames: string[];
};

function displayName(p: { totem?: string | null; full_name?: string | null }): string {
  return p.totem || p.full_name || "Scout";
}

/** Sorties de groupe où l'utilisateur a été ajouté mais n'a pas encore encodé sa sortie. */
async function loadInvitations(userId: string): Promise<Invitation[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const since = new Date(Date.now() - 45 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const { data: mine } = await sb
    .from("group_ride_members")
    .select("group_id, group_rides!inner(id, ride_date, sport, created_by)")
    .eq("user_id", userId)
    .gte("group_rides.ride_date", since);
  const groups = (mine ?? []) as {
    group_id: string;
    group_rides: { id: string; ride_date: string; sport: ActivitySport; created_by: string };
  }[];
  if (groups.length === 0) return [];

  const ids = groups.map((g) => g.group_id);
  const [{ data: done }, { data: members }] = await Promise.all([
    sb.from("activities").select("group_ride_id").eq("user_id", userId).in("group_ride_id", ids),
    sb.from("group_ride_members").select("group_id, user_id").in("group_id", ids),
  ]);
  const doneIds = new Set(
    ((done ?? []) as { group_ride_id: string }[]).map((d) => d.group_ride_id),
  );
  const allUserIds = [...new Set(((members ?? []) as { user_id: string }[]).map((m) => m.user_id))];
  const { data: profs } = await sb
    .from("profiles_public")
    .select("id, totem, full_name")
    .in("id", allUserIds);
  const nameOf = new Map(
    ((profs ?? []) as { id: string; totem: string | null; full_name: string | null }[]).map((p) => [
      p.id,
      displayName(p),
    ]),
  );

  return groups
    .filter((g) => !doneIds.has(g.group_id))
    .map((g) => ({
      groupId: g.group_id,
      rideDate: g.group_rides.ride_date,
      sport: g.group_rides.sport,
      createdByName: nameOf.get(g.group_rides.created_by) ?? "Un scout",
      otherNames: ((members ?? []) as { group_id: string; user_id: string }[])
        .filter((m) => m.group_id === g.group_id && m.user_id !== userId)
        .map((m) => nameOf.get(m.user_id) ?? "Scout"),
    }))
    .sort((a, b) => b.rideDate.localeCompare(a.rideDate));
}

/**
 * Choix « seul / à plusieurs » dans le formulaire de sortie.
 * - « J'étais avec… » : on coche ses compagnons (une sortie de groupe est créée) ;
 * - « Rejoindre » : on rattache sa sortie à un groupe où quelqu'un nous a ajouté.
 */
export function GroupRidePicker({
  userId,
  value,
  onChange,
}: {
  userId: string | undefined;
  value: GroupChoice;
  onChange: (v: GroupChoice) => void;
}) {
  const [members, setMembers] = useState<Member[]>([]);
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!userId) return;
    let active = true;
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("profiles_public")
        .select("id, totem, full_name")
        .neq("id", userId);
      if (!active) return;
      setMembers(
        ((data ?? []) as { id: string; totem: string | null; full_name: string | null }[])
          .map((p) => ({ id: p.id, name: displayName(p) }))
          .sort((a, b) => a.name.localeCompare(b.name, "fr")),
      );
      const inv = await loadInvitations(userId).catch(() => []);
      if (active) setInvitations(inv);
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  const companions = value.mode === "nouveau" ? value.companions : [];
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? members.filter((m) => m.name.toLowerCase().includes(q)) : members;
  }, [members, search]);
  const nameOf = useMemo(() => new Map(members.map((m) => [m.id, m.name])), [members]);

  const toggle = (id: string) => {
    const next = companions.includes(id) ? companions.filter((c) => c !== id) : [...companions, id];
    onChange({ mode: "nouveau", companions: next });
  };

  const size = value.mode === "nouveau" ? companions.length + 1 : 0;
  const mult = pelotonMultiplier(size);

  const tabClass = (active: boolean) =>
    cn(
      "rounded-md px-3 py-1 font-semibold transition-all",
      active ? "bg-card text-foreground shadow-xs" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <div className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Label className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-muted-foreground">
          <Users className="h-3.5 w-3.5" />
          Sortie à plusieurs ? <span className="normal-case font-normal">(classement Peloton)</span>
        </Label>
        <div className="flex rounded-lg bg-muted p-0.5 text-xs">
          <button
            type="button"
            className={tabClass(value.mode === "seul")}
            onClick={() => onChange({ mode: "seul" })}
          >
            Seul
          </button>
          <button
            type="button"
            className={tabClass(value.mode === "nouveau")}
            onClick={() => onChange({ mode: "nouveau", companions: [] })}
          >
            J&apos;étais avec…
          </button>
          {invitations.length > 0 && (
            <button
              type="button"
              className={tabClass(value.mode === "rejoindre")}
              onClick={() => {
                const first = invitations[0];
                if (first)
                  onChange({
                    mode: "rejoindre",
                    groupId: first.groupId,
                    rideDate: first.rideDate,
                    sport: first.sport,
                    size: first.otherNames.length + 1,
                  });
              }}
            >
              Rejoindre ({invitations.length})
            </button>
          )}
        </div>
      </div>

      {value.mode === "seul" && invitations.length > 0 && (
        <p className="rounded-lg bg-amber-500/10 p-2 text-xs text-amber-800 dark:text-amber-300">
          🚴 Tu as été ajouté à {invitations.length} sortie{invitations.length > 1 ? "s" : ""} à
          plusieurs. Clique sur « Rejoindre » pour y rattacher ta sortie.
        </p>
      )}

      {value.mode === "nouveau" && (
        <div className="space-y-2">
          <p className="text-[11px] text-muted-foreground">
            Coche les membres avec qui tu as roulé ou couru. Chacun devra encoder sa propre sortie
            (Strava ou photo) en choisissant « Rejoindre » : seules les sorties validées comptent.
          </p>
          {companions.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {companions.map((id) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => toggle(id)}
                  className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-xs font-semibold text-primary"
                >
                  {nameOf.get(id) ?? "Scout"} <X className="h-3 w-3" />
                </button>
              ))}
            </div>
          )}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Chercher un totem ou un nom…"
              className="h-9 pl-8 text-sm"
            />
          </div>
          <div className="max-h-44 space-y-1 overflow-y-auto rounded-lg border p-1.5">
            {filtered.length === 0 ? (
              <p className="p-2 text-xs text-muted-foreground">Aucun membre trouvé.</p>
            ) : (
              filtered.map((m) => (
                <label
                  key={m.id}
                  className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-muted/50"
                >
                  <Checkbox
                    checked={companions.includes(m.id)}
                    onCheckedChange={() => toggle(m.id)}
                  />
                  {m.name}
                </label>
              ))
            )}
          </div>
          {size >= 2 && (
            <p className="text-xs font-semibold text-foreground">
              {size} participants → multiplicateur ×{mult.toLocaleString("fr-BE")} (si tout le monde
              encode sa sortie)
            </p>
          )}
        </div>
      )}

      {value.mode === "rejoindre" && (
        <div className="space-y-1.5">
          {invitations.map((inv) => (
            <label
              key={inv.groupId}
              className={cn(
                "flex cursor-pointer items-start gap-2 rounded-lg border p-2 text-sm",
                value.groupId === inv.groupId ? "border-primary bg-primary/5" : "hover:bg-muted/40",
              )}
            >
              <input
                type="radio"
                name="group-invitation"
                className="mt-1"
                checked={value.groupId === inv.groupId}
                onChange={() =>
                  onChange({
                    mode: "rejoindre",
                    groupId: inv.groupId,
                    rideDate: inv.rideDate,
                    sport: inv.sport,
                    size: inv.otherNames.length + 1,
                  })
                }
              />
              <span>
                <strong>
                  {SPORT_INFO[inv.sport].emoji} {SPORT_INFO[inv.sport].label} du{" "}
                  {new Date(inv.rideDate).toLocaleDateString("fr-BE")}
                </strong>
                <br />
                <span className="text-xs text-muted-foreground">
                  Avec {inv.otherNames.join(", ")} · ajoutée par {inv.createdByName}
                </span>
              </span>
            </label>
          ))}
          <p className="text-[11px] text-muted-foreground">
            La date et le sport de ta sortie sont alignés sur ceux du groupe.
          </p>
        </div>
      )}
    </div>
  );
}
