import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/lib/useAuth";
import { gpxDownloadUrl, gpxFileName } from "@/lib/gpxDownload";
import {
  MapPin,
  Shield,
  Plus,
  Upload,
  Trash2,
  Navigation,
  Download,
  Lock,
  LogIn,
  Eye,
  CheckCircle2,
  Sparkles,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  getActivitySport,
  cleanActivityNote,
  type ActivitySport,
  SPORT_INFO,
} from "@/lib/database";
import { SportBadge } from "@/components/SportIcon";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/carte")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Carte interactive — ALEZAN 42" },
      {
        name: "description",
        content:
          "Visualisation des zones roulées et courues avec protection de la vie privée (-200m rognés).",
      },
    ],
  }),
  component: MapPage,
});

type ItemGpx = {
  id: string;
  title: string;
  gpx_url: string;
  type: "activity" | "proposed";
  sport?: ActivitySport;
  km?: number;
  info?: string;
};

// Distance Haversine en mètres
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

// Rognage strict des 200 premiers et 200 derniers mètres pour la vie privée
function cropGpxCoordinates(rawCoords: [number, number][]): [number, number][] {
  if (rawCoords.length < 3) return rawCoords;

  let cumDist = 0;
  const distances: number[] = [0];
  for (let i = 1; i < rawCoords.length; i++) {
    cumDist += getDistanceFromLatLonInMeters(
      rawCoords[i - 1][0],
      rawCoords[i - 1][1],
      rawCoords[i][0],
      rawCoords[i][1],
    );
    distances.push(cumDist);
  }

  const totalDist = distances[distances.length - 1];

  // Si le tracé fait moins de 450m au total, retourner le point médian pour préserver la confidentialité
  if (totalDist < 450) {
    const midIdx = Math.floor(rawCoords.length / 2);
    return [rawCoords[midIdx]];
  }

  // Filtrer les coordonnées à moins de 200m du départ ou à moins de 200m de l'arrivée
  const filtered = rawCoords.filter((_, idx) => {
    const fromStart = distances[idx];
    const fromEnd = totalDist - fromStart;
    return fromStart >= 200 && fromEnd >= 200;
  });

  return filtered.length >= 2 ? filtered : rawCoords;
}

function parseXmlGpxCoords(xmlDoc: Document): [number, number][] {
  let pts = Array.from(xmlDoc.getElementsByTagName("trkpt"));
  if (pts.length === 0) pts = Array.from(xmlDoc.getElementsByTagName("rtept"));
  if (pts.length === 0) pts = Array.from(xmlDoc.getElementsByTagName("wpt"));

  const coords = pts
    .map((pt) => {
      const lat = parseFloat(pt.getAttribute("lat") || "0");
      const lon = parseFloat(pt.getAttribute("lon") || "0");
      return lat && lon ? ([lat, lon] as [number, number]) : null;
    })
    .filter(Boolean) as [number, number][];

  return cropGpxCoordinates(coords);
}

