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
import { AlezanMascot } from '../components/AlezanMascot';
import { AlezanNamePoll } from '../components/AlezanNamePoll';

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
}

const PRESET_DISTANCES_VELO = [5, 10, 15, 25, 40, 60];
const PRESET_DISTANCES_COURSE = [2, 5, 8, 10, 15, 21];
const PRESET_DISTANCES_MARCHE = [2, 4, 6, 10, 15, 20];

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
}: DailyDistanceFormProps) {
  const { user, profile, isAdmin, refreshProfile } = useAuth();
  const { theme } = useSeasonalTheme();

  // Form states
  const [sport, setSport] = useState<ActivitySport>("velo");
  const [distanceKm, setDistanceKm] = useState("");
  const [elevationM, setElevationM] = useState("");
  const [rideDate, setRideDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [selectedPatrolId, setSelectedPatrolId] = useState<string>(defaultPatrolId || "");
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
          }
        } catch (err) {
          console.warn("Erreur lors du traitement GPX :", err);
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

  return (
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
              <Label htmlFor="patrol-select" className="text-sm font-bold flex items-center gap-2">
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
                Par défaut : aujourd&apos;hui (modifiable si la sortie date d&apos;hier). Seules les
                sorties depuis le {CHALLENGE_START_LABEL} comptent.
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

          {/* CHAMP OPTIONNEL GPX POUR LA CARTE DE LA TROUPE */}
          <div className="space-y-2 rounded-xl border border-border/70 bg-card/60 p-4">
            <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
              <MapPin className="h-3.5 w-3.5 text-primary" />
              Fichier GPX du parcours (Optionnel pour la carte de la troupe)
            </Label>
            <div className="flex items-center gap-3">
              <label className="flex flex-1 cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-foreground transition-all">
                <Upload className="h-4 w-4 text-primary" />
                <span>{gpxFile ? gpxFile.name : "Ajouter un fichier .gpx (optionnel)"}</span>
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
    <AlezanNamePoll />
  );
}

export default DailyDistanceForm;
