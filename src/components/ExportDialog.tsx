import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Download, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { getActivitySport, type Patrol } from "@/lib/database";
import { isStaffPatrol } from "@/lib/categories";
import {
  generatePdf,
  formatDateSlash,
  PROFILE_FIELDS,
  TYPE_LABELS,
  type ActivityRow,
  type ExportType,
  type ProfileFieldKey,
} from "@/lib/exportPdf";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patrols: Patrol[];
};

type SportFilter = "all" | "velo" | "course" | "marche";
type StatusFilter = "approved" | "pending" | "rejected" | "all";

const STATUS_LABELS: Record<StatusFilter, string> = {
  approved: "Sorties validées",
  pending: "Sorties en attente",
  rejected: "Sorties refusées",
  all: "Tous statuts",
};

const SPORT_LABELS: Record<SportFilter, string> = {
  all: "Tous sports",
  velo: "Vélo",
  course: "Course",
  marche: "Marche",
};

/** Supabase limite chaque requête à 1000 lignes : on lit page par page. */
async function fetchAllPages<T>(
  build: (
    from: number,
    to: number,
  ) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const size = 1000;
  const out: T[] = [];
  for (let from = 0; ; from += size) {
    const { data, error } = await build(from, from + size - 1);
    if (error) throw new Error(error.message);
    out.push(...(data ?? []));
    if (!data || data.length < size) break;
  }
  return out;
}

