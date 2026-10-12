import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

type Challenge = {
  id: string;
  title: string;
  description: string | null;
  challenger_id: string;
  proposed_points: number;
  sport: string;
  gpx_template_path: string | null;
  manual_validation: boolean;
};
type Participant = {
  id: string;
  challenge_id: string;
  user_id: string;
  status: string;
  activity_id: string | null;
  scout_challenges: Challenge;
};
type Scout = { id: string; full_name: string | null; totem: string | null };
type Activity = {
  id: string;
  km: number;
  elevation_m: number | null;
  ride_date: string;
  status: string;
  strava_link: string | null;
  proof_path: string | null;
  gpx_path: string | null;
};

export function AdminChallenges() {
  const [entries, setEntries] = useState<Participant[]>([]);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [activities, setActivities] = useState<Record<string, Activity>>({});
  const [points, setPoints] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase as any)
      .from("scout_challenge_participants")
      .select("id,challenge_id,user_id,status,activity_id,scout_challenges(*)")
      .eq("status", "submitted")
      .order("created_at", { ascending: false });
    const rows = ((data || []) as Participant[]).filter(
      (r) => r.scout_challenges?.manual_validation,
    );
    setEntries(rows);
    const userIds = [
      ...new Set(
        rows.flatMap((r) => [r.user_id, r.scout_challenges?.challenger_id]).filter(Boolean),
      ),
    ];
    const activityIds = rows.map((r) => r.activity_id).filter((id): id is string => !!id);
    const [profilesResult, activityResult] = await Promise.all([
      userIds.length
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any).from("profiles").select("id,full_name,totem").in("id", userIds)
        : Promise.resolve({ data: [] }),
      activityIds.length
        ? // eslint-disable-next-line @typescript-eslint/no-explicit-any
          (supabase as any)
            .from("activities")
            .select("id,km,elevation_m,ride_date,status,strava_link,proof_path,gpx_path")
            .in("id", activityIds)
        : Promise.resolve({ data: [] }),
    ]);
    setScouts((profilesResult.data || []) as Scout[]);
    setActivities(
      Object.fromEntries(((activityResult.data || []) as Activity[]).map((a) => [a.id, a])),
    );
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const name = (id: string) => {
    const p = scouts.find((x) => x.id === id);
    return p?.totem || p?.full_name || "Scout";
  };
  const fileUrl = (path: string | null | undefined) =>
    path ? supabase.storage.from("proofs").getPublicUrl(path).data.publicUrl : null;
  const decide = async (entry: Participant, approve: boolean) => {
    const value = Number(points[entry.id] ?? entry.scout_challenges.proposed_points);
    if (approve && (!Number.isInteger(value) || value < 0 || value > 1000)) {
      toast.error("Les points doivent être entre 0 et 1000.");
      return;
    }
    setBusy(entry.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("review_scout_challenge_entry", {
      _participant_id: entry.id,
      _approve: approve,
      _awarded_points: approve ? value : null,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "La validation a échoué.");
      return;
    }
    toast.success(
      approve ? "Défi GPX validé, points attribués." : "Tentative refusée, le défi reste ouvert.",
    );
    await load();
  };

  return (
    <div className="space-y-3">
      <h2 className="font-display text-lg font-bold">Défis à valider par le staff</h2>
      {entries.length === 0 ? (
        <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
          Aucun défi à vérifier.
        </p>
      ) : (
        entries.map((entry) => {
          const challenge = entry.scout_challenges;
          const activity = entry.activity_id ? activities[entry.activity_id] : undefined;
          const expectedUrl = fileUrl(challenge?.gpx_template_path);
          const submittedUrl = fileUrl(activity?.gpx_path);
          const canReview = activity?.status === "approved";
          return (
            <div key={entry.id} className="flex flex-col gap-3 rounded-xl border bg-card p-4">
              <div>
                <div className="font-bold">
                  {challenge?.title || "Défi GPX"} <Badge variant="outline">À valider</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {name(challenge.challenger_id)} → {name(entry.user_id)} ·{" "}
                  {challenge.proposed_points} points proposés
                </p>
                {challenge.description && <p className="mt-1 text-sm">{challenge.description}</p>}
                {activity && (
                  <p className="mt-1 text-sm">
                    Sortie du{" "}
                    {new Date(`${activity.ride_date}T12:00:00`).toLocaleDateString("fr-BE")} ·{" "}
                    {activity.km} km · {activity.elevation_m ?? "—"} m D+ ·{" "}
                    <Badge variant="outline">
                      {activity.status === "approved" ? "Sortie validée" : "Sortie en attente"}
                    </Badge>
                  </p>
                )}
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                  {expectedUrl && (
                    <a
                      className="inline-flex items-center gap-1 text-primary underline"
                      href={expectedUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Tracé demandé <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {submittedUrl && (
                    <a
                      className="inline-flex items-center gap-1 text-primary underline"
                      href={submittedUrl}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Tracé soumis <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {activity?.strava_link && (
                    <a
                      className="inline-flex items-center gap-1 text-primary underline"
                      href={activity.strava_link}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Voir Strava <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                  {activity?.proof_path && (
                    <a
                      className="inline-flex items-center gap-1 text-primary underline"
                      href={activity.proof_path}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Voir la preuve <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 border-t pt-3">
                <label className="text-xs">Points attribués</label>
                <Input
                  className="w-24"
                  type="number"
                  min={0}
                  max={1000}
                  value={points[entry.id] ?? String(challenge.proposed_points)}
                  onChange={(e) => setPoints({ ...points, [entry.id]: e.target.value })}
                  disabled={!canReview || busy === entry.id}
                />
                {!canReview && (
                  <span className="text-xs text-muted-foreground">
                    Valide d’abord la sortie dans l’onglet Sorties.
                  </span>
                )}
                <div className="ml-auto flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => void decide(entry, true)}
                    disabled={!canReview || busy === entry.id}
                  >
                    <Check className="mr-1 h-4 w-4" />
                    Valider le défi
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => void decide(entry, false)}
                    disabled={busy === entry.id}
                  >
                    <X className="mr-1 h-4 w-4" />
                    Refuser le tracé
                  </Button>
                </div>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
