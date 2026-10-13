import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Award, Bike, Info, Mountain, Send, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ActivitySport } from "@/lib/database";

type Scout = { id: string; full_name: string | null; totem: string | null };
type Challenge = {
  id: string;
  challenger_id: string;
  title: string;
  description: string | null;
  proposed_points: number;
  awarded_points: number | null;
  status: "open" | "completed" | "cancelled";
  sport: ActivitySport;
  target_km: number | null;
  exact_distance: boolean;
  target_elevation: number | null;
  gpx_template_path: string | null;
  route_validation: boolean;
  winner_id: string | null;
};
type Participant = {
  id: string;
  challenge_id: string;
  user_id: string;
  status: string;
  activity_id: string | null;
};
type Rank = {
  user_id: string;
  display_name: string;
  patrol_name: string | null;
  points: number;
  challenges_won: number;
};
const sportNames: Record<ActivitySport, string> = {
  velo: "Vélo",
  course: "Course à pied",
  marche: "Marche",
};
const participantLabels: Record<string, string> = {
  open: "À réaliser",
  submitted: "En vérification",
  won: "Gagné",
  lost: "Défi remporté par un autre scout",
  rejected: "Refusé",
};

function challengeCriteria(c: Challenge) {
  if (c.route_validation || c.gpx_template_path) return "Parcours à tracer (validation staff)";
  const terms = [
    c.target_km !== null
      ? `${c.exact_distance ? "exactement" : "au moins"} ${c.target_km} km`
      : null,
    c.target_elevation !== null ? `au moins ${c.target_elevation} m de D+` : null,
  ].filter(Boolean);
  return terms.join(" et ");
}