export function ExportDialog({ open, onOpenChange, patrols }: Props) {
  const [type, setType] = useState<ExportType>("sorties");
  const [patrolFilter, setPatrolFilter] = useState<string>("all");
  const [customLabel, setCustomLabel] = useState("");
  const [busy, setBusy] = useState(false);

  // Filtres "sorties"
  const [sport, setSport] = useState<SportFilter>("all");
  const [status, setStatus] = useState<StatusFilter>("approved");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [withRecap, setWithRecap] = useState(true);
  const nonStaffPatrolIds = useMemo(
    () => new Set(patrols.filter((patrol) => !isStaffPatrol(patrol)).map((patrol) => patrol.id)),
    [patrols],
  );

  const matchesPatrolFilter = (patrolId?: string | null) => {
    if (patrolFilter === "all") return true;
    if (patrolFilter === "non-staff") return !!patrolId && nonStaffPatrolIds.has(patrolId);
    return patrolId === patrolFilter;
  };

  // Champs "profils"
  const [fields, setFields] = useState<Record<ProfileFieldKey, boolean>>({
    nom: true,
    totem: true,
    email: true,
    telephone: true,
    patrouille: true,
    annee: true,
    strava: false,
  });

  const patrolLabel =
    patrolFilter === "all"
      ? "Toutes les patrouilles"
      : patrolFilter === "non-staff"
        ? "Patrouilles non-staff uniquement"
        : `Patrouille : ${patrols.find((p) => p.id === patrolFilter)?.name ?? "?"}`;

  const titlePreview = useMemo(
    () =>
      [formatDateSlash(new Date()), TYPE_LABELS[type], customLabel.trim()]
        .filter(Boolean)
        .join(" - "),
    [type, customLabel],
  );

  const handleExport = async () => {
    setBusy(true);
    try {
      // Les données sont relues dans Supabase au moment du clic :
      // le PDF reflète toujours l'état actuel de la base.
      if (type === "sorties") {
        const all = await fetchAllPages<ActivityRow>((from, to) => {
          let q = supabase
            .from("activities")
            .select("*, profiles(full_name, totem, patrol_id)")
            .order("ride_date", { ascending: false })
            .order("id");
          if (status !== "all") q = q.eq("status", status);
          if (dateFrom) q = q.gte("ride_date", dateFrom);
          if (dateTo) q = q.lte("ride_date", dateTo);
          return q.range(from, to) as unknown as PromiseLike<{
            data: ActivityRow[] | null;
            error: { message: string } | null;
          }>;
        });

        const rows = all.filter((r) => {
          if (!matchesPatrolFilter(r.profiles?.patrol_id)) return false;
          if (sport !== "all" && getActivitySport(r as never) !== sport) return false;
          return true;
        });

        if (rows.length === 0) {
          toast.error("Aucune sortie ne correspond à ces filtres.");
          return;
        }

        const period =
          dateFrom || dateTo
            ? `période : ${dateFrom ? `du ${formatDateSlash(dateFrom)}` : "début"} au ${formatDateSlash(dateTo || new Date())}`
            : "toute la période";

        const filename = await generatePdf({
          type: "sorties",
          rows,
          patrols,
          withPatrolRecap: withRecap,
          customLabel,
          filtersLabel: [patrolLabel, SPORT_LABELS[sport], STATUS_LABELS[status], period].join(
            " · ",
          ),
        });
        toast.success(`PDF téléchargé : ${filename}`);
      } else {
        const selected = (Object.keys(fields) as ProfileFieldKey[]).filter((k) => fields[k]);
        if (selected.length === 0) {
          toast.error("Coche au moins une information à inclure.");
          return;
        }

        const all = await fetchAllPages<any>((from, to) =>
          supabase.from("profiles").select("*").order("id").range(from, to),
        );
        const rows = all.filter((p) => matchesPatrolFilter(p.patrol_id));

        if (rows.length === 0) {
          toast.error("Aucun membre ne correspond à ce filtre.");
          return;
        }

        const filename = await generatePdf({
          type: "profils",
          rows,
          patrols,
          fields: selected,
          customLabel,
          filtersLabel: patrolLabel,
        });
        toast.success(`PDF téléchargé : ${filename}`);
      }
      onOpenChange(false);
    } catch (err: any) {
      toast.error("Erreur lors de la génération : " + (err?.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5 text-primary" />
            Exporter en PDF
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-bold">Que veux-tu exporter ?</Label>
            <Select value={type} onValueChange={(v) => setType(v as ExportType)}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sorties">Tableau des sorties (km & activités)</SelectItem>
                <SelectItem value="profils">Liste des membres (infos au choix)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label className="text-xs font-bold">Patrouille</Label>
            <Select value={patrolFilter} onValueChange={setPatrolFilter}>
              <SelectTrigger className="mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Toutes les patrouilles</SelectItem>
                <SelectItem value="non-staff">Patrouilles non-staff uniquement</SelectItem>
                {patrols.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {type === "sorties" ? (
            <div className="space-y-4 border-t pt-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold">Sport</Label>
                  <Select value={sport} onValueChange={(v) => setSport(v as SportFilter)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Tous</SelectItem>
                      <SelectItem value="velo">Vélo</SelectItem>
                      <SelectItem value="course">Course</SelectItem>
                      <SelectItem value="marche">Marche</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-bold">Statut</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as StatusFilter)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Validées</SelectItem>
                      <SelectItem value="pending">En attente</SelectItem>
                      <SelectItem value="rejected">Refusées</SelectItem>
                      <SelectItem value="all">Tous</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="exp-from" className="text-xs font-bold">
                    Du
                  </Label>
                  <Input
                    id="exp-from"
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label htmlFor="exp-to" className="text-xs font-bold">
                    Au
                  </Label>
                  <Input
                    id="exp-to"
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={withRecap}
                  onChange={(e) => setWithRecap(e.target.checked)}
                  className="rounded border-gray-300 text-primary focus:ring-primary"
                />
                <span>Ajouter le récapitulatif par patrouille (classement)</span>
              </label>
            </div>
          ) : (
            <div className="space-y-2 border-t pt-4">
              <Label className="text-xs font-bold">Informations à inclure :</Label>
              <div className="grid grid-cols-2 gap-2 text-xs">
                {PROFILE_FIELDS.map((f) => (
                  <label key={f.key} className="flex cursor-pointer items-center gap-2">
                    <input
                      type="checkbox"
                      checked={fields[f.key]}
                      onChange={(e) => setFields({ ...fields, [f.key]: e.target.checked })}
                      className="rounded border-gray-300 text-primary focus:ring-primary"
                    />
                    <span>{f.label}</span>
                  </label>
                ))}
              </div>
              <p className="pt-1 text-[11px] text-muted-foreground">
                Email, téléphone et date de naissance sont des données personnelles : ne diffuse pas
                ce PDF en dehors du staff.
              </p>
            </div>
          )}

          <div className="border-t pt-4">
            <Label htmlFor="exp-label" className="text-xs font-bold">
              Complément de titre (optionnel)
            </Label>
            <Input
              id="exp-label"
              value={customLabel}
              onChange={(e) => setCustomLabel(e.target.value)}
              placeholder="Ex : Camp d'été, Bilan septembre..."
              className="mt-1"
            />
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              Titre du PDF : <span className="font-semibold text-foreground">{titlePreview}</span>
            </p>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Annuler
          </Button>
          <Button
            onClick={handleExport}
            disabled={busy}
            className="gap-2 bg-primary font-bold text-primary-foreground"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
            {busy ? "Génération..." : "Télécharger le PDF"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
