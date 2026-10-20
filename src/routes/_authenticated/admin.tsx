import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Check,
  X,
  Trash2,
  Clock,
  Shield,
  Users,
  Crown,
  ExternalLink,
  Plus,
  Calendar,
  Edit3,
  FileText,
  Award,
  Bell,
  Palette,
  BrushCleaning,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { approveActivity, rejectActivity } from "@/lib/proofStorage";
import {
  db,
  type Patrol,
  type Profile,
  type Activity,
  type TimelineEvent,
  getActivitySport,
  cleanActivityNote,
} from "@/lib/database";
import { AdminUserList } from "@/components/AdminUserList";
import { ExportDialog } from "@/components/ExportDialog";
import { CATEGORY_LABELS, type PatrolCategory, TROOP_STAFF_PATROL_NAME } from "@/lib/categories";
import { SeasonalThemeAdmin } from "@/components/SeasonalThemeAdmin";
import { CleanupAdmin } from "@/components/CleanupAdmin";
import { ScoutSportifAdmin, type SportifBadge } from "@/components/ScoutSportifAdmin";
import { SportBadge } from "@/components/SportIcon";
import { AdminActivitiesManager } from "@/components/AdminActivitiesManager";
import { AdminChallenges } from "@/components/AdminChallenges";
import { AdminDistanceAwards } from "@/components/AdminDistanceAwards";
import { ChallengesPanel } from "@/components/ChallengesPanel";
import { AdminAppNotifications } from "@/components/AdminAppNotifications";

const TAB_TRIGGER = "shrink-0 rounded-lg px-3 py-2 text-xs font-bold gap-1.5 md:py-1";

export const Route = createFileRoute("/_authenticated/admin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Administration — ALEZAN 42" },
      {
        name: "description",
        content: "Gestion des patrouilles, des membres et validation des sorties.",
      },
      { property: "og:title", content: "Administration — ALEZAN 42" },
      { property: "og:description", content: "Espace admin du défi vélo." },
    ],
  }),
  component: Admin,
});

type CountdownItem = {
  id: string;
  title: string;
  subtitle: string | null;
  target_date: string;
  is_active: boolean;
};

