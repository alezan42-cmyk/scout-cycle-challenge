import { useCallback, useEffect, useState } from "react";
import { Check, ExternalLink, Pencil, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type Challenge = {
  id: string;
  title: string;
  description: string | null;
  challenger_id: string;
  proposed_points: number;
  sport: string;
  gpx_template_path: string | null;
  manual_validation: boolean;
  status: string;
  target_km: number | null;
  exact_distance: boolean;
  target_elevation: number | null;
  route_validation: boolean;
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
type ParticipantSummary = { challenge_id: string; user_id: string; status: string };

export function AdminChallenges() {
  const [entries, setEntries] = useState<Participant[]>([]);
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [activities, setActivities] = useState<Record<string, Activity>>({});
  const [points, setPoints] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [activeChallenges, setActiveChallenges] = useState<Challenge[]>([]);
  const [participants, setParticipants] = useState<ParticipantSummary[]>([]);
  const [editing, setEditing] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editPoints, setEditPoints] = useState("");
  const [editSport, setEditSport] = useState("velo");
  const [editKm, setEditKm] = useState("");
  const [editExact, setEditExact] = useState(false);
  const [editElevation, setEditElevation] = useState("");
  const [editRoute, setEditRoute] = useState(false);
  const load = useCallback(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sb = supabase as any;
    const [{ data }, { data: challengeData }] = await Promise.all([
      sb
        .from("scout_challenge_participants")
        .select("id,challenge_id,user_id,status,activity_id,scout_challenges(*)")
        .eq("status", "submitted")
        .order("created_at", { ascending: false }),
      sb
        .from("scout_challenges")
        .select("*")
        .eq("status", "open")
        .order("created_at", { ascending: false }),
    ]);
    const rows = ((data || []) as Participant[]).filter(
      (r) => r.scout_challenges?.manual_validation,
    );
    setEntries(rows);
    const openChallenges = (challengeData || []) as Challenge[];
    setActiveChallenges(openChallenges);
    const participantData = openChallenges.length
      ? await sb
          .from("scout_challenge_participants")
          .select("challenge_id,user_id,status")
          .in(
            "challenge_id",
            openChallenges.map((c) => c.id),
          )
      : { data: [] };
    const openEntries = (participantData.data || []) as ParticipantSummary[];
    setParticipants(openEntries);
    const userIds = [
      ...new Set(
        [
          ...rows.flatMap((r) => [r.user_id, r.scout_challenges?.challenger_id]),
          ...openChallenges.flatMap((c) => [
            c.challenger_id,
            ...openEntries.filter((p) => p.challenge_id === c.id).map((p) => p.user_id),
          ]),
        ].filter(Boolean),
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
  const startEdit = (challenge: Challenge) => {
    setEditing(challenge.id);
    setEditTitle(challenge.title);
    setEditDescription(challenge.description || "");
    setEditPoints(String(challenge.proposed_points));
    setEditSport(challenge.sport);
    setEditKm(challenge.target_km === null ? "" : String(challenge.target_km));
    setEditExact(challenge.exact_distance);
    setEditElevation(challenge.target_elevation === null ? "" : String(challenge.target_elevation));
    setEditRoute(challenge.route_validation);
  };
  const saveEdit = async (challenge: Challenge) => {
    const km = editKm.trim() ? Number(editKm.replace(",", ".")) : null;
    const elevation = editElevation.trim() ? Number(editElevation) : null;
    const proposedPoints = Number(editPoints);
    if (!Number.isInteger(proposedPoints) || proposedPoints < 1 || proposedPoints > 1000) {
      toast.error("Les points doivent être entre 1 et 1000.");
      return;
    }
    setBusy(challenge.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("admin_update_scout_challenge", {
      _challenge_id: challenge.id,
      _title: editTitle.trim(),
      _description: editDescription.trim() || null,
      _proposed_points: proposedPoints,
      _sport: editSport,
      _target_km: km,
      _exact_distance: editExact,
      _target_elevation: elevation,
      _route_validation: editRoute,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "La modification a échoué.");
      return;
    }
    toast.success("Défi modifié.");
    setEditing(null);
    await load();
  };
  const deleteChallenge = async (challenge: Challenge) => {
    if (!window.confirm(`Supprimer le défi « ${challenge.title} » ?`)) return;
    setBusy(challenge.id);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("admin_delete_scout_challenge", {
      _challenge_id: challenge.id,
    });
    setBusy(null);
    if (error) {
      toast.error(error.message || "La suppression a échoué.");
      return;
    }
    toast.success("Défi supprimé.");
    await load();
  };
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
      <section className="space-y-3">
        <h2 className="font-display text-lg font-bold">Défis en cours</h2>
        {!activeChallenges.length ? (
          <p className="rounded-xl border p-6 text-center text-sm text-muted-foreground">
            Aucun défi en cours.
          </p>
        ) : (
          activeChallenges.map((challenge) => {
            const roster = participants.filter((p) => p.challenge_id === challenge.id);
            const isEditing = editing === challenge.id;
            return (
              <article key={challenge.id} className="space-y-3 rounded-xl border bg-card p-4">
                {isEditing ? (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Nom du défi</Label>
                      <Input
                        value={editTitle}
                        onChange={(e) => setEditTitle(e.target.value)}
                        maxLength={120}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Type d’activité</Label>
                      <Select value={editSport} onValueChange={setEditSport}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="velo">Vélo</SelectItem>
                          <SelectItem value="course">Course à pied</SelectItem>
                          <SelectItem value="marche">Marche</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Points proposés</Label>
                      <Input
                        type="number"
                        min={1}
                        max={1000}
                        value={editPoints}
                        onChange={(e) => setEditPoints(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2 sm:col-span-2">
                      <Label>Type de défi</Label>
                      <Button
                        type="button"
                        size="sm"
                        variant={editRoute ? "default" : "outline"}
                        onClick={() => {
                          if (!editRoute) {
                            setEditKm("");
                            setEditElevation("");
                            setEditExact(false);
                          }
                          setEditRoute((value) => !value);
                        }}
                      >
                        {editRoute
                          ? "Parcours libre à vérifier par le staff"
                          : "Défi sur distance / D+"}
                      </Button>
                    </div>
                    {editRoute ? (
                      <div className="space-y-1 sm:col-span-2">
                        <Label>Description de la consigne</Label>
                        <Textarea
                          value={editDescription}
                          onChange={(e) => setEditDescription(e.target.value)}
                          maxLength={500}
                          rows={3}
                          placeholder="Ex. : réalise un parcours en forme de cœur."
                        />
                      </div>
                    ) : (
                      <>
                        <div className="space-y-1">
                          <Label>Distance (facultative)</Label>
                          <Input
                            type="number"
                            min={0.1}
                            max={1000}
                            step={0.1}
                            value={editKm}
                            onChange={(e) => setEditKm(e.target.value)}
                          />
                          <Select
                            value={editExact ? "exact" : "min"}
                            onValueChange={(v) => setEditExact(v === "exact")}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="min">Au moins</SelectItem>
                              <SelectItem value="exact">Exactement</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1">
                          <Label>D+ (facultatif)</Label>
                          <Input
                            type="number"
                            min={1}
                            max={20000}
                            step={1}
                            value={editElevation}
                            onChange={(e) => setEditElevation(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label>Description (facultative)</Label>
                          <Textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            maxLength={500}
                            rows={2}
                          />
                        </div>
                      </>
                    )}
                    <div className="flex justify-end gap-2 sm:col-span-2">
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => setEditing(null)}
                        disabled={busy === challenge.id}
                      >
                        Annuler
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => void saveEdit(challenge)}
                        disabled={busy === challenge.id}
                      >
                        <Check className="mr-1 h-4 w-4" /> Enregistrer
                      </Button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="font-bold">
                          {challenge.title} <Badge variant="outline">En cours</Badge>
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {challenge.sport === "velo"
                            ? "Vélo"
                            : challenge.sport === "course"
                              ? "Course à pied"
                              : "Marche"}{" "}
                          ·{" "}
                          {challenge.route_validation || challenge.gpx_template_path
                            ? "Parcours à tracer (validation staff)"
                            : [
                                challenge.target_km !== null
                                  ? `${challenge.exact_distance ? "exactement" : "au moins"} ${challenge.target_km} km`
                                  : null,
                                challenge.target_elevation !== null
                                  ? `au moins ${challenge.target_elevation} m D+`
                                  : null,
                              ]
                                .filter(Boolean)
                                .join(" + ")}{" "}
                          · {challenge.proposed_points} pts proposés
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Lancé par {name(challenge.challenger_id)}
                        </p>
                        {challenge.description && (
                          <p className="mt-1 text-sm">{challenge.description}</p>
                        )}
                        <p className="mt-1 text-xs text-muted-foreground">
                          Participants :{" "}
                          {roster
                            .map(
                              (p) =>
                                `${name(p.user_id)} (${p.status === "open" ? "à réaliser" : p.status === "submitted" ? "en vérification" : p.status})`,
                            )
                            .join(", ") || "aucun"}
                        </p>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => startEdit(challenge)}
                          disabled={
                            busy === challenge.id || roster.some((p) => p.status === "submitted")
                          }
                        >
                          <Pencil className="mr-1 h-4 w-4" /> Modifier
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="destructive"
                          onClick={() => void deleteChallenge(challenge)}
                          disabled={busy === challenge.id}
                        >
                          <Trash2 className="mr-1 h-4 w-4" /> Supprimer
                        </Button>
                      </div>
                    </div>
                    {roster.some((p) => p.status === "submitted") && (
                      <p className="text-xs text-muted-foreground">
                        Modification désactivée pendant la vérification d’une sortie.
                      </p>
                    )}
                  </>
                )}
              </article>
            );
          })
        )}
      </section>
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
