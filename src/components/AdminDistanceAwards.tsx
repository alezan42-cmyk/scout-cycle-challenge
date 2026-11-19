import { useEffect, useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { ActivitySport } from "@/lib/database";
import {
  DEFAULT_AWARD_THRESHOLDS,
  type DistanceAward,
  type DistanceAwardKind,
} from "@/lib/useDistanceAwards";

const sports: ActivitySport[] = ["velo", "course", "marche"];
const sportLabels: Record<ActivitySport, string> = {
  velo: "Vélo",
  course: "Course à pied",
  marche: "Marche",
};
const kindLabels: Record<DistanceAwardKind, string> = {
  single_ride: "Trophée (une sortie)",
  cumulative: "Palier (distance cumulée)",
};

export function AdminDistanceAwards() {
  const [rows, setRows] = useState<DistanceAward[]>([]);
  const [sport, setSport] = useState<ActivitySport>("velo");
  const [kind, setKind] = useState<DistanceAwardKind>("single_ride");
  const [km, setKm] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error: loadError } = await (supabase as any)
      .from("distance_awards")
      .select("id,sport,kind,threshold_km")
      .order("kind")
      .order("sport")
      .order("threshold_km");
    if (loadError) {
      setError(loadError.message);
      return;
    }
    setRows((data || []) as DistanceAward[]);
    setError(null);
  };
  useEffect(() => {
    void load();
  }, []);

  const beginEdit = (row: DistanceAward) => {
    setEditing(row.id);
    setSport(row.sport);
    setKind(row.kind);
    setKm(String(row.threshold_km));
  };
  const reset = () => {
    setEditing(null);
    setSport("velo");
    setKind("single_ride");
    setKm("");
  };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const threshold = Number(km.replace(",", "."));
    if (!Number.isFinite(threshold) || threshold <= 0 || threshold > 10000) {
      toast.error("Indique une distance entre 0,1 et 10 000 km.");
      return;
    }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const query = (supabase as any).from("distance_awards");
    const result = editing
      ? await query.update({ sport, kind, threshold_km: threshold }).eq("id", editing)
      : await query.insert({ sport, kind, threshold_km: threshold });
    setBusy(false);
    if (result.error) {
      toast.error(result.error.message);
      return;
    }
    toast.success(editing ? "Trophée modifié." : "Trophée ajouté.");
    reset();
    await load();
  };
  const remove = async (row: DistanceAward) => {
    if (!window.confirm(`Supprimer le seuil ${row.threshold_km} km — ${sportLabels[row.sport]} ?`))
      return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: removeError } = await (supabase as any)
      .from("distance_awards")
      .delete()
      .eq("id", row.id);
    if (removeError) {
      toast.error(removeError.message);
      return;
    }
    toast.success("Seuil supprimé.");
    await load();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[0.8fr_1.2fr]">
      <Card>
        <CardHeader>
          <CardTitle>{editing ? "Modifier un trophée" : "Créer un trophée ou palier"}</CardTitle>
        </CardHeader>
        <CardContent>
          <form className="space-y-4" onSubmit={save}>
            <div className="space-y-1">
              <Label>Discipline</Label>
              <Select value={sport} onValueChange={(v) => setSport(v as ActivitySport)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {sports.map((s) => (
                    <SelectItem key={s} value={s}>
                      {sportLabels[s]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Récompense</Label>
              <Select value={kind} onValueChange={(v) => setKind(v as DistanceAwardKind)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(kindLabels) as DistanceAwardKind[]).map((k) => (
                    <SelectItem key={k} value={k}>
                      {kindLabels[k]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Distance requise (km)</Label>
              <Input
                type="number"
                min="0.1"
                max="10000"
                step="0.1"
                value={km}
                onChange={(e) => setKm(e.target.value)}
                required
              />
            </div>
            <div className="flex gap-2">
              <Button type="submit" disabled={busy}>
                <Plus className="mr-1 h-4 w-4" />
                {editing ? "Enregistrer" : "Ajouter"}
              </Button>
              {editing && (
                <Button type="button" variant="outline" onClick={reset}>
                  Annuler
                </Button>
              )}
            </div>
          </form>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Récompenses configurées</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {error && <p className="text-sm text-destructive">Chargement impossible : {error}</p>}
          {!rows.length && !error && (
            <div className="space-y-2 text-sm text-muted-foreground">
              <p>
                Les valeurs initiales seront utilisées tant qu’aucune récompense n’a été modifiée :
              </p>
              {(Object.keys(DEFAULT_AWARD_THRESHOLDS) as DistanceAwardKind[]).map((k) =>
                sports.map((s) => (
                  <p key={`${k}-${s}`}>
                    <strong>
                      {kindLabels[k]} · {sportLabels[s]} :
                    </strong>{" "}
                    {DEFAULT_AWARD_THRESHOLDS[k][s].join(", ")} km
                  </p>
                )),
              )}
            </div>
          )}
          {rows.map((row) => (
            <div key={row.id} className="flex flex-wrap items-center gap-2 rounded-lg border p-3">
              <Badge variant="outline">{kindLabels[row.kind]}</Badge>
              <span className="font-medium">
                {sportLabels[row.sport]} · {row.threshold_km} km
              </span>
              <div className="ml-auto flex gap-1">
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Modifier"
                  onClick={() => beginEdit(row)}
                >
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Supprimer"
                  onClick={() => void remove(row)}
                >
                  <Trash2 className="h-4 w-4 text-destructive" />
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
