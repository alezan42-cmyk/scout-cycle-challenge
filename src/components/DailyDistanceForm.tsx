import React, { useState, useEffect, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import {
  Calendar,
  Users,
  Upload,
  ExternalLink,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  FileText,
  Clock,
  ArrowRight,
  MapPin,
  Mountain,
  ChevronDown,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { GroupRidePicker, type GroupChoice } from "@/components/GroupRidePicker";
import { removeStorageFiles } from "@/lib/proofStorage";
import { parseElevation } from "@/lib/jerseys";
import { useAuth } from "@/lib/useAuth";
import { useSeasonalTheme } from "@/context/SeasonalThemeContext";
import { buildEncouragement } from "@/lib/encouragement";
import { db, type Patrol, type ActivitySport, getPatrolEmblem, SPORT_INFO } from "@/lib/database";
import { SportIcon, SPORT_COLORS } from "@/components/SportIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { isStaffPatrol, TROOP_STAFF_PATROL_NAME } from "@/lib/categories";
import { CHALLENGE_START, CHALLENGE_START_LABEL } from "@/lib/challengeStart";

export interface DailyDistanceFormProps {
  /** Callback fired after a successful submission */
  onSuccess?: (createdActivity: {
    id: string;
    km: number;
    ride_date: string;
    patrol_id: string;
    patrol_name: string;
    status: string;
    sport?: ActivitySport;
  }) => void;
  /** Optional preselected patrol ID */
  defaultPatrolId?: string;
  /** Custom title for the form card */
  title?: string;
  /** Custom description */
  description?: string;
  /** Custom class names */
  className?: string;
  /** « app » : présentation allégée pour l'application installée (le site garde « card ») */
  variant?: "card" | "app";
}

const PRESET_DISTANCES_VELO = [5, 10, 15, 25, 40, 60];
const PRESET_DISTANCES_COURSE = [2, 5, 8, 10, 15, 21];
const PRESET_DISTANCES_MARCHE = [2, 4, 6, 10, 15, 20];

type OpenChallengeRow = {
  status: string;
  scout_challenges: {
    id: string;
    title: string;
    proposed_points: number;
    sport: ActivitySport;
    target_km: number | null;
    exact_distance: boolean;
    target_elevation: number | null;
    gpx_template_path: string | null;
    route_validation: boolean;
    manual_validation: boolean;
    status: string;
  };
};

// Fonction utilitaire pour calculer la distance Haversine en mètres entre deux points GPS
function getDistanceFromLatLonInMeters(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Fonction pour rogner les 200 premiers et derniers mètres du GPX (vie privée)
async function processAndCropGpx(file: File): Promise<string> {
  const text = await file.text();
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(text, "text/xml");
  const trkpts = Array.from(xmlDoc.getElementsByTagName("trkpt"));

  if (trkpts.length < 3) return text;

  const points = trkpts.map((pt) => ({
    lat: parseFloat(pt.getAttribute("lat") || "0"),
    lon: parseFloat(pt.getAttribute("lon") || "0"),
    node: pt,
  }));

  let distFromStart = 0;
  const distancesFromStart: number[] = [0];
  for (let i = 1; i < points.length; i++) {
    distFromStart += getDistanceFromLatLonInMeters(
      points[i - 1].lat,
      points[i - 1].lon,
      points[i].lat,
      points[i].lon,
    );
    distancesFromStart.push(distFromStart);
  }

  const totalDist = distancesFromStart[distancesFromStart.length - 1];

  // Filtre pour masquer 200m au début et 200m à la fin
  const filteredTrkpts = points.filter((_, index) => {
    const dStart = distancesFromStart[index];
    const dEnd = totalDist - dStart;
    return dStart >= 200 && dEnd >= 200;
  });

  if (filteredTrkpts.length < 2) return text;

  const parentTrkseg = filteredTrkpts[0].node.parentElement;
  if (parentTrkseg) {
    parentTrkseg.innerHTML = "";
    filteredTrkpts.forEach((p) => parentTrkseg.appendChild(p.node));
  }

  const serializer = new XMLSerializer();
  return serializer.serializeToString(xmlDoc);
}

export function DailyDistanceForm({
  onSuccess,
  defaultPatrolId,
  title = "Enregistrer une sortie à vélo",
  description = "Indique tes kilomètres du jour et associe-les directement à ta patrouille",
  className,
  variant = "card",
}: DailyDistanceFormProps) {
  const { user, profile, isAdmin, refreshProfile } = useAuth();
  const { theme } = useSeasonalTheme();

  // Form states
  const [sport, setSport] = useState<ActivitySport>("velo");
  const [distanceKm, setDistanceKm] = useState("");
  // Version application : détails repliés et choix de date simplifié
  const [appDetailsOpen, setAppDetailsOpen] = useState(false);
  const [appOtherDate, setAppOtherDate] = useState(false);
  const [elevationM, setElevationM] = useState("");
  const [rideDate, setRideDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedPatrolId, setSelectedPatrolId] = useState<string>(defaultPatrolId || "");
  const [openChallenges, setOpenChallenges] = useState<
    Array<{
      id: string;
      title: string;
      proposed_points: number;
      sport: ActivitySport;
      target_km: number | null;
      exact_distance: boolean;
      target_elevation: number | null;
      gpx_template_path: string | null;
      route_validation: boolean;
      manual_validation: boolean;
    }>
  >([]);
  const [selectedChallengeId, setSelectedChallengeId] = useState("");
  const [stravaUrl, setStravaUrl] = useState("");
  const [rideNote, setRideNote] = useState("");
  const [proofFile, setProofFile] = useState<File | null>(null);
  const [proofPreview, setProofPreview] = useState<string | null>(null);
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [activeTab, setActiveTab] = useState<"strava" | "photo">("strava");
  const [groupChoice, setGroupChoice] = useState<GroupChoice>({ mode: "seul" });
  const [pickerKey, setPickerKey] = useState(0);
  const joiningGroup = groupChoice.mode === "rejoindre";

  const handleGroupChoice = (v: GroupChoice) => {
    setGroupChoice(v);
    // Rejoindre une sortie de groupe : la date et le sport sont ceux du groupe
    if (v.mode === "rejoindre") {
      setRideDate(v.rideDate);
      setSport(v.sport);
    }
  };

  // Patrols state
  const [patrols, setPatrols] = useState<Patrol[]>([]);
  const [loadingPatrols, setLoadingPatrols] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 1. Fetch patrols list from Supabase
  const loadPatrols = useCallback(async () => {
    try {
      setLoadingPatrols(true);
      const { data, error } = await supabase
        .from("patrols")
        .select("id, name, category, created_at")
        .order("name", { ascending: true });

      if (error) throw error;

      let list = (data as Patrol[]) || [];

      const hasStaff = list.some((p) => isStaffPatrol(p));
      if (!hasStaff) {
        list = [
          ...list,
          {
            id: "staff",
            name: TROOP_STAFF_PATROL_NAME,
            category: "staff",
            created_at: new Date().toISOString(),
          },
        ];
      }
      setPatrols(list);
    } catch (err) {
      console.warn("Erreur chargement patrouilles depuis Supabase, repli local:", err);
      const localPatrols = db.getPatrols();
      setPatrols(localPatrols);
    } finally {
      setLoadingPatrols(false);
    }
  }, []);

  useEffect(() => {
    loadPatrols();
  }, [loadPatrols]);

  useEffect(() => {
    if (!user) {
      setOpenChallenges([]);
      return;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any)
      .from("scout_challenge_participants")
      .select(
        "status,scout_challenges(id,title,proposed_points,sport,target_km,exact_distance,target_elevation,gpx_template_path,route_validation,manual_validation,status)",
      )
      .eq("user_id", user.id)
      .eq("status", "open")
      .then((result: { data: OpenChallengeRow[] | null }) => {
        setOpenChallenges(
          (result.data || [])
            .map((entry) => entry.scout_challenges)
            .filter((challenge) => challenge?.status === "open"),
        );
      });
  }, [user]);

  useEffect(() => {
    const selected = openChallenges.find((challenge) => challenge.id === selectedChallengeId);
    if (selected && selected.sport !== sport) {
      setSelectedChallengeId("");
    }
  }, [openChallenges, selectedChallengeId, sport]);
  const selectedChallengeForForm = openChallenges.find(
    (challenge) => challenge.id === selectedChallengeId,
  );

  // 2. Pre-select patrol based on scout profile or default prop
  useEffect(() => {
    if (selectedPatrolId) return;

    if (defaultPatrolId) {
      setSelectedPatrolId(defaultPatrolId);
    } else if (profile?.patrol_id) {
      setSelectedPatrolId(profile.patrol_id);
    }
  }, [profile?.patrol_id, defaultPatrolId, selectedPatrolId]);

  // 3. Handle file selections
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        toast.error("Veuillez sélectionner un fichier image valide (JPG, PNG)");
        return;
      }
      setProofFile(file);
      setProofPreview(URL.createObjectURL(file));
    }
  };

  const handleGpxChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.name.toLowerCase().endsWith(".gpx")) {
        toast.error("Veuillez sélectionner un fichier .gpx valide");
        return;
      }
      setGpxFile(file);
      toast.success(`Fichier GPX "${file.name}" attaché (vie privée protégée)`);
    }
  };

  const handleSetDistance = (km: number) => {
    setDistanceKm(String(km));
  };

  // 4. Submit handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const kmNumber = parseFloat(distanceKm.replace(",", "."));
    if (!kmNumber || isNaN(kmNumber) || kmNumber <= 0 || kmNumber > 1000) {
      toast.error("Veuillez saisir une distance valide (entre 0.1 et 1000 km)");
      return;
    }

    const elevation = parseElevation(elevationM);
    if (elevation === "invalid") {
      toast.error("Dénivelé invalide : indique un nombre de mètres entre 0 et 20 000");
      return;
    }

    if (!rideDate || rideDate < CHALLENGE_START) {
      toast.error(
        `Le défi a commencé le ${CHALLENGE_START_LABEL} : les sorties d'avant ne comptent pas.`,
      );
      return;
    }

    if (!selectedPatrolId) {
      toast.error("Veuillez sélectionner la patrouille à laquelle associer cette distance");
      return;
    }

    const selectedChallenge = openChallenges.find(
      (challenge) => challenge.id === selectedChallengeId,
    );
    if (selectedChallenge) {
      if (selectedChallenge.sport !== sport) {
        toast.error("Le type d’activité ne correspond pas à ce défi.");
        return;
      }
      if (
        selectedChallenge.target_km !== null &&
        (selectedChallenge.exact_distance
          ? kmNumber !== Number(selectedChallenge.target_km)
          : kmNumber < Number(selectedChallenge.target_km))
      ) {
        toast.error(
          selectedChallenge.exact_distance
            ? "La distance doit être exactement celle du défi."
            : "La distance est inférieure au minimum demandé.",
        );
        return;
      }
      if (
        selectedChallenge.target_elevation !== null &&
        (typeof elevation !== "number" || elevation < selectedChallenge.target_elevation)
      ) {
        toast.error("Le D+ est inférieur au minimum demandé pour ce défi.");
        return;
      }
      if ((selectedChallenge.gpx_template_path || selectedChallenge.route_validation) && !gpxFile) {
        toast.error("Ajoute le tracé GPX de ta sortie pour ce défi.");
        return;
      }
    }

    const trimmedStrava = stravaUrl.trim();
    if (activeTab === "strava" && trimmedStrava) {
      if (!/^https:\/\/(www\.)?strava\.(com|app\.link)\//i.test(trimmedStrava)) {
        toast.error(
          "Lien Strava invalide. Il doit commencer par https://www.strava.com/activities/...",
        );
        return;
      }
    }

    if (activeTab === "photo" && !proofFile) {
      toast.error("Veuillez ajouter une photo de votre compteur ou capture d'écran");
      return;
    }

    setSubmitting(true);

    try {
      const selectedPatrol = patrols.find((p) => p.id === selectedPatrolId);
      const patrolName = selectedPatrol ? selectedPatrol.name : "Patrouille";

      const isUUID = (val: string | null | undefined): boolean =>
        !!val && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(val);

      const { data: authData } = await supabase.auth.getUser();
      const realUser = authData?.user;

      if (!realUser?.id) {
        toast.error(
          "Tu n'es pas connecté avec un compte Supabase réel. Rends-toi sur la page Connexion pour te connecter ou t'inscrire !",
        );
        setSubmitting(false);
        return;
      }

      const targetUserId = realUser.id;

      // Upsert profile
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from("profiles") as any).upsert(
          {
            id: targetUserId,
            email: realUser.email || user?.email || "scout@alezan42.fr",
            full_name: profile?.full_name || realUser.email?.split("@")[0] || "Scout",
            totem: profile?.totem || null,
            quali: profile?.quali || null,
            patrol_id:
              selectedPatrolId && isUUID(selectedPatrolId)
                ? selectedPatrolId
                : profile?.patrol_id || null,
            onboarded: true,
          },
          { onConflict: "id" },
        );
        if (refreshProfile) {
          await refreshProfile();
        }
      } catch (err) {
        console.warn("Synchronisation du profil avec la patrouille sélectionnée :", err);
      }

      // 5. Envoi de l'image de preuve vers Supabase Storage
      let proofPublicUrl: string | null = null;
      if (proofFile && activeTab === "photo") {
        const fileExt = proofFile.name.split(".").pop() || "jpg";
        const fileName = `${targetUserId}_${Date.now()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("proofs")
          .upload(fileName, proofFile, { upsert: true });

        if (uploadError) {
          toast.error("Erreur lors de l'envoi de la preuve : " + uploadError.message);
          setSubmitting(false);
          return;
        }

        const { data: urlData } = supabase.storage.from("proofs").getPublicUrl(fileName);
        proofPublicUrl = urlData.publicUrl;
      }

      // 6. Traitement et envoi optionnel du fichier GPX (rogné 200m début/fin)
      let gpxPublicUrl: string | null = null;
      if (gpxFile) {
        try {
          const croppedContent = await processAndCropGpx(gpxFile);
          const gpxBlob = new Blob([croppedContent], { type: "application/gpx+xml" });
          const gpxFileName = `${targetUserId}_${Date.now()}.gpx`;

          const { error: gpxUploadError } = await supabase.storage
            .from("proofs")
            .upload(gpxFileName, gpxBlob, { upsert: true });

          if (!gpxUploadError) {
            const { data: gpxUrlData } = supabase.storage.from("proofs").getPublicUrl(gpxFileName);
            gpxPublicUrl = gpxUrlData.publicUrl;
          } else if (selectedChallenge?.route_validation || selectedChallenge?.gpx_template_path) {
            toast.error("Impossible d’envoyer le GPX requis pour ce défi.");
            setSubmitting(false);
            return;
          }
        } catch (err) {
          console.warn("Erreur lors du traitement GPX :", err);
          if (selectedChallenge?.route_validation || selectedChallenge?.gpx_template_path) {
            toast.error("Impossible de préparer le GPX requis pour ce défi.");
            setSubmitting(false);
            return;
          }
        }
      }

      const isAutoApproved = !!(trimmedStrava || isAdmin || profile?.is_admin);
      const activityStatus: "approved" | "pending" = isAutoApproved ? "approved" : "pending";

      const finalNote =
        sport === "velo"
          ? rideNote.trim() || null
          : rideNote.trim()
            ? `[${sport}] ${rideNote.trim()}`
            : `[${sport}]`;

      // 7. Sortie à plusieurs (classement Peloton)
      let groupRideId: string | null = null;
      let createdGroupId: string | null = null;
      if (groupChoice.mode === "rejoindre") {
        groupRideId = groupChoice.groupId;
      } else if (groupChoice.mode === "nouveau" && groupChoice.companions.length > 0) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const sb = supabase as any;
        const { data: group, error: groupError } = await sb
          .from("group_rides")
          .insert({ created_by: targetUserId, ride_date: rideDate, sport })
          .select("id")
          .single();
        if (!groupError && group?.id) {
          const { error: membersError } = await sb.from("group_ride_members").insert(
            [targetUserId, ...groupChoice.companions].map((uid) => ({
              group_id: group.id,
              user_id: uid,
            })),
          );
          if (membersError) {
            await sb.from("group_rides").delete().eq("id", group.id);
          } else {
            groupRideId = group.id;
            createdGroupId = group.id;
          }
        }
        if (!groupRideId) {
          toast.warning(
            "La sortie à plusieurs n'a pas pu être créée : ta sortie est enregistrée seule.",
          );
        }
      }

      const activityPayload = {
        user_id: targetUserId,
        km: kmNumber,
        elevation_m: elevation,
        ride_date: rideDate,
        strava_link: trimmedStrava || null,
        proof_path: proofPublicUrl,
        gpx_path: gpxPublicUrl, // <-- Enregistre le lien du GPX épuré pour la carte interactive
        note: finalNote,
        status: activityStatus,
        group_ride_id: groupRideId,
        challenge_id: selectedChallengeId || null,
      };

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: createdData, error: insertError } = await (supabase.from("activities") as any)
        .insert(activityPayload)
        .select()
        .single();

      if (insertError) {
        // La sortie n'a pas été créée : ne pas laisser de fichiers orphelins
        await removeStorageFiles([proofPublicUrl, gpxPublicUrl]);
        if (createdGroupId) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (supabase as any).from("group_rides").delete().eq("id", createdGroupId);
        }
        console.error("Erreur insertion activités Supabase :", insertError);
        toast.error(
          insertError.message?.includes("date_debut_defi")
            ? `Le défi a commencé le ${CHALLENGE_START_LABEL} : les sorties d'avant ne comptent pas.`
            : "Erreur Supabase : " + insertError.message,
        );
        setSubmitting(false);
        return;
      }

      // Le statut final est décidé par la base (trigger set_activity_status).
      const finalStatus: "approved" | "pending" =
        createdData?.status === "approved" || createdData?.status === "pending"
          ? createdData.status
          : activityStatus;

      const localActivity = db.addActivity({
        id: createdData?.id,
        user_id: targetUserId,
        km: kmNumber,
        ride_date: rideDate,
        strava_link: trimmedStrava || null,
        proof_path: proofPublicUrl,
        gpx_path: gpxPublicUrl,
        sport,
        note: finalNote,
        status: finalStatus,
      });

      if (profile && selectedPatrolId) {
        db.updateProfile(targetUserId, { patrol_id: selectedPatrolId });
      }

      const sportLabel = SPORT_INFO[sport].label;

      // Taille de la sortie à plusieurs (seulement si le groupe a bien été créé ou rejoint)
      let groupSize: number | null = null;
      if (groupRideId) {
        if (groupChoice.mode === "nouveau") groupSize = groupChoice.companions.length + 1;
        else if (groupChoice.mode === "rejoindre") groupSize = groupChoice.size ?? null;
      }
      const encouragement = buildEncouragement({
        km: kmNumber,
        sport,
        elevation: typeof elevation === "number" ? elevation : null,
        status: finalStatus,
        groupSize,
        theme,
      });

      toast.success(
        <div className="space-y-1">
          <p className="font-bold flex items-center gap-1.5 text-sm">
            <Sparkles className="h-4 w-4 text-amber-500" />
            {sportLabel}{" "}
            {finalStatus === "approved" ? "validée avec succès !" : "enregistrée (en attente) !"}
          </p>
          <p className="text-xs text-muted-foreground">
            <strong>+{kmNumber} km</strong> ({SPORT_INFO[sport].emoji} {SPORT_INFO[sport].short})
            attribués à la patrouille <strong>{patrolName}</strong> ({rideDate})
          </p>
          <p className="pt-1 text-sm font-bold text-foreground">{encouragement.headline}</p>
          {encouragement.extras.map((line) => (
            <p key={line} className="text-xs text-foreground/80">
              {line}
            </p>
          ))}
          {finalStatus === "pending" && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
              <Clock className="h-3 w-3" />
              En attente de validation par le staff (photo jointe)
            </p>
          )}
        </div>,
        { duration: groupSize && groupSize >= 2 ? 9000 : 6000 },
      );

      setDistanceKm("");
      setElevationM("");
      setStravaUrl("");
      setRideNote("");
      if (selectedChallengeId) {
        setOpenChallenges((current) =>
          current.filter((challenge) => challenge.id !== selectedChallengeId),
        );
        setSelectedChallengeId("");
      }
      setProofFile(null);
      setProofPreview(null);
      setGpxFile(null);
      setGroupChoice({ mode: "seul" });
      setPickerKey((k) => k + 1);

      if (onSuccess) {
        onSuccess({
          id: createdData?.id || localActivity.id,
          km: kmNumber,
          ride_date: rideDate,
          patrol_id: selectedPatrolId,
          patrol_name: patrolName,
          status: finalStatus,
          sport,
        });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error(`Erreur lors de l'enregistrement : ${msg}`);
    } finally {
      setSubmitting(false);
    }
  };

  const selectedPatrolObj = patrols.find((p) => p.id === selectedPatrolId);

  // Blocs partagés entre la version site (carte) et la version application
  const challengeBlock = (
    <>
      {openChallenges.filter((c) => c.sport === sport).length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-500/30 bg-amber-500/5 p-4">
          <Label className="font-bold">Cette sortie réalise un défi ?</Label>
          <Select
            value={selectedChallengeId || "none"}
            onValueChange={(v) => setSelectedChallengeId(v === "none" ? "" : v)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Choisir un défi (facultatif)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Aucun défi</SelectItem>
              {openChallenges
                .filter((c) => c.sport === sport)
                .map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.title} · {c.proposed_points} pts ·{" "}
                    {c.gpx_template_path || c.route_validation
                      ? "parcours à tracer"
                      : [
                          c.target_km !== null
                            ? `${c.exact_distance ? "exactement" : "≥"} ${c.target_km} km`
                            : null,
                          c.target_elevation !== null ? `≥ ${c.target_elevation} m D+` : null,
                        ]
                          .filter(Boolean)
                          .join(" + ")}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Les critères sont vérifiés à l’enregistrement. Les points sont attribués au premier
            scout dont la sortie est validée. Pour les défis de parcours, joins le GPX de ta sortie
            : le staff vérifie la consigne.
          </p>
        </div>
      )}
    </>
  );

  const gpxBlock = (
    <>
      {/* CHAMP OPTIONNEL GPX POUR LA CARTE DE LA TROUPE */}
      <div className="space-y-2 rounded-xl border border-border/70 bg-card/60 p-4">
        <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <MapPin className="h-3.5 w-3.5 text-primary" />
          {selectedChallengeForForm?.route_validation || selectedChallengeForForm?.gpx_template_path
            ? "Fichier GPX requis pour ce défi"
            : "Fichier GPX du parcours (optionnel pour la carte de la troupe)"}
        </Label>
        <div className="flex items-center gap-3">
          <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-foreground transition-all">
            <Upload className="h-4 w-4 text-primary" />
            <span>
              {gpxFile
                ? gpxFile.name
                : selectedChallengeForForm?.route_validation ||
                    selectedChallengeForForm?.gpx_template_path
                  ? "Ajouter le GPX de ta sortie"
                  : "Ajouter un fichier .gpx (optionnel)"}
            </span>
            <input
              type="file"
              accept=".gpx,application/gpx+xml"
              className="hidden"
              onChange={handleGpxChange}
            />
          </label>
          {gpxFile && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setGpxFile(null)}
              className="text-xs text-destructive hover:bg-destructive/10"
            >
              Retirer
            </Button>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">
          🔒 <strong>Vie privée :</strong> Les 200 premiers et derniers mètres de ton tracé GPX
          seront automatiquement rognés pour masquer ton départ et ton arrivée.
        </p>
      </div>
    </>
  );

  function renderAppForm() {
    const iso = (d: Date) =>
      `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    const today = iso(new Date());
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = iso(yesterdayDate);
    const dateMode = appOtherDate
      ? "other"
      : rideDate === today
        ? "today"
        : rideDate === yesterday
          ? "yesterday"
          : "other";
    const presets =
      sport === "course"
        ? PRESET_DISTANCES_COURSE
        : sport === "marche"
          ? PRESET_DISTANCES_MARCHE
          : PRESET_DISTANCES_VELO;
    const sportChallenges = openChallenges.filter((c) => c.sport === sport);
    const detailCount =
      (elevationM ? 1 : 0) +
      (gpxFile ? 1 : 0) +
      (rideNote.trim() ? 1 : 0) +
      (groupChoice.mode !== "seul" ? 1 : 0) +
      (selectedChallengeId ? 1 : 0);
    const pill = (active: boolean) =>
      cn(
        "h-10 flex-1 rounded-xl text-[14px] font-semibold transition-all",
        active
          ? "bg-card text-foreground shadow-[0_1px_3px_rgb(0_0_0/0.12)]"
          : "text-muted-foreground",
      );

    return (
      <form onSubmit={handleSubmit} className={cn("space-y-6", className)}>
        {!user && (
          <div className="rounded-2xl bg-amber-500/10 p-4 text-[14px] text-amber-900 dark:text-amber-200">
            Connecte-toi pour enregistrer tes sorties.{" "}
            <Link to="/auth" className="font-semibold underline">
              Connexion
            </Link>
          </div>
        )}

        {/* Sport */}
        <div className="grid grid-cols-3 gap-2">
          {(["velo", "course", "marche"] as const).map((sp) => (
            <button
              key={sp}
              type="button"
              onClick={() => setSport(sp)}
              disabled={joiningGroup}
              aria-pressed={sport === sp}
              className={cn(
                "flex h-[76px] flex-col items-center justify-center gap-1.5 rounded-2xl border text-[14px] font-semibold transition-all",
                sport === sp
                  ? cn(SPORT_COLORS[sp].solid, "border-transparent shadow-sm")
                  : "border-border/60 bg-card text-foreground",
              )}
            >
              <SportIcon sport={sp} className="h-6 w-6" />
              {sp === "course" ? "Course" : SPORT_INFO[sp].short}
            </button>
          ))}
        </div>

        {/* Distance */}
        <div className="rounded-3xl border border-border/50 bg-card p-5 shadow-[0_1px_3px_rgb(0_0_0/0.05)]">
          <Label
            htmlFor="distance-km"
            className="block text-center text-[13px] font-semibold uppercase tracking-wide text-muted-foreground"
          >
            Distance
          </Label>
          <div className="mt-2 flex items-baseline justify-center gap-2">
            <input
              id="distance-km"
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0.1"
              max="1000"
              placeholder="0"
              value={distanceKm}
              onChange={(e) => setDistanceKm(e.target.value)}
              style={{ width: `${Math.max(1, distanceKm.length) + 0.6}ch` }}
              className="app-distance-input min-w-[1.6ch] max-w-[7ch] bg-transparent text-center font-display text-[56px] font-black leading-none tracking-tight text-foreground outline-none placeholder:text-muted-foreground/35"
              required
            />
            <span className="text-2xl font-bold text-muted-foreground">km</span>
          </div>
          <div className="mt-4 grid grid-cols-6 gap-1.5">
            {presets.map((preset) => (
              <button
                key={preset}
                type="button"
                onClick={() => handleSetDistance(preset)}
                className={cn(
                  "h-10 rounded-full border text-[14px] font-semibold",
                  Number(distanceKm) === preset
                    ? "border-foreground bg-foreground text-background"
                    : "border-border bg-background text-foreground",
                )}
              >
                {preset}
              </button>
            ))}
          </div>
        </div>

        {/* Date */}
        <div className="space-y-2">
          <p className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Quand ?
          </p>
          <div className="flex gap-1 rounded-2xl bg-muted p-1">
            <button
              type="button"
              disabled={joiningGroup}
              className={pill(dateMode === "today")}
              onClick={() => {
                setAppOtherDate(false);
                setRideDate(today);
              }}
            >
              Aujourd&apos;hui
            </button>
            <button
              type="button"
              disabled={joiningGroup || yesterday < CHALLENGE_START}
              className={pill(dateMode === "yesterday")}
              onClick={() => {
                setAppOtherDate(false);
                setRideDate(yesterday);
              }}
            >
              Hier
            </button>
            <button
              type="button"
              disabled={joiningGroup}
              className={pill(dateMode === "other")}
              onClick={() => setAppOtherDate(true)}
            >
              Autre jour
            </button>
          </div>
          {dateMode === "other" && (
            <Input
              id="ride-date"
              type="date"
              value={rideDate}
              onChange={(e) => setRideDate(e.target.value)}
              disabled={joiningGroup}
              className="h-12 rounded-2xl bg-card text-[16px]"
              min={CHALLENGE_START}
              max={today}
              required
            />
          )}
        </div>

        {/* Preuve */}
        <div className="space-y-2">
          <p className="px-1 text-[13px] font-semibold uppercase tracking-wide text-muted-foreground">
            Preuve
          </p>
          <div className="space-y-3 rounded-3xl border border-border/50 bg-card p-4 shadow-[0_1px_3px_rgb(0_0_0/0.05)]">
            <div className="flex gap-1 rounded-2xl bg-muted p-1">
              <button
                type="button"
                className={pill(activeTab === "strava")}
                onClick={() => setActiveTab("strava")}
              >
                Lien Strava
              </button>
              <button
                type="button"
                className={pill(activeTab === "photo")}
                onClick={() => setActiveTab("photo")}
              >
                Photo
              </button>
            </div>
            {activeTab === "strava" ? (
              <>
                <Input
                  inputMode="url"
                  placeholder="Colle le lien de ton activité Strava"
                  value={stravaUrl}
                  onChange={(e) => setStravaUrl(e.target.value)}
                  className="h-12 rounded-2xl text-[16px]"
                />
                <p className="flex items-center gap-1.5 px-1 text-[13px] text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-500" />
                  Validée tout de suite
                </p>
              </>
            ) : (
              <>
                <label className="flex h-14 cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed border-border px-3 text-[15px] font-semibold text-foreground">
                  {proofPreview ? (
                    <img src={proofPreview} alt="" className="h-9 w-9 rounded-lg object-cover" />
                  ) : (
                    <Upload className="h-5 w-5 text-primary" />
                  )}
                  <span className="truncate">
                    {proofFile ? proofFile.name : "Ajouter une photo ou une capture"}
                  </span>
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleFileChange}
                  />
                </label>
                <p className="flex items-center gap-1.5 px-1 text-[13px] text-muted-foreground">
                  <Clock className="h-4 w-4 shrink-0 text-amber-500" />
                  Vérifiée par le staff
                </p>
              </>
            )}
          </div>
        </div>

        {/* Patrouille */}
        <div className="flex items-center justify-between gap-3 rounded-2xl bg-muted/60 px-4 py-2">
          <span className="text-[14px] text-muted-foreground">Pour la patrouille</span>
          <Select
            value={selectedPatrolId}
            onValueChange={(val) => setSelectedPatrolId(val)}
            disabled={loadingPatrols || submitting}
          >
            <SelectTrigger
              id="patrol-select"
              className="h-10 w-auto min-w-0 gap-1.5 border-0 bg-transparent px-0 text-[15px] font-semibold shadow-none focus:ring-0"
            >
              <SelectValue placeholder={loadingPatrols ? "Chargement…" : "Choisir"} />
            </SelectTrigger>
            <SelectContent className="max-h-80 rounded-xl">
              {patrols.map((p) => (
                <SelectItem key={p.id} value={p.id} className="py-2.5 text-[15px]">
                  {getPatrolEmblem(p.name)} {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Détails facultatifs */}
        <div className="rounded-3xl border border-border/50 bg-card shadow-[0_1px_3px_rgb(0_0_0/0.05)]">
          <button
            type="button"
            onClick={() => setAppDetailsOpen(!appDetailsOpen)}
            aria-expanded={appDetailsOpen}
            className="flex min-h-[60px] w-full items-center gap-3 px-4 text-left"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-[16px] font-semibold text-foreground">
                Plus de détails
                {detailCount > 0 && (
                  <span className="ml-2 rounded-full bg-primary/12 px-2 py-0.5 text-[12px] font-bold text-primary">
                    {detailCount}
                  </span>
                )}
              </span>
              <span className="block truncate text-[13px] text-muted-foreground">
                Dénivelé, sortie à plusieurs
                {sportChallenges.length > 0 ? ", défi" : ""}, trace GPX, commentaire
              </span>
            </span>
            <ChevronDown
              className={cn(
                "h-5 w-5 shrink-0 text-muted-foreground transition-transform",
                appDetailsOpen && "rotate-180",
              )}
            />
          </button>
          {appDetailsOpen && (
            <div className="space-y-5 border-t border-border/60 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="elevation-m" className="text-[14px] font-semibold">
                  Dénivelé positif (m)
                </Label>
                <Input
                  id="elevation-m"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  max="20000"
                  placeholder="ex : 350"
                  value={elevationM}
                  onChange={(e) => setElevationM(e.target.value)}
                  className="h-12 rounded-2xl text-[16px]"
                />
                <p className="text-[12px] text-muted-foreground">Compte pour le maillot à pois.</p>
              </div>
              {challengeBlock}
              <GroupRidePicker
                key={pickerKey}
                userId={user?.id}
                value={groupChoice}
                onChange={handleGroupChoice}
              />
              {gpxBlock}
              <div className="space-y-1.5">
                <Label htmlFor="ride-note" className="text-[14px] font-semibold">
                  Commentaire
                </Label>
                <Input
                  id="ride-note"
                  placeholder="ex : tour du lac avec la patrouille"
                  value={rideNote}
                  onChange={(e) => setRideNote(e.target.value)}
                  className="h-12 rounded-2xl text-[16px]"
                />
              </div>
            </div>
          )}
        </div>

        {/* Bouton d'envoi */}
        <div className="pt-1">
          <Button
            type="submit"
            disabled={submitting}
            className={cn(
              "h-14 w-full rounded-2xl text-[17px] font-bold shadow-sm",
              sport === "course"
                ? "bg-purple-600 text-white hover:bg-purple-700"
                : sport === "marche"
                  ? "bg-sky-600 text-white hover:bg-sky-700"
                  : "bg-primary text-primary-foreground hover:bg-primary/90",
            )}
          >
            {submitting ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Enregistrement…
              </>
            ) : (
              <>Enregistrer{distanceKm ? ` ${distanceKm} km` : ""}</>
            )}
          </Button>
        </div>
      </form>
    );
  }

  if (variant === "app") {
    return renderAppForm();
  }

  return (
    <>
      <Card className={cn("overflow-hidden border-border/80 shadow-md", className)}>
        <CardHeader className="bg-gradient-to-r from-primary/10 via-amber-500/5 to-transparent pb-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  "grid h-10 w-10 place-items-center rounded-xl text-white shadow-sm transition-colors",
                  SPORT_COLORS[sport].solid,
                )}
              >
                <SportIcon sport={sport} className="h-5 w-5" />
              </span>
              <div>
                <CardTitle className="font-display text-xl font-bold">
                  {sport === "course"
                    ? "Enregistrer une course à pied"
                    : sport === "marche"
                      ? "Enregistrer une marche"
                      : title}
                </CardTitle>
                <CardDescription className="text-xs">
                  {sport === "course"
                    ? "Indique tes kilomètres de course pour le classement course à pied de ta patrouille"
                    : sport === "marche"
                      ? "Indique tes kilomètres de marche ou de rando pour le classement marche de ta patrouille"
                      : description}
                </CardDescription>
              </div>
            </div>
            {selectedPatrolObj && (
              <Badge
                variant="outline"
                className="hidden sm:inline-flex gap-1.5 py-1 px-2.5 font-bold"
              >
                <span>{getPatrolEmblem(selectedPatrolObj.name)}</span>
                <span>{selectedPatrolObj.name}</span>
              </Badge>
            )}
          </div>

          {/* SÉLECTEUR DU SPORT (VÉLO / COURSE À PIED / MARCHE) */}
          <div className="mt-4 grid grid-cols-3 gap-1.5 rounded-xl bg-muted/60 p-1 border border-border/60">
            {(["velo", "course", "marche"] as const).map((sp) => (
              <button
                key={sp}
                type="button"
                onClick={() => setSport(sp)}
                disabled={joiningGroup}
                aria-pressed={sport === sp}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg px-1 py-2 text-xs font-black transition-all",
                  sport === sp
                    ? cn(SPORT_COLORS[sp].solid, "shadow-sm")
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <SportIcon sport={sp} className="h-4 w-4 shrink-0" />
                <span>{sp === "course" ? "Course à pied" : SPORT_INFO[sp].short}</span>
              </button>
            ))}
          </div>
        </CardHeader>

        <CardContent className="p-6">
          {!user && (
            <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-amber-900 font-medium">
                <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                <span>
                  Tu n'es pas connecté. Connecte-toi ou crée ton compte scout pour que tes sorties
                  soient enregistrées dans Supabase !
                </span>
              </div>
              <Button size="sm" asChild className="shrink-0 font-bold text-xs">
                <Link to="/auth">Connexion / Inscription</Link>
              </Button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label
                  htmlFor="patrol-select"
                  className="text-sm font-bold flex items-center gap-2"
                >
                  <Users className="h-4 w-4 text-primary" />
                  Patrouille associée <span className="text-destructive">*</span>
                </Label>
                <span className="text-[11px] text-muted-foreground">
                  Les kilomètres compteront pour cette patrouille
                </span>
              </div>

              <Select
                value={selectedPatrolId}
                onValueChange={(val) => setSelectedPatrolId(val)}
                disabled={loadingPatrols || submitting}
              >
                <SelectTrigger
                  id="patrol-select"
                  className="h-12 w-full rounded-xl border-input bg-card px-4 text-sm font-semibold shadow-xs hover:border-primary/60 transition-colors"
                >
                  <SelectValue
                    placeholder={
                      loadingPatrols
                        ? "Chargement des patrouilles..."
                        : "Sélectionner une patrouille..."
                    }
                  />
                </SelectTrigger>

                <SelectContent className="max-h-80 rounded-xl">
                  {patrols.map((p) => {
                    const emblem = getPatrolEmblem(p.name);
                    const isStaff = isStaffPatrol(p);
                    return (
                      <SelectItem
                        key={p.id}
                        value={p.id}
                        className="cursor-pointer py-2.5 pl-3 pr-2 text-sm font-medium focus:bg-accent focus:text-accent-foreground"
                      >
                        <div className="flex items-center justify-between w-full gap-3">
                          <div className="flex items-center gap-2.5">
                            <span className="text-lg leading-none">{emblem}</span>
                            <span className="font-bold text-foreground">{p.name}</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] uppercase font-bold px-1.5 py-0",
                              isStaff
                                ? "border-purple-300 text-purple-700 bg-purple-50 dark:bg-purple-950/40 dark:text-purple-300"
                                : p.category === "femme"
                                  ? "border-rose-300 text-rose-700 bg-rose-50 dark:bg-rose-950/40 dark:text-rose-300"
                                  : "border-sky-300 text-sky-700 bg-sky-50 dark:bg-sky-950/40 dark:text-sky-300",
                            )}
                          >
                            {isStaff ? "Staff" : p.category === "femme" ? "Filles" : "Garçons"}
                          </Badge>
                        </div>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>

              {selectedPatrolObj && (
                <p className="text-xs text-muted-foreground flex items-center gap-1.5 pt-0.5">
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                  <span>
                    Cette sortie sera créditée au compteur des{" "}
                    <strong className="text-foreground">{selectedPatrolObj.name}</strong> au
                    classement général.
                  </span>
                </p>
              )}
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="distance-km" className="text-sm font-bold flex items-center gap-2">
                  <SportIcon sport={sport} className={cn("h-4 w-4", SPORT_COLORS[sport].text)} />
                  {sport === "course"
                    ? "Distance courue à pied (km)"
                    : sport === "marche"
                      ? "Distance marchée (km)"
                      : "Distance parcourue à vélo (km)"}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <div className="relative">
                  <Input
                    id="distance-km"
                    type="number"
                    step="0.1"
                    min="0.1"
                    max="1000"
                    placeholder={
                      sport === "velo" ? "ex: 15.5" : sport === "marche" ? "ex: 6" : "ex: 7.5"
                    }
                    value={distanceKm}
                    onChange={(e) => setDistanceKm(e.target.value)}
                    className="h-12 rounded-xl text-lg font-black pl-4 pr-12 shadow-xs"
                    required
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                    KM
                  </span>
                </div>

                <div className="flex flex-wrap items-center gap-1.5 pt-1">
                  <span className="text-[10px] font-semibold text-muted-foreground mr-1">
                    Rapide :
                  </span>
                  {(sport === "course"
                    ? PRESET_DISTANCES_COURSE
                    : sport === "marche"
                      ? PRESET_DISTANCES_MARCHE
                      : PRESET_DISTANCES_VELO
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => handleSetDistance(preset)}
                      className={cn(
                        "rounded-md border px-2 py-0.5 text-[11px] font-semibold transition-colors",
                        sport === "course"
                          ? "border-purple-200 bg-purple-50 text-purple-800 hover:bg-purple-200 dark:border-purple-800 dark:bg-purple-950/40 dark:text-purple-300"
                          : sport === "marche"
                            ? "border-sky-200 bg-sky-50 text-sky-800 hover:bg-sky-200 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
                            : "border-border bg-muted/40 text-foreground hover:bg-primary/20 hover:border-primary",
                      )}
                    >
                      {preset} km
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="ride-date" className="text-sm font-bold flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" />
                  {sport === "course"
                    ? "Date de la course"
                    : sport === "marche"
                      ? "Date de la marche"
                      : "Date de la sortie"}{" "}
                  <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="ride-date"
                  type="date"
                  value={rideDate}
                  onChange={(e) => setRideDate(e.target.value)}
                  disabled={joiningGroup}
                  className="h-12 rounded-xl shadow-xs"
                  min={CHALLENGE_START}
                  max={new Date().toISOString().slice(0, 10)}
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Par défaut : aujourd&apos;hui (modifiable si la sortie date d&apos;hier). Seules
                  les sorties depuis le {CHALLENGE_START_LABEL} comptent.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="elevation-m" className="text-sm font-bold flex items-center gap-2">
                <Mountain className="h-4 w-4 text-red-600" />
                Dénivelé positif (D+){" "}
                <span className="text-xs font-normal text-muted-foreground">facultatif</span>
              </Label>
              <div className="relative sm:max-w-[calc(50%-0.5rem)]">
                <Input
                  id="elevation-m"
                  type="number"
                  inputMode="numeric"
                  step="1"
                  min="0"
                  max="20000"
                  placeholder="ex: 350"
                  value={elevationM}
                  onChange={(e) => setElevationM(e.target.value)}
                  className="h-12 rounded-xl text-lg font-bold pl-4 pr-12 shadow-xs"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-muted-foreground">
                  M
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Visible sur Strava ou ta montre (« dénivelé » / « elevation gain »). Compte pour le
                maillot à pois.
              </p>
            </div>

            {challengeBlock}

            <GroupRidePicker
              key={pickerKey}
              userId={user?.id}
              value={groupChoice}
              onChange={handleGroupChoice}
            />

            <div className="space-y-3 rounded-xl border border-border/70 bg-card/60 p-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                  <FileText className="h-3.5 w-3.5" />
                  Preuve de la sortie
                </Label>
                <div className="flex rounded-lg bg-muted p-0.5 text-xs">
                  <button
                    type="button"
                    onClick={() => setActiveTab("strava")}
                    className={cn(
                      "rounded-md px-3 py-1 font-semibold transition-all",
                      activeTab === "strava"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Lien Strava
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("photo")}
                    className={cn(
                      "rounded-md px-3 py-1 font-semibold transition-all",
                      activeTab === "photo"
                        ? "bg-card text-foreground shadow-xs"
                        : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    Photo compteur
                  </button>
                </div>
              </div>

              {activeTab === "strava" ? (
                <div className="space-y-1.5">
                  <div className="relative">
                    <ExternalLink className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-orange-500" />
                    <Input
                      placeholder="https://www.strava.com/activities/123456789..."
                      value={stravaUrl}
                      onChange={(e) => setStravaUrl(e.target.value)}
                      className="h-10 pl-10 text-xs rounded-lg"
                    />
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-emerald-500 shrink-0" />
                    Les sorties certifiées Strava sont <strong>validées automatiquement</strong>.
                  </p>
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center gap-3">
                    <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-foreground transition-all">
                      <Upload className="h-4 w-4 text-primary" />
                      <span>
                        {proofFile
                          ? proofFile.name
                          : "Importer une photo de compteur / capture d'appli"}
                      </span>
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleFileChange}
                      />
                    </label>
                    {proofPreview && (
                      <img
                        src={proofPreview}
                        alt="Aperçu justificatif"
                        className="h-12 w-12 rounded-lg object-cover border border-border shrink-0 shadow-xs"
                      />
                    )}
                  </div>
                  <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                    Les photos sont soumises à une rapide validation par le staff.
                  </p>
                </div>
              )}
            </div>

            {gpxBlock}

            <div className="space-y-1.5">
              <Label htmlFor="ride-note" className="text-xs font-semibold text-muted-foreground">
                Commentaire ou parcours (optionnel)
              </Label>
              <Input
                id="ride-note"
                placeholder="Ex: Aller-retour forêt du Pilat, vent de face..."
                value={rideNote}
                onChange={(e) => setRideNote(e.target.value)}
                className="h-10 text-xs rounded-lg"
              />
            </div>

            <Button
              type="submit"
              disabled={submitting}
              size="lg"
              className={cn(
                "h-auto min-h-11 w-full whitespace-normal rounded-xl py-3 font-display font-black text-sm sm:text-base shadow-md gap-2 transition-all",
                sport === "course"
                  ? "bg-purple-600 hover:bg-purple-700 text-white"
                  : sport === "marche"
                    ? "bg-sky-600 hover:bg-sky-700 text-white"
                    : "bg-primary hover:bg-primary/90 text-primary-foreground",
              )}
            >
              {submitting ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>Enregistrement en cours...</span>
                </>
              ) : (
                <>
                  <SportIcon sport={sport} className="h-5 w-5 shrink-0" />
                  <span className="text-center">
                    Ajouter {distanceKm ? `${distanceKm} km` : "mes kilomètres"} de{" "}
                    {SPORT_INFO[sport].short.toLowerCase()} à{" "}
                    {selectedPatrolObj ? selectedPatrolObj.name : "ma patrouille"}
                  </span>
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>
    </>
  );
}

export default DailyDistanceForm;
