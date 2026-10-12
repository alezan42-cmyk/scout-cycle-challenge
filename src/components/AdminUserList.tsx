import React, { useState, useMemo, useCallback, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  Shield,
  ShieldCheck,
  ShieldAlert,
  Search,
  Users,
  Crown,
  UserCheck,
  Filter,
  Sparkles,
  Mail,
  Loader2,
  ArrowUpDown,
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { db, type Profile, type Patrol } from "@/lib/database";
import { cn } from "@/lib/utils";
import { isStaffPatrol } from "@/lib/categories";

interface AdminUserListProps {
  profiles: Profile[];
  patrols: Patrol[];
  admins: string[];
  onRefresh: () => void | Promise<void>;
  currentUserId?: string;
  currentUserEmail?: string | null;
}

export function AdminUserList({
  profiles,
  patrols,
  admins,
  onRefresh,
  currentUserId,
  currentUserEmail,
}: AdminUserListProps) {
  const [sortBy, setSortBy] = useState<"patrol" | "name" | "totem">("patrol");
  const [newMemberIds, setNewMemberIds] = useState<string[]>([]);
  const initialMembersTracked = useRef(false);
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | "admins" | "scouts">("all");
  const [patrolFilter, setPatrolFilter] = useState<string>("all");
  const [togglingUserId, setTogglingUserId] = useState<string | null>(null);
  const [adminEmailInput, setAdminEmailInput] = useState("");
  const [addingEmail, setAddingEmail] = useState(false);

  useEffect(() => {
    if (initialMembersTracked.current || profiles.length === 0) return;
    initialMembersTracked.current = true;

    const storageKey = "alezan-admin-members-last-seen-at";
    const now = Date.now();
    try {
      const storedLastSeenAt = Number(window.localStorage.getItem(storageKey));
      const lastSeenAt =
        Number.isFinite(storedLastSeenAt) && storedLastSeenAt > 0
          ? storedLastSeenAt
          : now - 30 * 24 * 60 * 60 * 1000;
      setNewMemberIds(
        profiles
          .filter((profile) => {
            const createdAt = Date.parse(profile.created_at);
            return Number.isFinite(createdAt) && createdAt > lastSeenAt && createdAt <= now;
          })
          .map((profile) => profile.id),
      );
      window.localStorage.setItem(storageKey, String(now));
    } catch {
      // Le tri et la gestion restent utilisables si le stockage local est indisponible.
    }
  }, [profiles]);

  // Map patrol names
  const patrolMap = useMemo(() => {
    const map = new Map<string, Patrol>();
    patrols.forEach((p) => map.set(p.id, p));
    return map;
  }, [patrols]);

  // Check if a profile is an admin
  const isUserAdmin = useCallback(
    (p: Profile): boolean => {
      if (p.email?.toLowerCase() === "baudeletgauthier@gmail.com") return true;
      return !!p.is_admin || admins.includes(p.id);
    },
    [admins],
  );

  // Toggle admin privilege via toggle switch
  // Mot de passe temporaire défini par un admin (fonction admin_set_password).
  const handleResetPassword = async (target: Profile) => {
    const name = target.totem || target.full_name || target.email || "ce membre";
    const pw = window.prompt(
      `Nouveau mot de passe temporaire pour ${name} (6 caractères minimum).\n\nCommunique-le-lui en main propre ; il pourra le changer ensuite via « Mot de passe oublié ».`,
    );
    if (pw === null) return;
    if (pw.trim().length < 6) {
      toast.error("6 caractères minimum.");
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("admin_set_password", {
      _user_id: target.id,
      _password: pw.trim(),
    });
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    toast.success(`Mot de passe de ${name} réinitialisé.`);
  };

  const handleToggleAdmin = async (target: Profile, newChecked: boolean) => {
    if (target.email?.toLowerCase() === "baudeletgauthier@gmail.com" && !newChecked) {
      toast.error("Impossible de retirer les droits du compte administrateur principal.");
      return;
    }

    setTogglingUserId(target.id);
    const displayName = target.full_name || target.totem || target.email || "Ce membre";

    try {
      // 1. Update profiles table is_admin column in Supabase
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: profErr } = (await (supabase.from("profiles") as any)
        .update({ is_admin: newChecked })
        .eq("id", target.id)) as { error: { message: string } | null };

      if (profErr) {
        console.warn("Mise à jour profiles.is_admin :", profErr);
      }

      // 2. Update user_roles table
      if (newChecked) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error: roleErr } = (await (supabase.from("user_roles") as any).upsert(
          { user_id: target.id, role: "admin" },
          { onConflict: "user_id,role" },
        )) as { error: { message: string } | null };

        if (roleErr) {
          console.warn("Mise à jour user_roles :", roleErr);
        }
        db.setAdmin(target.id);
        toast.success(
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />
            <span>
              Privilèges <strong>Admin</strong> accordés à {displayName} !
            </span>
          </div>,
        );
      } else {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("user_roles") as any)
          .delete()
          .eq("user_id", target.id)
          .eq("role", "admin");

        db.removeAdmin(target.id);
        toast.info(
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-amber-500" />
            <span>Privilèges Admin retirés à {displayName}.</span>
          </div>,
        );
      }

      await onRefresh();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erreur lors de la mise à jour des privilèges : " + msg);
    } finally {
      setTogglingUserId(null);
    }
  };

  // Change patrol
  const handleChangePatrol = async (userId: string, newPatrolId: string | null) => {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const res = (await (supabase.from("profiles") as any)
        .update({ patrol_id: newPatrolId })
        .eq("id", userId)) as { error: { message: string } | null };

      if (res?.error) {
        toast.error("Erreur mise à jour patrouille : " + res.error.message);
      } else {
        db.updateProfile(userId, { patrol_id: newPatrolId || undefined });
        toast.success("Patrouille mise à jour dans Supabase !");
        await onRefresh();
      }
    } catch {
      toast.error("Impossible de modifier la patrouille.");
    }
  };

  // Nommer un admin par email
  const handleAddAdminByEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    const mail = adminEmailInput.trim().toLowerCase();
    if (!mail) return;

    setAddingEmail(true);
    try {
      const { error } = await supabase.rpc("set_admin_by_email", {
        _email: mail,
        _make_admin: true,
      });

      const target = profiles.find((p) => p.email?.toLowerCase() === mail);
      if (target) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("profiles") as any).update({ is_admin: true }).eq("id", target.id);
        db.setAdmin(target.id);
      }

      if (error && !target) {
        toast.error(error.message);
      } else {
        toast.success(`${mail} est désormais administrateur !`);
        setAdminEmailInput("");
        await onRefresh();
      }
    } catch (err) {
      toast.error("Erreur d'attribution par email.");
    } finally {
      setAddingEmail(false);
    }
  };

  // Filter profiles
  const filteredProfiles = useMemo(() => {
    const filtered = profiles.filter((p) => {
      const isAdm = isUserAdmin(p);

      // Role filter
      if (roleFilter === "admins" && !isAdm) return false;
      if (roleFilter === "scouts" && isAdm) return false;

      // Patrol filter
      if (patrolFilter !== "all") {
        if (patrolFilter === "none" && p.patrol_id) return false;
        if (patrolFilter !== "none" && p.patrol_id !== patrolFilter) return false;
      }

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const matchesName = p.full_name?.toLowerCase().includes(q);
        const matchesEmail = p.email?.toLowerCase().includes(q);
        const matchesTotem = p.totem?.toLowerCase().includes(q);
        const matchesQuali = p.quali?.toLowerCase().includes(q);
        const patrolName = p.patrol_id ? patrolMap.get(p.patrol_id)?.name.toLowerCase() : "";
        const matchesPatrol = patrolName?.includes(q);
        return matchesName || matchesEmail || matchesTotem || matchesQuali || matchesPatrol;
      }

      return true;
    });

    return filtered.sort((a, b) => {
      const aIsNew = newMemberIds.includes(a.id);
      const bIsNew = newMemberIds.includes(b.id);
      if (aIsNew !== bIsNew) return aIsNew ? -1 : 1;

      const compareNullable = (
        left: string | null | undefined,
        right: string | null | undefined,
      ) => {
        if (!left && !right) return 0;
        if (!left) return 1;
        if (!right) return -1;
        return left.localeCompare(right, "fr", { sensitivity: "base" });
      };

      if (sortBy === "patrol") {
        const patrolOrder = compareNullable(
          a.patrol_id ? patrolMap.get(a.patrol_id)?.name : null,
          b.patrol_id ? patrolMap.get(b.patrol_id)?.name : null,
        );
        if (patrolOrder !== 0) return patrolOrder;
      } else if (sortBy === "totem") {
        const totemOrder = compareNullable(a.totem, b.totem);
        if (totemOrder !== 0) return totemOrder;
      }

      const nameOrder = compareNullable(a.full_name, b.full_name);
      return nameOrder || a.id.localeCompare(b.id);
    });
  }, [profiles, search, roleFilter, patrolFilter, patrolMap, isUserAdmin, sortBy, newMemberIds]);

  // Stats
  const totalCount = profiles.length;
  const adminCount = profiles.filter((p) => isUserAdmin(p)).length;
  const scoutCount = totalCount - adminCount;

  return (
    <div className="space-y-6">
      {/* Top Banner / Stats Cards */}
      <div className="grid grid-cols-3 gap-2 sm:gap-4">
        <div className="flex flex-col items-start gap-1 rounded-2xl border border-border/80 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4">
          <div className="hidden h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary sm:flex">
            <Users className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-foreground">{totalCount}</div>
            <div className="text-xs font-semibold text-muted-foreground">Membres</div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-1 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-3 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4">
          <div className="hidden h-12 w-12 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 sm:flex">
            <Shield className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-amber-800">{adminCount}</div>
            <div className="text-xs font-semibold text-amber-700">Admins</div>
          </div>
        </div>

        <div className="flex flex-col items-start gap-1 rounded-2xl border border-border/80 bg-card p-3 shadow-sm sm:flex-row sm:items-center sm:gap-4 sm:p-4">
          <div className="hidden h-12 w-12 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600 sm:flex">
            <UserCheck className="h-6 w-6" />
          </div>
          <div>
            <div className="text-2xl font-black text-foreground">{scoutCount}</div>
            <div className="text-xs font-semibold text-muted-foreground">Scouts</div>
          </div>
        </div>
      </div>

      {/* Quick Add Admin by Email Card */}
      <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="flex items-center gap-2 mb-3">
          <Shield className="h-4 w-4 text-primary" />
          <h3 className="font-display text-sm font-bold text-foreground">
            Nommer un administrateur par adresse e-mail
          </h3>
        </div>
        <form onSubmit={handleAddAdminByEmail} className="flex flex-col sm:flex-row gap-2.5">
          <div className="relative flex-1">
            <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="email"
              placeholder="scout.ou.chef@gmail.com"
              value={adminEmailInput}
              onChange={(e) => setAdminEmailInput(e.target.value)}
              className="pl-9 text-sm h-10 sm:h-9 sm:text-xs"
              required
            />
          </div>
          <Button
            type="submit"
            disabled={addingEmail}
            size="sm"
            className="font-bold text-xs gap-1.5 h-10 sm:h-9 shrink-0"
          >
            {addingEmail ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ShieldCheck className="h-3.5 w-3.5" />
            )}
            Accorder les droits Admin
          </Button>
        </form>
      </div>

      {/* Search & Filters Bar */}
      <div className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher par nom, totem, patrouille ou e-mail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm h-10 sm:h-9 sm:text-xs"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Filter Role */}
            <div className="flex w-full items-center rounded-lg border bg-muted/40 p-0.5 text-xs sm:w-auto">
              <button
                type="button"
                onClick={() => setRoleFilter("all")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-semibold transition-colors",
                  roleFilter === "all"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Tous ({totalCount})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("admins")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-semibold transition-colors",
                  roleFilter === "admins"
                    ? "bg-amber-500/20 text-amber-800 shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Admins ({adminCount})
              </button>
              <button
                type="button"
                onClick={() => setRoleFilter("scouts")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-semibold transition-colors",
                  roleFilter === "scouts"
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Scouts ({scoutCount})
              </button>
            </div>

            {/* Filter Patrol */}
            <Select value={patrolFilter} onValueChange={setPatrolFilter}>
              <SelectTrigger className="h-9 w-full text-xs sm:w-40">
                <SelectValue placeholder="Toutes patrouilles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes patrouilles</SelectItem>
                <SelectItem value="none">Sans patrouille</SelectItem>
                {patrols.map((pat) => (
                  <SelectItem key={pat.id} value={pat.id}>
                    {pat.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={sortBy} onValueChange={(value) => setSortBy(value as typeof sortBy)}>
              <SelectTrigger className="h-9 w-full text-xs sm:w-40" aria-label="Trier les membres">
                <ArrowUpDown className="mr-2 h-3.5 w-3.5" />
                <SelectValue placeholder="Trier par" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="patrol">Trier par patrouille</SelectItem>
                <SelectItem value="name">Trier par nom</SelectItem>
                <SelectItem value="totem">Trier par totem</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </div>

      {/* Users Table with Toggle Switch */}
      <div className="rounded-2xl border border-border/80 bg-card shadow-sm overflow-hidden">
        <div className="md:overflow-x-auto">
          <table className="block w-full text-left text-sm md:table">
            <thead className="hidden md:table-header-group">
              <tr className="border-b bg-muted/50 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                <th className="py-3 px-4">Membre / Scout</th>
                <th className="py-3 px-4">Patrouille assignée</th>
                <th className="py-3 px-4">Année / Statut</th>
                <th className="py-3 px-4 text-center">
                  <div className="inline-flex items-center gap-1.5 justify-center">
                    <Shield className="h-3.5 w-3.5 text-amber-600" />
                    <span>Statut Admin (is_admin)</span>
                  </div>
                </th>
              </tr>
            </thead>
            <tbody className="block divide-y divide-border/60 md:table-row-group">
              {filteredProfiles.length === 0 ? (
                <tr className="block md:table-row">
                  <td
                    colSpan={4}
                    className="block py-12 text-center text-muted-foreground md:table-cell"
                  >
                    <Users className="mx-auto h-8 w-8 text-muted-foreground/40 mb-2" />
                    <p className="font-semibold">Aucun membre ne correspond à vos filtres.</p>
                    <p className="text-xs mt-1">Modifiez vos termes de recherche.</p>
                  </td>
                </tr>
              ) : (
                filteredProfiles.map((p) => {
                  const isAdm = isUserAdmin(p);
                  const isMaster = p.email?.toLowerCase() === "baudeletgauthier@gmail.com";
                  const isCurrent = currentUserId === p.id || currentUserEmail === p.email;
                  const isBusy = togglingUserId === p.id;
                  const currentPatrol = p.patrol_id ? patrolMap.get(p.patrol_id) : null;

                  return (
                    <tr
                      key={p.id}
                      className={cn(
                        "grid grid-cols-[1fr_auto] gap-x-3 gap-y-2 p-4 hover:bg-muted/40 transition-colors md:table-row md:p-0",
                        isAdm && "bg-amber-500/[0.02]",
                      )}
                    >
                      {/* Member Info */}
                      <td className="col-span-2 block md:table-cell md:py-3.5 md:px-4">
                        <div className="flex items-center gap-3">
                          <div
                            className={cn(
                              "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl font-black text-sm",
                              isMaster
                                ? "bg-amber-500/20 text-amber-700 ring-2 ring-amber-500/30"
                                : isAdm
                                  ? "bg-amber-500/10 text-amber-700"
                                  : "bg-primary/10 text-primary",
                            )}
                          >
                            {p.totem ? (
                              p.totem.charAt(0).toUpperCase()
                            ) : p.full_name ? (
                              p.full_name.charAt(0).toUpperCase()
                            ) : (
                              <Users className="h-4 w-4" />
                            )}
                          </div>

                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-bold text-foreground truncate">
                                {p.full_name || "Sans nom"}
                              </span>
                              {isMaster && (
                                <Badge className="bg-amber-500/20 text-amber-700 border-amber-500/30 text-[9px] font-bold px-1.5 py-0">
                                  👑 Principal
                                </Badge>
                              )}
                              {isCurrent && !isMaster && (
                                <Badge
                                  variant="outline"
                                  className="text-[9px] px-1.5 py-0 font-medium"
                                >
                                  C'est vous
                                </Badge>
                              )}
                              {newMemberIds.includes(p.id) && (
                                <Badge className="border-emerald-500/30 bg-emerald-500/10 px-1.5 py-0 text-[9px] font-bold text-emerald-700">
                                  Nouveau
                                </Badge>
                              )}
                            </div>

                            <div className="text-xs text-muted-foreground flex items-center gap-2 mt-0.5">
                              {p.totem ? (
                                <span className="text-foreground/80 font-medium">
                                  {p.totem} {p.quali ? `• ${p.quali}` : ""}
                                </span>
                              ) : null}
                              <span className="truncate">{p.email || "Sans e-mail"}</span>
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Patrol Select */}
                      <td className="block md:table-cell md:py-3.5 md:px-4">
                        <Select
                          value={p.patrol_id || "none"}
                          onValueChange={(val) =>
                            handleChangePatrol(p.id, val === "none" ? null : val)
                          }
                        >
                          <SelectTrigger className="h-10 w-full text-xs font-semibold md:h-8 md:w-44">
                            <SelectValue placeholder="Choisir patrouille" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sans patrouille</SelectItem>
                            {patrols.map((pat) => (
                              <SelectItem key={pat.id} value={pat.id}>
                                {pat.name} (
                                {pat.category === "homme"
                                  ? "Garçons"
                                  : pat.category === "femme"
                                    ? "Filles"
                                    : "Staff"}
                                )
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>

                      {/* Scout Year / Role status */}
                      <td className="block self-center text-right md:table-cell md:py-3.5 md:px-4 md:text-left">
                        {p.is_chef || isStaffPatrol(currentPatrol) ? (
                          <Badge className="bg-amber-500/15 text-amber-700 text-[10px] font-bold">
                            Staff
                          </Badge>
                        ) : p.scout_year ? (
                          <span className="text-xs font-medium text-foreground">
                            {p.scout_year}
                            {p.scout_year === 1 ? "ère" : "e"} année
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                        {p.phone && (
                          <div className="text-[11px] text-muted-foreground mt-0.5">{p.phone}</div>
                        )}
                      </td>

                      {/* Toggle Switch column */}
                      <td className="col-span-2 block md:table-cell md:py-3.5 md:px-4 md:text-center">
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-muted/40 px-3 py-2 md:inline-flex md:flex-col md:justify-center md:gap-1.5 md:bg-transparent md:p-0">
                          <div className="flex items-center gap-2">
                            <Switch
                              id={`switch-admin-${p.id}`}
                              checked={isAdm}
                              disabled={isMaster || isBusy}
                              onCheckedChange={(checked) => handleToggleAdmin(p, checked)}
                              className="data-[state=checked]:bg-amber-500"
                              aria-label={`Attribuer ou révoquer les droits admin pour ${p.full_name || p.email}`}
                            />
                            {isBusy && <Loader2 className="h-3 w-3 animate-spin text-amber-600" />}
                          </div>

                          <label
                            htmlFor={`switch-admin-${p.id}`}
                            className={cn(
                              "text-[10px] font-bold cursor-pointer select-none",
                              isAdm ? "text-amber-700" : "text-muted-foreground",
                            )}
                          >
                            {isAdm ? "Administrateur" : "Scout standard"}
                          </label>

                          {(!isAdm || isCurrent) && (
                            <button
                              type="button"
                              onClick={() => handleResetPassword(p)}
                              className="rounded-md px-1 py-1 text-xs font-semibold text-primary hover:underline md:py-0 md:text-[10px]"
                            >
                              Réinitialiser le mot de passe
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