export function ChallengesPanel() {
  const { user } = useAuth();
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [ranking, setRanking] = useState<Rank[]>([]);
  const [selectedScouts, setSelectedScouts] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [sport, setSport] = useState<ActivitySport>("velo");
  const [targetKm, setTargetKm] = useState("");
  const [distanceRule, setDistanceRule] = useState<"" | "min" | "exact">("");
  const [targetElevation, setTargetElevation] = useState("");
  const [points, setPoints] = useState("5");
  const [gpxMode, setGpxMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const load = useCallback(async () => {
    const [{ data: challengeRows }, { data: ranks }, { data: profiles }] = await Promise.all([
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any)
        .from("scout_challenges")
        .select("*")
        .order("created_at", { ascending: false }),
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (supabase as any).rpc("scout_challenge_leaderboard"),
      supabase.from("profiles_public").select("id,full_name,totem").order("full_name"),
    ]);
    const list = (challengeRows || []) as Challenge[];
    setChallenges(list);
    setRanking((ranks || []) as Rank[]);
    if (!list.length) {
      setParticipants([]);
      setScouts((profiles || []).filter((p): p is Scout => !!p.id));
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: entries } = await (supabase as any)
      .from("scout_challenge_participants")
      .select("id,challenge_id,user_id,status,activity_id")
      .in(
        "challenge_id",
        list.map((c) => c.id),
      );
    const participantRows = (entries || []) as Participant[];
    setParticipants(participantRows);
    setScouts((profiles || []).filter((p): p is Scout => !!p.id));
  }, []);
  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    const interval = window.setInterval(() => void load(), 30_000);
    return () => window.clearInterval(interval);
  }, [load]);

  const name = useCallback(
    (id: string) => {
      const scout = scouts.find((s) => s.id === id);
      return scout?.totem || scout?.full_name || "Scout";
    },
    [scouts],
  );
  const myChallenges = useMemo(
    () =>
      challenges.filter(
        (c) =>
          c.challenger_id === user?.id ||
          participants.some((p) => p.challenge_id === c.id && p.user_id === user?.id),
      ),
    [challenges, participants, user?.id],
  );

  const toggleScout = (id: string, checked: boolean | "indeterminate") => {
    setSelectedScouts((current) =>
      checked === true ? [...current, id] : current.filter((item) => item !== id),
    );
  };

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || selectedScouts.length === 0) return;
    const n = Number(points);
    const km = targetKm.trim() ? Number(targetKm.replace(",", ".")) : null;
    const elevation = targetElevation.trim() ? Number(targetElevation) : null;
    if (!Number.isInteger(n) || n < 1 || n > 1000) {
      toast.error("Les points doivent être entre 1 et 1000.");
      return;
    }
    if (!gpxMode && km === null && elevation === null) {
      toast.error("Indique une distance, un D+ ou les deux.");
      return;
    }
    if (!gpxMode && km !== null && !distanceRule) {
      toast.error("Précise si la distance est à réaliser au moins ou tout pile.");
      return;
    }
    if (gpxMode && !description.trim()) {
      toast.error("Décris le parcours demandé (ex. : réalise un parcours en forme de cœur).");
      return;
    }
    if (km !== null && (!Number.isFinite(km) || km <= 0 || km > 1000)) {
      toast.error("La distance doit être comprise entre 0,1 et 1000 km.");
      return;
    }
    if (
      elevation !== null &&
      (!Number.isInteger(elevation) || elevation <= 0 || elevation > 20000)
    ) {
      toast.error("Le D+ doit être compris entre 1 et 20 000 m.");
      return;
    }
    setBusy(true);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any).rpc("create_scout_challenge", {
      _title: title.trim(),
      _description: description.trim() || null,
      _proposed_points: n,
      _sport: sport,
      _target_km: gpxMode ? null : km,
      _exact_distance: gpxMode ? false : km !== null && distanceRule === "exact",
      _target_elevation: gpxMode ? null : elevation,
      _gpx_template_path: null,
      _participant_ids: selectedScouts,
    });
    if (error) {
      setBusy(false);
      toast.error(
        error.message?.includes("challenge") ? "Impossible de lancer ce défi." : error.message,
      );
      return;
    }
    setBusy(false);
    toast.success("Défi lancé auprès des scouts sélectionnés !");
    setTitle("");
    setDescription("");
    setSelectedScouts([]);
    setPoints("5");
    setTargetKm("");
    setTargetElevation("");
    setDistanceRule("");
    setGpxMode(false);
    await load();
  };

  return (
    <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-amber-500" />
            Classement des défis
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {!ranking.length && (
            <p className="text-sm text-muted-foreground">
              Les points apparaîtront après la réussite des premiers défis.
            </p>
          )}
          {ranking.map((r, i) => (
            <div
              key={r.user_id}
              className="flex items-center justify-between rounded-xl border p-3"
            >
              <span className="font-semibold">
                {i + 1}.{" "}
                <Link
                  to="/scout/$scoutId"
                  params={{ scoutId: r.user_id }}
                  className="hover:text-primary hover:underline"
                >
                  {r.display_name}
                </Link>
                <span className="ml-2 text-xs text-muted-foreground">{r.patrol_name}</span>
              </span>
              <span className="font-bold text-amber-600">{r.points} pts</span>
            </div>
          ))}
          {user && (
            <div className="mt-6 border-t pt-4">
              <h3 className="mb-3 font-bold">Mes défis</h3>
              {myChallenges.length ? (
                myChallenges.map((c) => {
                  const entries = participants.filter((p) => p.challenge_id === c.id);
                  const mine = entries.find((p) => p.user_id === user.id);
                  return (
                    <div key={c.id} className="mb-2 rounded-xl bg-muted/50 p-3">
                      <div className="font-semibold">
                        {c.title}
                        <span className="text-xs text-muted-foreground">
                          {" "}
                          ·{" "}
                          {c.status === "completed"
                            ? "Terminé"
                            : c.status === "cancelled"
                              ? "Annulé"
                              : "En cours"}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {sportNames[c.sport]} · {challengeCriteria(c)}
                      </p>
                      <p className="text-sm text-muted-foreground">
                        {c.proposed_points} pts proposés
                        {c.awarded_points !== null ? ` · ${c.awarded_points} pts attribués` : ""} ·
                        lancé par{" "}
                        <Link
                          to="/scout/$scoutId"
                          params={{ scoutId: c.challenger_id }}
                          className="hover:text-primary hover:underline"
                        >
                          {name(c.challenger_id)}
                        </Link>
                      </p>
                      {mine && (
                        <p className="text-sm">
                          Ton état : {participantLabels[mine.status] || mine.status}
                        </p>
                      )}
                      {c.description && <p className="text-sm">{c.description}</p>}
                      <p className="mt-1 text-xs text-muted-foreground">
                        Participants :{" "}
                        {entries.map((p, index) => (
                          <span key={p.user_id}>
                            {index > 0 ? ", " : ""}
                            <Link
                              to="/scout/$scoutId"
                              params={{ scoutId: p.user_id }}
                              className="hover:text-primary hover:underline"
                            >
                              {name(p.user_id)}
                            </Link>{" "}
                            ({participantLabels[p.status] || p.status})
                          </span>
                        ))}
                      </p>
                    </div>
                  );
                })
              ) : (
                <p className="text-sm text-muted-foreground">Aucun défi pour le moment.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {user && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Send className="h-5 w-5" />
              Lancer un défi
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form className="space-y-4" onSubmit={create}>
              <div className="space-y-2">
                <Label>Scouts participants</Label>
                <div className="max-h-48 space-y-1 overflow-y-auto rounded-lg border p-2">
                  {scouts
                    .filter((s) => s.id !== user.id)
                    .map((scout) => (
                      <label
                        key={scout.id}
                        className="flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-muted"
                      >
                        <Checkbox
                          checked={selectedScouts.includes(scout.id)}
                          onCheckedChange={(checked) => toggleScout(scout.id, checked)}
                        />
                        {scout.totem || scout.full_name || "Scout"}
                      </label>
                    ))}
                  {!scouts.filter((s) => s.id !== user.id).length && (
                    <p className="p-2 text-sm text-muted-foreground">
                      Aucun autre scout disponible.
                    </p>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">
                  Le premier participant à réussir remporte les points.
                </p>
              </div>
              <div className="space-y-2">
                <Label>Nom du défi</Label>
                <Input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={120}
                  placeholder="Ex. La montée du col"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label>Type d’activité</Label>
                <Select value={sport} onValueChange={(v) => setSport(v as ActivitySport)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="velo">🚴 Vélo</SelectItem>
                    <SelectItem value="course">🏃 Course à pied</SelectItem>
                    <SelectItem value="marche">🥾 Marche</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={!gpxMode ? "default" : "outline"}
                  onClick={() => setGpxMode(false)}
                >
                  Distance / D+
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={gpxMode ? "default" : "outline"}
                  onClick={() => setGpxMode(true)}
                >
                  Parcours à tracer
                </Button>
              </div>
              {gpxMode ? (
                <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
                  <Label htmlFor="challenge-route-prompt">Consigne du parcours</Label>
                  <Textarea
                    id="challenge-route-prompt"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={500}
                    rows={3}
                    required
                    placeholder="Ex. : réalise un parcours en forme de cœur."
                  />
                  <p className="text-xs text-muted-foreground">
                    Aucun GPX modèle n’est nécessaire. Le scout joindra le GPX de sa sortie et le
                    staff vérifiera qu’il suit la consigne.
                  </p>
                </div>
              ) : (
                <div className="space-y-3 rounded-xl border p-3">
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Bike className="h-4 w-4" />
                      Distance (facultative)
                    </Label>
                    <Input
                      type="number"
                      min="0.1"
                      max="1000"
                      step="0.1"
                      value={targetKm}
                      onChange={(e) => {
                        setTargetKm(e.target.value);
                        if (!e.target.value) setDistanceRule("");
                      }}
                      placeholder="ex. 20 km"
                    />
                    {targetKm && (
                      <Select
                        value={distanceRule}
                        onValueChange={(v) => setDistanceRule(v as "min" | "exact")}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Choisir au moins ou tout pile" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="min">Au moins {targetKm} km</SelectItem>
                          <SelectItem value="exact">Tout pile {targetKm} km</SelectItem>
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                  <div className="space-y-2">
                    <Label className="flex items-center gap-2">
                      <Mountain className="h-4 w-4" />
                      D+ (facultatif)
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      max="20000"
                      step="1"
                      value={targetElevation}
                      onChange={(e) => setTargetElevation(e.target.value)}
                      placeholder="ex. 300 m"
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    La distance et le D+ peuvent être combinés. Sans option « exactement », la
                    distance est un minimum.
                  </p>
                </div>
              )}
              {!gpxMode && (
                <div className="space-y-2">
                  <Label>{gpxMode ? "Consigne du parcours" : "Description (facultative)"}</Label>
                  <Textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    maxLength={500}
                    rows={2}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label>Points proposés</Label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  step={1}
                  value={points}
                  onChange={(e) => setPoints(e.target.value)}
                  required
                />
              </div>
              <Button
                type="submit"
                disabled={!selectedScouts.length || !title.trim() || busy}
                className="w-full"
              >
                <Award className="mr-2 h-4 w-4" />
                Lancer le défi
              </Button>
            </form>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export function ChallengesBanner() {
  const { user } = useAuth();
  const [items, setItems] = useState<Array<{ challenge: Challenge; status: string }>>([]);
  const [helpOpen, setHelpOpen] = useState(false);
  useEffect(() => {
    let active = true;
    if (!user) {
      setItems([]);
      return;
    }
    (async () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase as any)
        .from("scout_challenge_participants")
        .select("status,scout_challenges(*)")
        .eq("user_id", user.id)
        .in("status", ["open", "submitted"]);
      if (active)
        setItems(
          ((data || []) as Array<{ status: string; scout_challenges: Challenge }>)
            .filter((x) => x.scout_challenges?.status === "open")
            .map((x) => ({ challenge: x.scout_challenges, status: x.status })),
        );
    })();
    return () => {
      active = false;
    };
  }, [user]);
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (user) {
        (async () => {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { data } = await (supabase as any)
            .from("scout_challenge_participants")
            .select("status,scout_challenges(*)")
            .eq("user_id", user.id)
            .in("status", ["open", "submitted"]);
          setItems(
            ((data || []) as Array<{ status: string; scout_challenges: Challenge }>)
              .filter((x) => x.scout_challenges?.status === "open")
              .map((x) => ({ challenge: x.scout_challenges, status: x.status })),
          );
        })();
      }
    }, 30_000);
    return () => window.clearInterval(interval);
  }, [user]);
  if (!user || !items.length) return null;
  return (
    <>
      <Card className="border-amber-500/30 bg-amber-500/5">
        <CardContent className="p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="font-display flex items-center gap-2 font-bold">
              <Trophy className="h-5 w-5 text-amber-500" />
              Tes défis en cours
            </h2>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Comment fonctionnent les défis ?"
              onClick={() => setHelpOpen(true)}
            >
              <Info className="h-4 w-4" />
            </Button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {items.map(({ challenge, status }) => (
              <div key={challenge.id} className="rounded-xl border bg-card p-3">
                <div className="font-semibold">{challenge.title}</div>
                <p className="text-xs text-muted-foreground">
                  {sportNames[challenge.sport]} · {challengeCriteria(challenge)}
                </p>
                {(challenge.route_validation || challenge.gpx_template_path) &&
                  challenge.description && <p className="mt-1 text-xs">{challenge.description}</p>}
                <p className="text-sm font-bold text-amber-700">
                  {challenge.proposed_points} pts ·{" "}
                  {status === "submitted" ? "sortie en vérification" : "à réaliser"}
                </p>
                {challenge.gpx_template_path && (
                  <a
                    className="mt-1 inline-block text-xs text-primary underline"
                    href={
                      supabase.storage.from("proofs").getPublicUrl(challenge.gpx_template_path).data
                        .publicUrl
                    }
                    target="_blank"
                    rel="noreferrer"
                  >
                    Télécharger le tracé demandé
                  </a>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Comment fonctionnent les défis ?</DialogTitle>
            <DialogDescription className="space-y-2 pt-2 text-left">
              <span className="block">
                Enregistre une sortie du type demandé et sélectionne le défi concerné. La distance
                doit atteindre le minimum annoncé, ou être exactement celle demandée si le lanceur
                l’a précisé. Le D+ peut s’ajouter à la distance.
              </span>
              <span className="block">
                Les sorties validées qui respectent ces critères attribuent automatiquement les
                points au premier participant. Pour un défi de parcours, le scout joint le GPX de sa
                sortie et le staff vérifie qu’il suit la consigne.
              </span>
            </DialogDescription>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}
