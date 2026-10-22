import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  Calendar,
  ExternalLink,
  Plus,
  Trash2,
  Edit2,
  FolderOpen,
  Sparkles,
  Flag,
} from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export type TimelineEvent = {
  id: string;
  year: number;
  date_str: string; // Stockera la date précise (ex: "2026-07-14" ou format lisible)
  title: string;
  description: string;
  image_url: string | null;
  drive_url: string | null;
  tag: string;
  automatic?: boolean;
  milestoneKm?: number;
};

type DistanceMilestoneOverride = {
  milestone_km: number;
  title: string | null;
  description: string | null;
  date_str: string | null;
  is_hidden: boolean;
};

type ApprovedActivity = {
  id: string | null;
  user_id: string | null;
  km: number | null;
  ride_date: string | null;
  created_at: string | null;
};

const TIMELINE_PAGE_SIZE = 1000;
const DISTANCE_MILESTONE_KM = 1000;

async function fetchAllApprovedActivities(): Promise<ApprovedActivity[]> {
  const activities: ApprovedActivity[] = [];
  for (let from = 0; ; from += TIMELINE_PAGE_SIZE) {
    const { data, error } = await supabase
      .from("activities_public")
      .select("id,user_id,km,ride_date,created_at")
      .eq("status", "approved")
      .order("ride_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + TIMELINE_PAGE_SIZE - 1);
    if (error) throw error;
    const page = (data ?? []) as ApprovedActivity[];
    activities.push(...page);
    if (page.length < TIMELINE_PAGE_SIZE) return activities;
  }
}

function buildDistanceMilestones(
  activities: ApprovedActivity[],
  overrides: DistanceMilestoneOverride[],
): TimelineEvent[] {
  const events: TimelineEvent[] = [];
  const overrideByKm = new Map(overrides.map((override) => [override.milestone_km, override]));
  let total = 0;

  for (const activity of activities) {
    if (!activity.ride_date || !activity.km || activity.km <= 0) continue;
    const previous = total;
    const next = previous + activity.km;
    const firstMilestone = Math.floor(previous / DISTANCE_MILESTONE_KM) + 1;
    const lastMilestone = Math.floor(next / DISTANCE_MILESTONE_KM);
    for (let milestone = firstMilestone; milestone <= lastMilestone; milestone += 1) {
      const reachedKm = milestone * DISTANCE_MILESTONE_KM;
      const override = overrideByKm.get(reachedKm);
      if (override?.is_hidden) continue;
      const [yearText] = activity.ride_date.split("-");
      const dateStr = override?.date_str ?? activity.ride_date;
      const year = Number(dateStr.split("-")[0] || yearText);
      events.push({
        id: `troop-distance-milestone:${reachedKm}`,
        year,
        date_str: dateStr,
        title: override?.title ?? `La troupe franchit ${reachedKm.toLocaleString("fr-FR")} km`,
        description:
          override?.description ??
          `Les sorties validées de toute la troupe atteignent ${reachedKm.toLocaleString("fr-FR")} km cumulés.`,
        image_url: null,
        drive_url: null,
        tag: "Palier de la troupe",
        automatic: true,
        milestoneKm: reachedKm,
      });
    }
    total = next;
  }

  return events;
}

export const Route = createFileRoute("/timeline")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Timeline & Rétrospectives — ALEZAN 42" },
      {
        name: "description",
        content:
          "Retrace l'histoire, les camps d'été et les défis vélo des années précédentes de la troupe ALEZAN 42.",
      },
      { property: "og:title", content: "Timeline & Rétrospectives — ALEZAN 42" },
      {
        property: "og:description",
        content: "Retrouve les archives photos, albums Drive et souvenirs des patrouilles.",
      },
    ],
    links: [{ rel: "canonical", href: "https://alezan42-cycling.lesscoutsdemoustier.be/timeline" }],
  }),
  component: TimelinePage,
});