// Fonction pour rogner un fichier XML GPX avant upload
async function processAndCropGpxString(file: File): Promise<string> {
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

function MapPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<ItemGpx[]>([]);
  const [loading, setLoading] = useState(true);
  const [sportFilter, setSportFilter] = useState<"all" | ActivitySport | "proposed">("all");

  // Formulaire de proposition
  const [newTitle, setNewTitle] = useState("");
  const [newDesc, setNewDesc] = useState("");
  const [gpxFile, setGpxFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Référence de la carte Leaflet
  const mapRef = useRef<HTMLDivElement | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapInstanceRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const layerGroupRef = useRef<any>(null);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const loaded: ItemGpx[] = [];

      // 1. Activités validées avec GPX
      const { data: acts } = await supabase
        .from("activities")
        .select("id, km, ride_date, gpx_path, note, status")
        .not("gpx_path", "is", null);

      if (acts) {
        acts.forEach((a) => {
          if (a.gpx_path && (a.status === "approved" || a.status === "pending")) {
            const sport = getActivitySport(a);
            const cleanNote = cleanActivityNote(a.note);
            const sportName = SPORT_INFO[sport].label;
            const title = cleanNote ? `${cleanNote} (${a.km} km)` : `${sportName} (${a.km} km)`;

            loaded.push({
              id: a.id,
              title,
              gpx_url: a.gpx_path,
              type: "activity",
              sport,
              km: Number(a.km) || 0,
              info: `${SPORT_INFO[sport].emoji} ${SPORT_INFO[sport].short} réalisée le ${new Date(a.ride_date).toLocaleDateString("fr-FR")}`,
            });
          }
        });
      }

      // 2. Propositions de sorties
      const { data: props } = await supabase
        .from("proposed_routes")
        .select("*")
        .order("created_at", { ascending: false });

      if (props) {
        props.forEach((p) => {
          if (p.gpx_url) {
            loaded.push({
              id: p.id,
              title: p.title,
              gpx_url: p.gpx_url,
              type: "proposed",
              sport: "velo",
              info: p.description || "Itinéraire proposé par la troupe",
            });
          }
        });
      }

      setItems(loaded);
    } catch (err) {
      console.warn("Erreur chargement traces :", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  // Filtrer les parcours selon le filtre sélectionné
  const displayedItems = useMemo(() => {
    if (sportFilter === "velo" || sportFilter === "course" || sportFilter === "marche")
      return items.filter((i) => i.type === "activity" && i.sport === sportFilter);
    if (sportFilter === "proposed") return items.filter((i) => i.type === "proposed");
    return items;
  }, [items, sportFilter]);

  // Initialisation de la carte Leaflet
  useEffect(() => {
    if (!user) return;

    if (!document.getElementById("leaflet-css")) {
      const link = document.createElement("link");
      link.id = "leaflet-css";
      link.rel = "stylesheet";
      link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
      document.head.appendChild(link);
    }

    const initLeaflet = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = (window as any).L;
      if (!L) return;

      if (!mapInstanceRef.current && mapRef.current) {
        const map = L.map(mapRef.current).setView([50.45, 4.67], 12);
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "&copy; OpenStreetMap contributors",
        }).addTo(map);

        layerGroupRef.current = L.layerGroup().addTo(map);
        mapInstanceRef.current = map;
      }

      if (layerGroupRef.current && L) {
        layerGroupRef.current.clearLayers();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const allBounds: any[] = [];

        displayedItems.forEach((item) => {
          fetch(item.gpx_url)
            .then((res) => res.text())
            .then((gpxText) => {
              const parser = new DOMParser();
              const xmlDoc = parser.parseFromString(gpxText, "text/xml");
              const coords = parseXmlGpxCoords(xmlDoc);

              if (coords.length > 0) {
                // Couleurs distinctes : Vert = Vélo, Violet = Course, Bleu = Marche, Ambre = Proposé
                const color =
                  item.type === "proposed"
                    ? "#f59e0b"
                    : item.sport === "course"
                      ? "#8b5cf6"
                      : item.sport === "marche"
                        ? "#0284c7"
                        : "#10b981";

                const polyline = L.polyline(coords, {
                  color,
                  weight: 5,
                  opacity: 0.85,
                  lineJoin: "round",
                });

                polyline.bindPopup(`
                  <div style="font-family: sans-serif; font-size: 12px; line-height: 1.4;">
                    <b style="font-size: 13px; color: #111;">${item.title}</b>
                    <div style="color: #666; margin-top: 2px;">${item.info || ""}</div>
                    <div style="color: #10b981; font-weight: bold; margin-top: 4px;">
                      🔒 Départ & arrivée protégés (-200m)
                    </div>
                  </div>
                `);

                polyline.addTo(layerGroupRef.current);
                allBounds.push(polyline.getBounds());

                // Auto-ajuster le zoom si tous les tracés sont chargés
                if (mapInstanceRef.current && allBounds.length > 0) {
                  try {
                    const group = L.featureGroup(
                      allBounds.map((b) => L.rectangle(b, { opacity: 0, fillOpacity: 0 })),
                    );
                    mapInstanceRef.current.fitBounds(group.getBounds(), { padding: [40, 40] });
                  } catch {
                    // Ignore bounds fitting error
                  }
                }
              }
            })
            .catch((err) => console.warn("Erreur chargement tracé :", err));
        });
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    if (!(window as any).L) {
      const script = document.createElement("script");
      script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
      script.async = true;
      script.onload = initLeaflet;
      document.body.appendChild(script);
    } else {
      initLeaflet();
    }
  }, [user, displayedItems]);

  // Centrer et zoomer la carte sur un tracé spécifique au clic
  const focusOnRoute = async (gpxUrl: string, title: string) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const L = (window as any).L;
    if (!L || !mapInstanceRef.current) return;

    try {
      const res = await fetch(gpxUrl);
      const text = await res.text();
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(text, "text/xml");
      const coords = parseXmlGpxCoords(xmlDoc);

      if (coords.length > 0) {
        const polyline = L.polyline(coords);
        mapInstanceRef.current.fitBounds(polyline.getBounds(), { padding: [50, 50] });
        toast.success(`Zoom sur : ${title}`);
      } else {
        toast.error("Aucun point GPS valide trouvé dans ce fichier.");
      }
    } catch {
      mapInstanceRef.current.setView([50.45, 4.67], 13);
      toast.info(`Centrage sur la zone principale : ${title}`);
    }
  };

  const handleProposeRoute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !gpxFile || !user) {
      toast.error("Veuillez renseigner un titre et joindre un fichier .gpx");
      return;
    }

    setSubmitting(true);
    try {
      // Rogner les 200m au départ et à l'arrivée avant enregistrement
      const croppedGpxContent = await processAndCropGpxString(gpxFile);
      const croppedBlob = new Blob([croppedGpxContent], { type: "application/gpx+xml" });
      const fileName = `proposed_${user.id}_${Date.now()}.gpx`;

      const { error: uploadError } = await supabase.storage
        .from("proofs")
        .upload(fileName, croppedBlob, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage.from("proofs").getPublicUrl(fileName);
      const publicUrl = urlData.publicUrl;

      const { error: insertError } = await supabase.from("proposed_routes").insert({
        user_id: user.id,
        title: newTitle.trim(),
        description: newDesc.trim() || null,
        gpx_url: publicUrl,
      });

      if (insertError) throw insertError;

      toast.success("Sortie proposée avec succès ! (Départ et arrivée rognés)");
      setNewTitle("");
      setNewDesc("");
      setGpxFile(null);
      loadData();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erreur : " + msg);
    } finally {
      setSubmitting(false);
    }
  };

  const deleteProposedRoute = async (id: string) => {
    if (confirm("Supprimer cette proposition de sortie ?")) {
      const { error } = await supabase.from("proposed_routes").delete().eq("id", id);
      if (!error) {
        toast.success("Proposition supprimée");
        loadData();
      }
    }
  };

  // Sécurité : si non connecté, bloquer l'accès à la carte
  if (!user) {
    return (
      <div className="min-h-screen bg-background py-16 px-4">
        <main className="mx-auto max-w-lg">
          <Card className="border-border shadow-xl text-center p-6">
            <div className="mx-auto mb-4 grid h-16 w-16 place-items-center rounded-2xl bg-amber-500/10 text-amber-600">
              <Lock className="h-8 w-8" />
            </div>
            <CardTitle className="font-display text-2xl font-black">
              Accès réservé aux membres connectés
            </CardTitle>
            <CardDescription className="mt-2 text-xs text-muted-foreground leading-relaxed">
              Pour des raisons de sécurité, de confidentialité et de protection de la vie privée des
              scouts, la carte interactive des tracés GPX n'est accessible qu'aux membres identifiés
              de la troupe.
            </CardDescription>
            <div className="mt-6 flex flex-col gap-2">
              <Button asChild className="w-full font-bold">
                <Link to="/auth" className="flex items-center justify-center gap-2">
                  <LogIn className="h-4 w-4" />
                  <span>Se connecter à mon compte scout</span>
                </Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link to="/">Retour au classement public</Link>
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  const totalKmCartographies = displayedItems.reduce((acc, curr) => acc + (curr.km || 0), 0);

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-7xl px-4 py-8 md:py-12 space-y-6">
        {/* Header & Confidentialité Banner */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 px-2.5 py-1 text-xs font-bold text-emerald-700 dark:text-emerald-400">
              <Shield className="h-3.5 w-3.5" />
              <span>Espace Sécurisé — Rognage automatique -200m actif</span>
            </div>
            <h1 className="mt-2 font-display text-3xl font-black text-foreground">
              Zones Roulées & Explorations de la Troupe
            </h1>
            <p className="text-xs text-muted-foreground">
              Visualise toutes les zones roulées à vélo et courues à pied par les patrouilles.
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="rounded-xl border border-border bg-card px-4 py-2 text-center shadow-xs">
              <div className="font-display text-xl font-black text-foreground">
                {displayedItems.length}
              </div>
              <div className="text-[10px] uppercase font-bold text-muted-foreground">
                Tracés GPX
              </div>
            </div>
            {totalKmCartographies > 0 && (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-center shadow-xs">
                <div className="font-display text-xl font-black text-emerald-700 dark:text-emerald-400">
                  {totalKmCartographies.toFixed(1)} km
                </div>
                <div className="text-[10px] uppercase font-bold text-emerald-700/80 dark:text-emerald-400/80">
                  Cartographiés
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Filtres par sport et type de zone */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border/80 bg-card p-3 shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-muted-foreground uppercase mr-1">
              Afficher :
            </span>
            <button
              type="button"
              onClick={() => setSportFilter("all")}
              className={cn(
                "rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                sportFilter === "all"
                  ? "bg-primary text-primary-foreground shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
            >
              Toutes les zones ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setSportFilter("velo")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                sportFilter === "velo"
                  ? "bg-emerald-600 text-white shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-emerald-400 inline-block" />
              <span>🚴 Zones roulées (Vélo)</span>
            </button>
            <button
              type="button"
              onClick={() => setSportFilter("course")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                sportFilter === "course"
                  ? "bg-purple-600 text-white shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-purple-400 inline-block" />
              <span>🏃 Zones courues (Course)</span>
            </button>
            <button
              type="button"
              onClick={() => setSportFilter("marche")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                sportFilter === "marche"
                  ? "bg-sky-600 text-white shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-sky-400 inline-block" />
              <span>🥾 Zones marchées (Marche)</span>
            </button>
            <button
              type="button"
              onClick={() => setSportFilter("proposed")}
              className={cn(
                "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all",
                sportFilter === "proposed"
                  ? "bg-amber-600 text-white shadow-xs"
                  : "bg-muted/50 text-muted-foreground hover:text-foreground",
              )}
            >
              <span className="h-2 w-2 rounded-full bg-amber-400 inline-block" />
              <span>⭐ Sorties proposées</span>
            </button>
          </div>

          <div className="text-[11px] font-semibold text-muted-foreground flex items-center gap-1.5">
            <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
            <span>200m masqués au départ et à l'arrivée</span>
          </div>
        </div>

        {/* Grille principale : Carte + Colonne latérale */}
        <div className="grid gap-8 lg:grid-cols-[1.9fr_1.1fr]">
          <Card className="border-border/80 shadow-md overflow-hidden">
            <CardHeader className="bg-card pb-4 border-b">
              <CardTitle className="text-base font-bold flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-primary" />
                  <span>Carte des zones explorées</span>
                </div>
                <div className="flex items-center gap-2 text-[11px] font-normal text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-[#10b981]" /> Vélo
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-[#8b5cf6]" /> Course
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-[#0284c7]" /> Marche
                  </span>
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full bg-[#f59e0b]" /> Proposé
                  </span>
                </div>
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[620px] w-full relative">
                <div ref={mapRef} className="h-full w-full z-10" />
              </div>
            </CardContent>
          </Card>

          <div className="space-y-6">
            {/* Formulaire de proposition de sortie */}
            <Card className="border-border/80 shadow-md">
              <CardHeader className="bg-card pb-4 border-b">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <Plus className="h-4 w-4 text-primary" />
                  Proposer un itinéraire GPX
                </CardTitle>
                <CardDescription className="text-xs">
                  Partage un parcours pour donner des idées de balades aux patrouilles.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5">
                <form onSubmit={handleProposeRoute} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Nom du parcours *</Label>
                    <Input
                      placeholder="Ex: Tour de Sambre et forêts"
                      value={newTitle}
                      onChange={(e) => setNewTitle(e.target.value)}
                      required
                      className="h-10 text-xs rounded-lg"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Description / Dénivelé (optionnel)</Label>
                    <Input
                      placeholder="Ex: 24km, facile, idéal pour débutants"
                      value={newDesc}
                      onChange={(e) => setNewDesc(e.target.value)}
                      className="h-10 text-xs rounded-lg"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-bold">Fichier GPX *</Label>
                    <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-border p-3 text-xs font-semibold text-muted-foreground hover:border-primary hover:text-foreground transition-all">
                      <Upload className="h-4 w-4 text-primary" />
                      <span>{gpxFile ? gpxFile.name : "Sélectionner un fichier .gpx"}</span>
                      <input
                        type="file"
                        accept=".gpx,application/gpx+xml"
                        className="hidden"
                        onChange={(e) => setGpxFile(e.target.files?.[0] || null)}
                      />
                    </label>
                    <p className="text-[10px] text-muted-foreground">
                      🔒 Les 200 premiers et derniers mètres seront épurés pour la vie privée.
                    </p>
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="w-full font-bold text-xs gap-2 rounded-xl"
                  >
                    {submitting ? "Traitement et rognage..." : "Publier l'itinéraire"}
                  </Button>
                </form>
              </CardContent>
            </Card>

            {/* Liste des parcours explorés */}
            <Card className="border-border/80 shadow-md">
              <CardHeader className="bg-card pb-4 border-b">
                <CardTitle className="text-base font-bold flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-primary" />
                    <span>Tracés explorés ({displayedItems.length})</span>
                  </div>
                </CardTitle>
                <CardDescription className="text-xs">
                  Clique sur un tracé pour le centrer directement sur la carte.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-2.5 max-h-[350px] overflow-y-auto">
                {loading ? (
                  <p className="text-xs text-muted-foreground text-center py-6">
                    Chargement des tracés de la troupe...
                  </p>
                ) : displayedItems.length === 0 ? (
                  <div className="text-center py-8 space-y-2">
                    <p className="text-xs text-muted-foreground">
                      Aucun tracé GPX dans cette catégorie.
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      Ajoute un GPX lors de ta prochaine sortie dans "Mes km" !
                    </p>
                  </div>
                ) : (
                  displayedItems.map((item) => {
                    const isProposed = item.type === "proposed";

                    return (
                      <div
                        key={item.id}
                        onClick={() => focusOnRoute(item.gpx_url, item.title)}
                        className="group flex items-center justify-between rounded-xl border border-border/70 p-3 bg-card hover:border-primary/60 hover:bg-muted/30 transition cursor-pointer"
                      >
                        <div className="space-y-1 pr-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-bold text-foreground group-hover:text-primary transition-colors">
                              {item.title}
                            </span>
                            {isProposed ? (
                              <Badge
                                variant="outline"
                                className="text-[10px] font-bold gap-1 text-amber-600 bg-amber-500/10 border-amber-400/30"
                              >
                                Proposition
                              </Badge>
                            ) : (
                              <SportBadge
                                sport={item.sport ?? "velo"}
                                iconClassName="h-2.5 w-2.5"
                              />
                            )}
                          </div>
                          {item.info && (
                            <p className="text-[11px] text-muted-foreground line-clamp-1">
                              {item.info}
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-primary hover:bg-primary/10"
                            title="Centrer la carte"
                          >
                            <Navigation className="h-4 w-4" />
                          </Button>
                          <Button
                            asChild
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8 text-emerald-600 hover:bg-emerald-500/10"
                            title="Télécharger le fichier GPX"
                          >
                            <a
                              href={gpxDownloadUrl(item.gpx_url, item.title)}
                              download={gpxFileName(item.title)}
                              onClick={(e) => e.stopPropagation()}
                              aria-label={`Télécharger le GPX : ${item.title}`}
                            >
                              <Download className="h-4 w-4" />
                            </a>
                          </Button>
                          {isProposed && user?.id && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteProposedRoute(item.id);
                              }}
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </main>
    </div>
  );
}

export default MapPage;