function Admin() {
  const { isAdmin, loading, user } = useAuth();
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [pending, setPending] = useState<Activity[]>([]);
  const [admins, setAdmins] = useState<string[]>([]);
  const [, setTimeline] = useState<TimelineEvent[]>([]);

  // New patrol form
  const [newPatrol, setNewPatrol] = useState({
    name: "",
    category: "homme" as "homme" | "femme" | "staff",
  });

  // Countdowns state
  const [countdowns, setCountdowns] = useState<CountdownItem[]>([]);
  const [editingCdId, setEditingCdId] = useState<string | null>(null);
  const [cdTitle, setCdTitle] = useState("");
  const [cdSubtitle, setCdSubtitle] = useState("");
  const [cdDate, setCdDate] = useState("2026-11-15T18:00");
  const [cdActive, setCdActive] = useState(false);

  // Badges state
  const [weeklyBadges, setWeeklyBadges] = useState<SportifBadge[]>([]);

  // Export PDF
  const [exportModalOpen, setExportModalOpen] = useState(false);

  const load = useCallback(async () => {
    // 1. Patrols
    const { data: ptData } = (await supabase.from("patrols").select("*").order("name")) as {
      data: Patrol[] | null;
    };
    const ptList = ptData && ptData.length > 0 ? ptData : db.getPatrols();
    setPatrols(ptList);

    const hasStaffInDb = ptData?.some(
      (p) => p.name.toLowerCase().includes("staff") || p.name.toLowerCase().includes("chef"),
    );
    if (!hasStaffInDb && ptData && ptData.length > 0) {
      supabase
        .from("patrols")
        .insert({ name: TROOP_STAFF_PATROL_NAME, category: "staff" })
        .then((res) => {
          if (!res.error) {
            supabase
              .from("patrols")
              .select("*")
              .order("name")
              .then((fresh) => {
                const fData = (fresh as { data: Patrol[] | null }).data;
                if (fData) setPatrols(fData);
              });
          }
        });
    }

    // 2. Profiles
    const { data: prData } = (await supabase.from("profiles").select("*")) as {
      data: Profile[] | null;
    };
    setProfiles(prData || []);

    // 3. Pending activities
    const { data: actData } = (await supabase
      .from("activities")
      .select("*")
      .eq("status", "pending")
      .order("created_at", { ascending: false })) as { data: Activity[] | null };
    setPending(actData || []);

    // 4. Badges history
    // (pas de jointure : weekly_badges.user_id pointe vers auth.users, pas vers profiles)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bgData } = await (supabase.from("weekly_badges") as any)
      .select("*")
      .order("awarded_date", { ascending: false });
    setWeeklyBadges((bgData as SportifBadge[] | null) ?? []);

    // 5. Admins
    const { data: rolesData } = (await supabase
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin")) as { data: Array<{ user_id: string }> | null };
    if (rolesData && rolesData.length > 0) {
      setAdmins(rolesData.map((r: { user_id: string }) => r.user_id));
    } else {
      setAdmins(db.getAdmins());
    }

    try {
      const { data: tlData } = await supabase
        .from("timeline")
        .select("*")
        .order("year", { ascending: false });
      if (tlData && tlData.length > 0) {
        setTimeline(tlData as unknown as TimelineEvent[]);
      } else {
        setTimeline(db.getTimeline());
      }
    } catch {
      setTimeline(db.getTimeline());
    }

    // 6. Countdowns from Supabase
    try {
      const { data: cdData } = await supabase
        .from("countdowns")
        .select("*")
        .order("target_date", { ascending: true });
      if (cdData) {
        setCountdowns(cdData);
      }
    } catch (err) {
      console.warn("Erreur chargement countdowns :", err);
    }
  }, []);

  useEffect(() => {
    load();
    return db.subscribe(load);
  }, [load]);

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <div className="flex h-64 items-center justify-center">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-primary border-t-transparent" />
        </div>
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background">
        <main className="mx-auto max-w-md px-4 py-20 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-destructive/10 text-destructive mb-4">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="font-display text-2xl font-black text-foreground">
            Accès réservé aux chefs et admins
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Connecte-toi avec le compte administrateur pour gérer la troupe.
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Button asChild>
              <Link to="/auth">Connexion Admin</Link>
            </Button>
            <Button variant="outline" asChild>
              <Link to="/">Retour au classement</Link>
            </Button>
          </div>
        </main>
      </div>
    );
  }

  const approveAct = async (act: Activity) => {
    const { error } = await approveActivity(act.id);
    if (error) {
      toast.error("Erreur : " + error);
    } else {
      db.updateActivityStatus(act.id, "approved");
      toast.success("Sortie validée et photo de preuve supprimée.");
    }
    load();
  };

  const rejectAct = async (act: Activity) => {
    const { error } = await rejectActivity(act.id);
    if (error) {
      toast.error("Erreur : " + error);
    } else {
      db.updateActivityStatus(act.id, "rejected");
      toast.error("Sortie refusée.");
    }
    load();
  };

  const createPatrol = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPatrol.name.trim()) return;
    const cat = newPatrol.category;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const res = (await (supabase.from("patrols") as any).insert({
      name: newPatrol.name.trim(),
      category: cat,
    })) as { error: { message: string } | null };
    db.addPatrol(newPatrol.name.trim(), newPatrol.category);
    if (res?.error) {
      toast.error("Erreur : " + res.error.message);
    } else {
      toast.success(`Patrouille "${newPatrol.name}" créée !`);
    }
    setNewPatrol({ name: "", category: "homme" });
    load();
  };

  const deletePatrol = async (id: string, name: string) => {
    if (confirm(`Supprimer la patrouille "${name}" ?`)) {
      const res = (await supabase.from("patrols").delete().eq("id", id)) as {
        error: { message: string } | null;
      };
      db.deletePatrol(id);
      if (res?.error) {
        toast.error("Erreur : " + res.error.message);
      } else {
        toast.success("Patrouille supprimée");
      }
      load();
    }
  };

  const handleSaveCountdown = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        title: cdTitle.trim() || "Événement",
        subtitle: cdSubtitle.trim() || null,
        target_date: new Date(cdDate).toISOString(),
        is_active: cdActive,
      };

      if (cdActive) {
        await supabase
          .from("countdowns")
          .update({ is_active: false })
          .neq("id", editingCdId || "new");
      }

      if (editingCdId) {
        const { error } = await supabase.from("countdowns").update(payload).eq("id", editingCdId);
        if (error) throw error;
        toast.success("Compte à rebours mis à jour !");
      } else {
        const { error } = await supabase.from("countdowns").insert([payload]);
        if (error) throw error;
        toast.success("Nouveau compte à rebours ajouté !");
      }

      setEditingCdId(null);
      setCdTitle("");
      setCdSubtitle("");
      setCdDate("2026-11-15T18:00");
      setCdActive(false);
      load();
    } catch (err: unknown) {
      toast.error("Erreur : " + (err instanceof Error ? err.message : String(err)));
    }
  };

  const startEditCountdown = (item: CountdownItem) => {
    setEditingCdId(item.id);
    setCdTitle(item.title);
    setCdSubtitle(item.subtitle || "");
    setCdDate(item.target_date ? item.target_date.slice(0, 16) : "2026-11-15T18:00");
    setCdActive(item.is_active);
  };

  const deleteCountdown = async (id: string) => {
    if (confirm("Supprimer ce compte à rebours ?")) {
      const { error } = await supabase.from("countdowns").delete().eq("id", id);
      if (!error) {
        toast.success("Supprimé avec succès");
        load();
      }
    }
  };

  const setActiveCountdown = async (id: string) => {
    await supabase.from("countdowns").update({ is_active: false }).neq("id", id);
    await supabase.from("countdowns").update({ is_active: true }).eq("id", id);
    toast.success("Compte à rebours principal mis à jour !");
    load();
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-6xl px-4 py-5 md:py-12 space-y-5 md:space-y-8">
        <div className="flex items-start justify-between gap-3 sm:items-center">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
              <Shield className="h-3.5 w-3.5" />
              <span>Panneau d'Administration</span>
            </div>
            <h1 className="mt-2 font-display text-xl font-black text-foreground sm:text-3xl">
              Gestion de l'ALEZAN 42
            </h1>
            <p className="hidden text-xs text-muted-foreground sm:block">
              Valide les kilomètres, configure les badges de la semaine et organise les patrouilles
            </p>
          </div>

          <Button
            onClick={() => setExportModalOpen(true)}
            className="gap-2 font-bold bg-primary text-primary-foreground shadow-md hover:bg-primary/90 shrink-0"
            aria-label="Exporter en PDF"
          >
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Exporter en PDF</span>
            <span className="sm:hidden">PDF</span>
          </Button>
        </div>

        <Tabs defaultValue="validations" className="space-y-5 md:space-y-6">
          {/* Mobile : une seule ligne qui défile, collée sous l'en-tête ; ordinateur : 6 colonnes */}
          <TabsList className="sticky top-[58px] z-30 -mx-4 flex h-auto w-[calc(100%+2rem)] justify-start gap-1 overflow-x-auto rounded-none border-b bg-muted/95 p-1.5 backdrop-blur [scrollbar-width:none] md:static md:mx-0 md:grid md:w-full md:grid-cols-9 md:rounded-xl md:border-0 md:p-1 [&::-webkit-scrollbar]:hidden">
            <TabsTrigger value="validations" className={TAB_TRIGGER}>
              <Check className="h-4 w-4" />
              Sorties ({pending.length})
            </TabsTrigger>
            <TabsTrigger value="badges" className={TAB_TRIGGER}>
              <Award className="h-4 w-4" />
              Scout sportif ({weeklyBadges.filter((b) => b.week_start).length})
            </TabsTrigger>
            <TabsTrigger value="challenges" className={TAB_TRIGGER}>
              <Award className="h-4 w-4" />
              Défis & trophées
            </TabsTrigger>
            <TabsTrigger value="countdown" className={TAB_TRIGGER}>
              <Clock className="h-4 w-4" />
              Comptes à rebours
            </TabsTrigger>
            <TabsTrigger value="notifications" className={TAB_TRIGGER}>
              <Bell className="h-4 w-4" />
              Notifications
            </TabsTrigger>
            <TabsTrigger value="patrols" className={TAB_TRIGGER}>
              <Crown className="h-4 w-4" />
              Patrouilles ({patrols.length})
            </TabsTrigger>
            <TabsTrigger value="scouts" className={TAB_TRIGGER}>
              <Users className="h-4 w-4" />
              Membres ({profiles.length})
            </TabsTrigger>
            <TabsTrigger value="fetes" className={TAB_TRIGGER}>
              <Palette className="h-4 w-4" />
              Fêtes
            </TabsTrigger>
            <TabsTrigger value="menage" className={TAB_TRIGGER}>
              <BrushCleaning className="h-4 w-4" />
              Ménage
            </TabsTrigger>
          </TabsList>

          {/* Tab 1: Pending Validations */}
          <TabsContent value="validations" className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-bold text-foreground">
                Sorties en attente de validation ({pending.length})
              </h2>
            </div>

            {pending.length === 0 ? (
              <div className="rounded-2xl border bg-card p-12 text-center text-muted-foreground">
                <Check className="mx-auto h-8 w-8 text-emerald-500 mb-2" />
                <p className="font-semibold text-foreground">Toutes les sorties sont à jour !</p>
              </div>
            ) : (
              <div className="space-y-3">
                {pending.map((act) => {
                  const scout = profiles.find((p) => p.id === act.user_id);
                  const patrol = patrols.find((p) => p.id === scout?.patrol_id);

                  return (
                    <div
                      key={act.id}
                      className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-4 sm:flex-row sm:items-center sm:justify-between shadow-sm"
                    >
                      <div className="flex items-center gap-4">
                        <span className="grid h-14 w-14 shrink-0 place-items-center rounded-xl bg-primary/10 font-display text-xl font-black text-primary">
                          {Number(act.km).toFixed(1)}
                          <span className="text-[10px] font-normal text-muted-foreground">km</span>
                        </span>

                        <div>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-foreground">
                              {scout?.totem || scout?.full_name || "Scout inconnu"}
                            </span>
                            <Badge variant="outline" className="text-[10px]">
                              {patrol?.name || "Sans patrouille"}
                            </Badge>
                            <SportBadge sport={getActivitySport(act)} />
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            Sortie du {new Date(act.ride_date).toLocaleDateString("fr-FR")} •{" "}
                            {cleanActivityNote(act.note) || "Sortie"}
                          </p>
                          {act.created_at &&
                            Date.now() - Date.parse(act.created_at) > 30 * 864e5 && (
                              <p className="mt-1 text-[11px] font-semibold text-amber-700 dark:text-amber-400">
                                ⚠️ En attente depuis plus de 30 jours : supprimée automatiquement le{" "}
                                {new Date(
                                  Date.parse(act.created_at) + 60 * 864e5,
                                ).toLocaleDateString("fr-BE")}
                              </p>
                            )}
                          {act.proof_path && (
                            <div className="mt-2 hidden sm:block">
                              <a
                                href={act.proof_path}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
                              >
                                Voir la photo de preuve
                                <ExternalLink className="h-3 w-3" />
                              </a>
                            </div>
                          )}
                          {act.strava_link && (
                            <a
                              href={act.strava_link}
                              target="_blank"
                              rel="noreferrer"
                              className="mt-2 inline-flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline"
                            >
                              Ouvrir sur Strava
                              <ExternalLink className="h-3 w-3" />
                            </a>
                          )}
                        </div>
                      </div>

                      {act.proof_path && (
                        <a
                          href={act.proof_path}
                          target="_blank"
                          rel="noreferrer"
                          className="block overflow-hidden rounded-xl border sm:hidden"
                          aria-label="Agrandir la photo de preuve"
                        >
                          <img
                            src={act.proof_path}
                            alt="Photo de preuve"
                            loading="lazy"
                            className="max-h-44 w-full bg-muted object-contain"
                          />
                        </a>
                      )}

                      <div className="grid grid-cols-2 gap-2 sm:flex sm:items-center sm:self-center">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => rejectAct(act)}
                          className="h-11 gap-1 text-destructive hover:bg-destructive/10 border-destructive/30 sm:h-8"
                        >
                          <X className="h-4 w-4" />
                          Refuser
                        </Button>
                        <Button
                          size="sm"
                          onClick={() => approveAct(act)}
                          className="h-11 gap-1 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold sm:h-8"
                        >
                          <Check className="h-4 w-4" />
                          Valider les km
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <AdminActivitiesManager reloadKey={pending.length} onChanged={load} />
          </TabsContent>

          {/* Tab 2: Scout sportif du mois */}
          <TabsContent value="badges" className="space-y-6">
            <ScoutSportifAdmin
              profiles={profiles}
              patrols={patrols}
              badges={weeklyBadges}
              onChanged={load}
            />
          </TabsContent>

          <TabsContent value="challenges" className="space-y-6">
            <h2 className="font-display text-lg font-bold">Créer un défi</h2>
            <ChallengesPanel />
            <h2 className="font-display text-lg font-bold">
              Gérer les défis en cours et les validations
            </h2>
            <AdminChallenges />
            <h2 className="font-display text-lg font-bold">Trophées et paliers de distance</h2>
            <AdminDistanceAwards />
          </TabsContent>

          {/* Tab 3: Countdowns Management */}
          <TabsContent value="countdown" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                <div className="flex items-center gap-2 border-b pb-4">
                  <Clock className="h-5 w-5 text-primary" />
                  <div>
                    <h2 className="font-display text-lg font-bold text-foreground">
                      {editingCdId ? "Modifier le compte à rebours" : "Ajouter un compte à rebours"}
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Gère les échéances importantes de la troupe
                    </p>
                  </div>
                </div>

                <form onSubmit={handleSaveCountdown} className="mt-4 space-y-4">
                  <div>
                    <Label htmlFor="cd-title">Nom de l'événement</Label>
                    <Input
                      id="cd-title"
                      value={cdTitle}
                      onChange={(e) => setCdTitle(e.target.value)}
                      placeholder="Ex: Grand Camp d'été 2026"
                      required
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="cd-sub">Sous-titre (optionnel)</Label>
                    <Input
                      id="cd-sub"
                      value={cdSubtitle}
                      onChange={(e) => setCdSubtitle(e.target.value)}
                      placeholder="Ex: Rassemblement final"
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label htmlFor="cd-date">Date et heure de fin</Label>
                    <Input
                      id="cd-date"
                      type="datetime-local"
                      value={cdDate}
                      onChange={(e) => setCdDate(e.target.value)}
                      required
                      className="mt-1"
                    />
                  </div>

                  <div className="flex items-center gap-2 pt-2">
                    <input
                      type="checkbox"
                      id="cd-active"
                      checked={cdActive}
                      onChange={(e) => setCdActive(e.target.checked)}
                      className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <Label htmlFor="cd-active" className="cursor-pointer text-sm font-normal">
                      Définir comme actif sur l'accueil
                    </Label>
                  </div>

                  <div className="flex gap-2 pt-2">
                    {editingCdId && (
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => {
                          setEditingCdId(null);
                          setCdTitle("");
                          setCdSubtitle("");
                          setCdDate("2026-11-15T18:00");
                          setCdActive(false);
                        }}
                      >
                        Annuler
                      </Button>
                    )}
                    <Button
                      type="submit"
                      className="font-bold bg-primary text-primary-foreground flex-1"
                    >
                      {editingCdId ? "Mettre à jour" : "Créer l'élément"}
                    </Button>
                  </div>
                </form>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                <h2 className="font-display text-lg font-bold text-foreground border-b pb-3 flex items-center justify-between">
                  <span>Liste des échéances ({countdowns.length})</span>
                </h2>

                <div className="mt-4 space-y-3 max-h-[400px] overflow-y-auto pr-1">
                  {countdowns.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-6">
                      Aucun compte à rebours configuré.
                    </p>
                  ) : (
                    countdowns.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-xl border p-3 bg-muted/20 hover:bg-muted/40 transition"
                      >
                        <div className="space-y-0.5 pr-2">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-xs text-foreground">{item.title}</span>
                            {item.is_active && (
                              <Badge className="bg-emerald-500/15 text-emerald-600 text-[10px] font-bold">
                                Actif
                              </Badge>
                            )}
                          </div>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                            <Calendar className="h-3 w-3" />
                            {new Date(item.target_date).toLocaleString("fr-FR")}
                          </p>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          {!item.is_active && (
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-[11px] h-7 px-2"
                              onClick={() => setActiveCountdown(item.id)}
                            >
                              Activer
                            </Button>
                          )}
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-primary"
                            onClick={() => startEditCountdown(item)}
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteCountdown(item.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="notifications" className="space-y-6">
            <AdminAppNotifications />
          </TabsContent>

          {/* Tab 4: Patrols Management */}
          <TabsContent value="patrols" className="space-y-6">
            <div className="grid gap-6 md:grid-cols-2">
              <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                <h2 className="font-display text-lg font-bold text-foreground border-b pb-3">
                  Ajouter une patrouille
                </h2>

                <form onSubmit={createPatrol} className="mt-4 space-y-4">
                  <div>
                    <Label htmlFor="patrol-name">Nom de la patrouille</Label>
                    <Input
                      id="patrol-name"
                      placeholder="Ex: Cerfs, Alouettes..."
                      value={newPatrol.name}
                      onChange={(e) => setNewPatrol({ ...newPatrol, name: e.target.value })}
                      required
                      className="mt-1"
                    />
                  </div>

                  <div>
                    <Label>Catégorie</Label>
                    <Select
                      value={newPatrol.category}
                      onValueChange={(v: "homme" | "femme" | "staff") =>
                        setNewPatrol({ ...newPatrol, category: v })
                      }
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="homme">Garçons</SelectItem>
                        <SelectItem value="femme">Filles</SelectItem>
                        <SelectItem value="staff">👑 Staff</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <Button type="submit" className="font-bold bg-primary text-primary-foreground">
                    <Plus className="mr-1.5 h-4 w-4" />
                    Créer la patrouille
                  </Button>
                </form>
              </div>

              <div className="rounded-2xl border border-border/80 bg-card p-6 shadow-sm">
                <h2 className="font-display text-lg font-bold text-foreground border-b pb-3">
                  Patrouilles actives ({patrols.length})
                </h2>
                <div className="mt-4 space-y-2 max-h-96 overflow-y-auto pr-1">
                  {patrols.map((p) => {
                    const count = profiles.filter((m) => m.patrol_id === p.id).length;
                    return (
                      <div
                        key={p.id}
                        className="flex items-center justify-between rounded-xl border p-3 hover:bg-accent/30 transition"
                      >
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-sm text-foreground">{p.name}</span>
                            <Badge variant="secondary" className="text-[10px]">
                              {CATEGORY_LABELS[p.category as PatrolCategory] ?? p.category}
                            </Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {count} scout{count > 1 ? "s" : ""}
                          </span>
                        </div>

                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => deletePatrol(p.id, p.name)}
                          className="text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </TabsContent>

          {/* Tab 5: Scouts & Roles */}
          <TabsContent value="scouts" className="space-y-6">
            <AdminUserList
              profiles={profiles}
              patrols={patrols}
              admins={admins}
              onRefresh={load}
              currentUserId={user?.id}
              currentUserEmail={user?.email}
            />
          </TabsContent>

          {/* Tab 6: Thème de fête */}
          <TabsContent value="fetes" className="space-y-6">
            <SeasonalThemeAdmin profiles={profiles} patrols={patrols} onRefresh={load} />
          </TabsContent>

          <TabsContent value="menage" className="space-y-6">
            <CleanupAdmin />
          </TabsContent>
        </Tabs>
      </main>

      {/* MODALE D'EXPORT PDF */}
      <ExportDialog open={exportModalOpen} onOpenChange={setExportModalOpen} patrols={patrols} />
    </div>
  );
}

export default Admin;