function TimelinePage() {
  const { isAdmin } = useAuth();
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedYear, setSelectedYear] = useState<string>("all");
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingMilestoneKm, setEditingMilestoneKm] = useState<number | null>(null);

  // Form state
  const [formDateStr, setFormDateStr] = useState(""); // Vraie date (YYYY-MM-DD)
  const [formTitle, setFormTitle] = useState("");
  const [formDescription, setFormDescription] = useState("");
  const [formImageUrl, setFormImageUrl] = useState("");
  const [formDriveUrl, setFormDriveUrl] = useState("");
  const [formTag, setFormTag] = useState("Défi Vélo");

  // Chargement strict depuis Supabase, trié par date précise (du plus récent au plus ancien ou inversement)
  const loadEvents = useCallback(async () => {
    setLoading(true);
    try {
      const [{ data, error }, activities, overrideResult] = await Promise.all([
        supabase.from("timeline").select("*").order("date_str", { ascending: false }),
        fetchAllApprovedActivities(),
        // La timeline historique reste utilisable pendant que la migration se déploie.
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (supabase.from("timeline_distance_milestone_overrides") as any).select(
          "milestone_km,title,description,date_str,is_hidden",
        ),
      ]);

      if (error) throw error;
      if (overrideResult.error)
        console.warn("Options des paliers de distance indisponibles:", overrideResult.error);
      setEvents(
        [
          ...buildDistanceMilestones(
            activities,
            (overrideResult.data ?? []) as DistanceMilestoneOverride[],
          ),
          ...((data ?? []) as TimelineEvent[]),
        ].sort((a, b) => b.date_str.localeCompare(a.date_str)),
      );
    } catch (err) {
      console.warn("Erreur réseau timeline :", err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  // Récupération dynamique des années uniques à partir des dates enregistrées
  const years = Array.from(
    new Set(events.map((e) => new Date(e.date_str).getFullYear().toString())),
  )
    .filter((y) => y !== "NaN")
    .sort((a, b) => Number(b) - Number(a));

  const filteredEvents = events.filter((e) => {
    if (selectedYear === "all") return true;
    const eventYear = new Date(e.date_str).getFullYear().toString();
    return eventYear === selectedYear;
  });

  const openCreateModal = () => {
    setEditingId(null);
    setEditingMilestoneKm(null);
    setFormDateStr(new Date().toISOString().split("T")[0]); // Date du jour par défaut
    setFormTitle("");
    setFormDescription("");
    setFormImageUrl("");
    setFormDriveUrl("");
    setFormTag("Défi Vélo");
    setModalOpen(true);
  };

  const openEditModal = (event: TimelineEvent) => {
    setEditingId(event.automatic ? null : event.id);
    setEditingMilestoneKm(event.milestoneKm ?? null);
    setFormDateStr(event.date_str);
    setFormTitle(event.title);
    setFormDescription(event.description);
    setFormImageUrl(event.image_url || "");
    setFormDriveUrl(event.drive_url || "");
    setFormTag(event.tag);
    setModalOpen(true);
  };

  const handleDelete = async (event: TimelineEvent) => {
    if (confirm("Supprimer cet événement de la ligne du temps ?")) {
      try {
        const result = event.milestoneKm
          ? await (supabase.from("timeline_distance_milestone_overrides") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
              .upsert({
                milestone_km: event.milestoneKm,
                is_hidden: true,
                updated_at: new Date().toISOString(),
              })
          : await supabase.from("timeline").delete().eq("id", event.id);
        const { error } = result;
        if (error) {
          toast.error("Erreur lors de la suppression : " + error.message);
        } else {
          toast.success("Souvenir supprimé");
          await loadEvents();
        }
      } catch (err) {
        console.warn("Supabase timeline delete error:", err);
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formTitle.trim()) {
      toast.error("Le titre est requis");
      return;
    }
    if (!formDateStr) {
      toast.error("La date précise est requise");
      return;
    }

    // Extraction automatique de l'année à partir de la date sélectionnée
    const extractedYear = new Date(formDateStr).getFullYear() || new Date().getFullYear();

    const payload = {
      year: extractedYear,
      date_str: formDateStr, // Enregistre la vraie date (ex: "2026-07-14")
      title: formTitle.trim(),
      description: formDescription.trim(),
      image_url: formImageUrl.trim() || null,
      drive_url: formDriveUrl.trim() || null,
      tag: formTag.trim() || "Événement",
    };

    if (editingMilestoneKm !== null) {
      const { error } = await (supabase.from("timeline_distance_milestone_overrides") as any) // eslint-disable-line @typescript-eslint/no-explicit-any
        .upsert({
          milestone_km: editingMilestoneKm,
          title: payload.title,
          description: payload.description,
          date_str: payload.date_str,
          is_hidden: false,
          updated_at: new Date().toISOString(),
        });
      if (error) toast.error("Erreur de mise à jour : " + error.message);
      else toast.success("Palier mis à jour !");
    } else if (editingId) {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("timeline") as any)
          .update(payload)
          .eq("id", editingId);
        if (error) {
          toast.error("Erreur de mise à jour : " + error.message);
        } else {
          toast.success("Souvenir mis à jour !");
        }
      } catch (err) {
        console.warn("Supabase timeline update warning:", err);
      }
    } else {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { error } = await (supabase.from("timeline") as any).insert(payload);
        if (error) {
          toast.error("Erreur d'ajout : " + error.message);
        } else {
          toast.success("Souvenir ajouté à la timeline !");
        }
      } catch (err) {
        console.warn("Supabase timeline insert warning:", err);
      }
    }
    setModalOpen(false);
    await loadEvents();
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header Banner */}
      <section className="relative overflow-hidden bg-bark py-14 text-bark-foreground md:py-20">
        <div className="pointer-events-none absolute -right-20 -top-20 h-72 w-72 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative mx-auto max-w-6xl px-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full bg-primary px-3 py-1 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
                <Flag className="h-3.5 w-3.5" />
                <span>Mémoire & Rétrospectives</span>
              </div>
              <h1 className="mt-3 text-3xl font-black md:text-5xl">
                La Ligne du Temps de la Troupe
              </h1>
              <p className="mt-2 max-w-xl text-base text-bark-foreground/80">
                Retrace l'histoire, les camps d'été et les défis vélo de l'ALEZAN 42 classés par
                date exacte.
              </p>
            </div>

            {isAdmin && (
              <div className="flex flex-wrap items-center gap-2 mt-4 sm:mt-0">
                <Button
                  onClick={openCreateModal}
                  className="gap-2 rounded-xl font-semibold shadow-md"
                >
                  <Plus className="h-4 w-4" />
                  Ajouter un souvenir
                </Button>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Main Content */}
      <main className="mx-auto max-w-5xl px-4 py-10">
        {/* Year Filters */}
        <div className="flex flex-wrap items-center gap-2 border-b pb-6">
          <span className="mr-2 text-xs font-bold uppercase tracking-wider text-muted-foreground">
            Filtrer par année :
          </span>
          <button
            onClick={() => setSelectedYear("all")}
            className={cn(
              "rounded-full border px-4 py-1.5 text-xs font-semibold transition-all",
              selectedYear === "all"
                ? "border-primary bg-primary text-primary-foreground shadow"
                : "border-border bg-card text-foreground hover:border-primary",
            )}
          >
            Toutes les années
          </button>
          {years.map((y) => (
            <button
              key={y}
              onClick={() => setSelectedYear(y)}
              className={cn(
                "rounded-full border px-4 py-1.5 text-xs font-semibold transition-all",
                selectedYear === y
                  ? "border-primary bg-primary text-primary-foreground shadow"
                  : "border-border bg-card text-foreground hover:border-primary",
              )}
            >
              {y}
            </button>
          ))}
        </div>

        {/* Timeline Content */}
        {loading ? (
          <div className="mt-10 text-center py-12 text-muted-foreground text-sm">
            Chargement de la ligne du temps...
          </div>
        ) : filteredEvents.length === 0 ? (
          <div className="mt-10 rounded-2xl border border-dashed border-border/80 bg-card/60 p-12 text-center">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
              <Calendar className="h-7 w-7" />
            </div>
            <h3 className="mt-4 font-display text-lg font-bold text-foreground">
              Aucun souvenir pour le moment
            </h3>
            <p className="mt-2 max-w-md mx-auto text-sm text-muted-foreground">
              La table Supabase `timeline` est vide. Ajoute ton premier événement pour l'afficher
              ici.
            </p>
            {isAdmin && (
              <div className="mt-6">
                <Button onClick={openCreateModal} className="gap-2 rounded-xl font-semibold shadow">
                  <Plus className="h-4 w-4" />
                  Ajouter le premier souvenir
                </Button>
              </div>
            )}
          </div>
        ) : (
          <div className="relative mt-10 space-y-10 before:absolute before:inset-0 before:left-4 before:h-full before:w-0.5 before:bg-border md:before:left-1/2 md:before:-translate-x-1/2">
            {filteredEvents.map((item, index) => {
              const isEven = index % 2 === 0;
              // Formatage joli de la date pour l'affichage (ex: "14 juillet 2026")
              const formattedDate = item.date_str
                ? new Date(item.date_str).toLocaleDateString("fr-FR", {
                    day: "numeric",
                    month: "long",
                    year: "numeric",
                  })
                : item.year.toString();

              return (
                <div
                  key={item.id}
                  className={cn(
                    "relative flex flex-col md:flex-row md:items-center",
                    isEven ? "md:flex-row-reverse" : "",
                  )}
                >
                  {/* Timeline node icon */}
                  <div className="absolute left-4 z-10 -ml-3.5 flex h-7 w-7 items-center justify-center rounded-full border-2 border-background bg-primary text-primary-foreground shadow-md md:left-1/2 md:-ml-3.5">
                    <Sparkles className="h-3.5 w-3.5" />
                  </div>

                  {/* Spacer for two-column desktop layout */}
                  <div className="hidden w-1/2 md:block" />

                  {/* Card Content */}
                  <div className="ml-10 w-auto md:ml-0 md:w-1/2 md:px-6">
                    <div className="group relative overflow-hidden rounded-2xl border border-border/80 bg-card p-5 shadow-sm transition hover:border-primary/50 hover:shadow-md">
                      {/* Image if available */}
                      {item.image_url && (
                        <div className="relative -mx-5 -mt-5 mb-4 h-52 overflow-hidden bg-muted">
                          <img
                            src={item.image_url}
                            alt={item.title}
                            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                          />
                          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
                          <span className="absolute bottom-3 left-4 rounded-full bg-black/60 px-3 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">
                            {item.tag}
                          </span>
                        </div>
                      )}

                      {/* Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 rounded-md bg-primary/10 px-2.5 py-1 text-xs font-bold text-primary">
                          <Calendar className="h-3 w-3" />
                          {formattedDate}
                        </span>
                        {!item.image_url && (
                          <span className="rounded-full bg-secondary px-2.5 py-0.5 text-[11px] font-semibold text-secondary-foreground">
                            {item.tag}
                          </span>
                        )}
                        {isAdmin && (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => openEditModal(item)}
                              className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                              title="Modifier"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                              onClick={() => handleDelete(item)}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              title="Supprimer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>

                      <h3 className="mt-3 font-display text-xl font-bold text-foreground">
                        {item.title}
                      </h3>

                      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                        {item.description}
                      </p>

                      {/* Drive Album Link */}
                      {item.drive_url && (
                        <div className="mt-4 pt-3 border-t">
                          <a
                            href={item.drive_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-2 rounded-lg bg-secondary px-3.5 py-2 text-xs font-semibold text-secondary-foreground transition hover:bg-primary hover:text-primary-foreground"
                          >
                            <FolderOpen className="h-4 w-4" />
                            Voir l'album photos & archives Drive
                            <ExternalLink className="h-3 w-3" />
                          </a>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>

      {/* Admin Event Dialog */}
      <Dialog open={modalOpen} onOpenChange={setModalOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingMilestoneKm !== null
                ? `Modifier le palier des ${editingMilestoneKm.toLocaleString("fr-FR")} km`
                : editingId
                  ? "Modifier le souvenir"
                  : "Ajouter un événement à la Ligne du Temps"}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSave} className="space-y-4 py-2">
            <div>
              <Label htmlFor="ev-date">Date précise de l'événement</Label>
              <Input
                id="ev-date"
                type="date"
                value={formDateStr}
                onChange={(e) => setFormDateStr(e.target.value)}
                required
                className="mt-1"
              />
              <p className="text-[11px] text-muted-foreground mt-1">
                L'année sera automatiquement détectée pour le tri et le filtre.
              </p>
            </div>

            <div>
              <Label htmlFor="ev-title">Titre de l'événement</Label>
              <Input
                id="ev-title"
                placeholder="Ex: Raid en Auvergne des Condors"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                required
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="ev-tag">Catégorie / Tag</Label>
              <Input
                id="ev-tag"
                placeholder="Ex: Camp d'été, Défi Vélo, Raid..."
                value={formTag}
                onChange={(e) => setFormTag(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="ev-desc">Récit / Description</Label>
              <Textarea
                id="ev-desc"
                rows={3}
                placeholder="Raconte les anecdotes, les vainqueurs, les kilomètres parcourus..."
                value={formDescription}
                onChange={(e) => setFormDescription(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="ev-img">Lien vers une photo (URL)</Label>
              <Input
                id="ev-img"
                placeholder="https://..."
                value={formImageUrl}
                onChange={(e) => setFormImageUrl(e.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="ev-drive">Lien vers le dossier Google Drive (optionnel)</Label>
              <Input
                id="ev-drive"
                placeholder="https://drive.google.com/..."
                value={formDriveUrl}
                onChange={(e) => setFormDriveUrl(e.target.value)}
                className="mt-1"
              />
            </div>

            <DialogFooter className="pt-4">
              <Button type="button" variant="outline" onClick={() => setModalOpen(false)}>
                Annuler
              </Button>
              <Button type="submit">
                {editingId || editingMilestoneKm !== null
                  ? "Mettre à jour"
                  : "Ajouter à la ligne du temps"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default TimelinePage;
