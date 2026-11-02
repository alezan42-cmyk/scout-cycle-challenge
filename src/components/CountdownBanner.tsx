import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Clock, Edit3, Plus, Trash2, Calendar } from "lucide-react";
import { supabase } from "@/lib/supabase";
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
import { toast } from "sonner";

interface CountdownItem {
  id: string;
  title: string;
  subtitle: string | null;
  target_date: string;
  is_active: boolean;
}

interface TimeRemaining {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  isOver: boolean;
}

function calculateTimeRemaining(targetIso: string): TimeRemaining {
  if (!targetIso) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true };
  }
  const targetTime = new Date(targetIso).getTime();
  if (Number.isNaN(targetTime)) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true };
  }
  const diff = targetTime - Date.now();
  if (diff <= 0) {
    return { days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true };
  }
  return {
    days: Math.floor(diff / (1000 * 60 * 60 * 24)),
    hours: Math.floor((diff / (1000 * 60 * 60)) % 24),
    minutes: Math.floor((diff / (1000 * 60)) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    isOver: false,
  };
}

export function CountdownBanner({ isAdmin }: { isAdmin: boolean }) {
  const [countdowns, setCountdowns] = useState<CountdownItem[]>([]);
  const [activeCountdown, setActiveCountdown] = useState<CountdownItem | null>(null);
  const [time, setTime] = useState<TimeRemaining>({
    days: 0,
    hours: 0,
    minutes: 0,
    seconds: 0,
    isOver: true,
  });

  const [manageOpen, setManageOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formTitle, setFormTitle] = useState("");
  const [formSubtitle, setFormSubtitle] = useState("");
  const [formDate, setFormDate] = useState("2026-11-15T18:00");
  const [formActive, setFormActive] = useState(false);

  const fetchCountdowns = async () => {
    try {
      const { data, error } = await supabase
        .from("countdowns")
        .select("*")
        .order("target_date", { ascending: true });

      if (error) throw error;
      if (data && data.length > 0) {
        setCountdowns(data);
        const currentActive = data.find((c) => c.is_active) || data[0];
        setActiveCountdown(currentActive);
        setTime(calculateTimeRemaining(currentActive.target_date));
      }
    } catch (err) {
      console.warn("Erreur chargement comptes à rebours :", err);
    }
  };

  useEffect(() => {
    fetchCountdowns();
  }, []);

  useEffect(() => {
    if (!activeCountdown?.target_date) return;
    const interval = setInterval(() => {
      setTime(calculateTimeRemaining(activeCountdown.target_date));
    }, 1000);
    return () => clearInterval(interval);
  }, [activeCountdown?.target_date]);

  if (!activeCountdown || !activeCountdown.is_active) {
    return null;
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const payload = {
        title: formTitle.trim() || "Compte à rebours",
        subtitle: formSubtitle.trim() || null,
        target_date: new Date(formDate).toISOString(),
        is_active: formActive,
      };

      // Si actif, désactiver les autres par sécurité visuelle
      if (formActive) {
        await supabase
          .from("countdowns")
          .update({ is_active: false })
          .neq("id", editingId || "new");
      }

      if (editingId) {
        const { error } = await supabase.from("countdowns").update(payload).eq("id", editingId);
        if (error) throw error;
        toast.success("Compte à rebours mis à jour !");
      } else {
        const { error } = await supabase.from("countdowns").insert([payload]);
        if (error) throw error;
        toast.success("Nouveau compte à rebours créé !");
      }

      setManageOpen(false);
      fetchCountdowns();
    } catch (err: any) {
      toast.error("Erreur : " + (err.message || err));
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormTitle("");
    setFormSubtitle("");
    setFormDate("2026-11-15T18:00");
    setFormActive(true);
    setManageOpen(true);
  };

  const openEdit = (item: CountdownItem) => {
    setEditingId(item.id);
    setFormTitle(item.title);
    setFormSubtitle(item.subtitle || "");
    setFormDate(item.target_date ? item.target_date.slice(0, 16) : "2026-11-15T18:00");
    setFormActive(item.is_active);
    setManageOpen(true);
  };

  const handleDelete = async (id: string) => {
    if (confirm("Supprimer ce compte à rebours ?")) {
      const { error } = await supabase.from("countdowns").delete().eq("id", id);
      if (!error) {
        toast.success("Supprimé avec succès");
        fetchCountdowns();
      }
    }
  };

  const setActive = async (id: string) => {
    await supabase.from("countdowns").update({ is_active: false }).neq("id", id);
    await supabase.from("countdowns").update({ is_active: true }).eq("id", id);
    fetchCountdowns();
    toast.success("Compte à rebours actif mis à jour !");
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-[color:var(--countdown-accent)]/20 bg-[color:var(--countdown)] p-5 sm:p-6 text-white shadow-xl">
      <div className="pointer-events-none absolute -right-16 -top-16 h-48 w-48 rounded-full bg-[color:var(--countdown-accent)]/15 blur-3xl" />
      <div className="pointer-events-none absolute -left-16 -bottom-16 h-48 w-48 rounded-full bg-[color:var(--countdown-accent-2)]/10 blur-3xl" />

      <div className="relative z-10 flex flex-col items-center justify-between gap-5 lg:flex-row">
        <div className="text-center lg:text-left min-w-0 flex-1">
          <div className="inline-flex items-center gap-2 rounded-full bg-[color:var(--countdown-accent)]/20 border border-[color:var(--countdown-accent)]/30 px-3 py-1 text-xs font-bold uppercase tracking-wider text-[color:var(--countdown-accent-2)] backdrop-blur-sm">
            <Clock className="h-3.5 w-3.5 text-[color:var(--countdown-accent-2)]" />
            <span>Événement de la Troupe</span>
          </div>
          <h2 className="mt-2 text-xl font-black tracking-tight text-white sm:text-2xl lg:text-3xl">
            {activeCountdown.title}
          </h2>
          {activeCountdown.subtitle && (
            <p className="mt-1 max-w-xl text-xs sm:text-sm text-white/70">
              {activeCountdown.subtitle}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center lg:items-end gap-3 shrink-0">
          <div className="flex items-center justify-center gap-1.5 sm:gap-2.5 flex-nowrap">
            <TimeCard value={time.days} label="Jours" />
            <span className="font-display text-lg sm:text-2xl font-bold text-[color:var(--countdown-accent)] select-none shrink-0">
              :
            </span>
            <TimeCard value={time.hours} label="Heures" />
            <span className="font-display text-lg sm:text-2xl font-bold text-[color:var(--countdown-accent)] select-none shrink-0">
              :
            </span>
            <TimeCard value={time.minutes} label="Minutes" />
            <span className="font-display text-lg sm:text-2xl font-bold text-[color:var(--countdown-accent)] select-none shrink-0">
              :
            </span>
            <TimeCard value={time.seconds} label="Secondes" highlight />
          </div>

          {isAdmin && (
            <button
              onClick={openCreate}
              className="inline-flex items-center gap-1.5 rounded-lg border border-white/20 bg-black/40 px-3 py-1.5 text-xs font-semibold text-white/90 backdrop-blur transition hover:border-[color:var(--countdown-accent)] hover:bg-black/60 hover:text-white"
            >
              <Plus className="h-3.5 w-3.5 text-[color:var(--countdown-accent-2)]" />
              <span>Gérer / Créer des comptes à rebours</span>
            </button>
          )}
        </div>
      </div>

      {/* Modal de gestion / création */}
      <Dialog open={manageOpen} onOpenChange={setManageOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-primary" />
              Gestion des comptes à rebours
            </DialogTitle>
          </DialogHeader>

          {/* Liste des comptes à rebours existants */}
          <div className="space-y-3 py-2 border-b pb-4">
            <p className="text-xs font-bold text-muted-foreground uppercase">
              Comptes à rebours enregistrés
            </p>
            {countdowns.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between rounded-xl border p-3 bg-muted/20"
              >
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-foreground">{item.title}</span>
                    {item.is_active && (
                      <span className="text-[10px] bg-emerald-500/10 text-emerald-600 font-bold px-2 py-0.5 rounded">
                        Actif
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Fin : {new Date(item.target_date).toLocaleString("fr-FR")}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  {!item.is_active && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7"
                      onClick={() => setActive(item.id)}
                    >
                      Activer
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7"
                    onClick={() => openEdit(item)}
                  >
                    <Edit3 className="h-3.5 w-3.5" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-destructive"
                    onClick={() => handleDelete(item.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {/* Formulaire d'ajout ou modification */}
          <form onSubmit={handleSave} className="space-y-4 pt-2">
            <p className="text-xs font-bold text-primary">
              {editingId ? "Modifier l'élément" : "Ajouter un nouveau compte à rebours"}
            </p>
            <div>
              <Label htmlFor="cd-title" className="text-xs">
                Nom de l'événement
              </Label>
              <Input
                id="cd-title"
                value={formTitle}
                onChange={(e) => setFormTitle(e.target.value)}
                placeholder="Ex: Grand Camp d'été 2026"
                required
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="cd-sub" className="text-xs">
                Sous-titre (optionnel)
              </Label>
              <Input
                id="cd-sub"
                value={formSubtitle}
                onChange={(e) => setFormSubtitle(e.target.value)}
                placeholder="Ex: Départ de la gare de Moustier"
                className="mt-1 text-xs"
              />
            </div>
            <div>
              <Label htmlFor="cd-date" className="text-xs">
                Date et heure de fin
              </Label>
              <Input
                id="cd-date"
                type="datetime-local"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                required
                className="mt-1 text-xs"
              />
            </div>
            <div className="flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="cd-active"
                checked={formActive}
                onChange={(e) => setFormActive(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-primary focus:ring-ring"
              />
              <Label htmlFor="cd-active" className="cursor-pointer text-xs font-normal">
                Définir comme compte à rebours principal actif
              </Label>
            </div>
            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setManageOpen(false)}
              >
                Fermer
              </Button>
              <Button
                type="submit"
                size="sm"
                className="bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Enregistrer dans la base
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function TimeCard({
  value,
  label,
  highlight = false,
}: {
  value: number;
  label: string;
  highlight?: boolean;
}) {
  const safeVal = Number.isFinite(value) ? Math.max(0, value) : 0;
  return (
    <div
      className={`flex flex-col items-center justify-center rounded-xl border py-2 px-1.5 text-center backdrop-blur-md transition min-w-[56px] w-14 sm:min-w-[70px] sm:w-[72px] md:min-w-[76px] md:w-20 shrink-0 ${
        highlight
          ? "border-[color:var(--countdown-accent)]/60 bg-gradient-to-b from-[color:var(--countdown-accent)]/25 to-[color:var(--countdown-accent)]/40 text-white shadow-lg"
          : "border-white/15 bg-black/50 text-white"
      }`}
    >
      <span className="font-display text-xl sm:text-2xl md:text-3xl font-black tracking-tight leading-none text-white">
        {String(safeVal).padStart(2, "0")}
      </span>
      <span className="mt-1 text-[9px] sm:text-[10px] font-bold uppercase tracking-wider text-white/70 leading-none">
        {label}
      </span>
    </div>
  );
}
