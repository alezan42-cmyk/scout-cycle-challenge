import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Compass,
  Flag,
  CheckCircle2,
  Lock,
  Sparkles,
  Bike,
  RotateCw,
  Flame,
  Award,
  Navigation,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { db } from "@/lib/database";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

export interface Waypoint {
  id: string;
  name: string;
  subtitle: string;
  target_km: number;
  description: string;
  badge_name: string;
  badge_emoji: string;
  x: number;
  y: number;
}

const kmFmt = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 0 });
const fmtKm = (km: number) => kmFmt.format(km);

/** Place les étapes en zigzag régulier sur la carte (quel que soit leur nombre). */
function layoutWaypoints(list: Waypoint[]): Waypoint[] {
  const n = list.length;
  const left = 60;
  const right = 880;
  return list.map((wp, i) => ({
    ...wp,
    x: n > 1 ? Math.round(left + ((right - left) * i) / (n - 1)) : 470,
    y: i % 2 === 0 ? 285 : 165,
  }));
}

export interface CollectiveRouteMapProps {
  className?: string;
  overrideKm?: number;
}

export function CollectiveRouteMap({ className, overrideKm }: CollectiveRouteMapProps) {
  const [totalKm, setTotalKm] = useState<number>(0);
  const [waypoints, setWaypoints] = useState<Waypoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedWaypointId, setSelectedWaypointId] = useState<string>("");

  // Charger les étapes depuis Supabase
  const loadWaypoints = async () => {
    try {
      const { data } = await supabase
        .from("expedition_waypoints")
        .select("*")
        .order("target_km", { ascending: true });
      if (data && data.length > 0) {
        setWaypoints(layoutWaypoints(data as Waypoint[]));
      }
    } catch (err) {
      console.warn("Erreur chargement des waypoints :", err);
    }
  };

  const loadCollectiveDistance = useCallback(
    async (isManual = false) => {
      if (isManual) setRefreshing(true);
      else setLoading(true);

      try {
        if (overrideKm !== undefined) {
          setTotalKm(overrideKm);
          return;
        }

        const { data: actsData } = await supabase.from("activities_public").select("km, status");

        let kmSum = 0;
        if (actsData && actsData.length > 0) {
          kmSum = actsData
            .filter((a) => a.status === "approved" || a.status === "pending")
            .reduce((sum, item) => sum + (Number(item.km) || 0), 0);
        }

        setTotalKm(Math.round(kmSum * 10) / 10);
      } catch (err) {
        console.warn("Erreur chargement kilomètres collectifs :", err);
        setTotalKm(0);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [overrideKm],
  );

  useEffect(() => {
    loadWaypoints();
    loadCollectiveDistance();
    return db.subscribe(() => loadCollectiveDistance(false));
  }, [loadCollectiveDistance]);

  // Calcul des étapes actuelles et suivantes
  const {
    currentStageIndex,
    nextStage,
    previousStage,
    kmToNext,
    stageProgressPercent,
    mapProgressPercent,
  } = useMemo(() => {
    if (waypoints.length === 0) {
      return {
        currentStageIndex: 0,
        nextStage: {
          id: "",
          name: "",
          subtitle: "",
          target_km: 0,
          description: "",
          badge_name: "",
          badge_emoji: "",
          x: 0,
          y: 0,
        },
        previousStage: {
          id: "",
          name: "",
          subtitle: "",
          target_km: 0,
          description: "",
          badge_name: "",
          badge_emoji: "",
          x: 0,
          y: 0,
        },
        kmToNext: 0,
        stageProgressPercent: 0,
        overallProgressPercent: 0,
        mapProgressPercent: 0,
      };
    }

    let nextIdx = waypoints.findIndex((wp) => wp.target_km > totalKm);
    if (nextIdx === -1) {
      nextIdx = waypoints.length - 1;
    }

    const next = waypoints[nextIdx];
    const prev = waypoints[Math.max(0, nextIdx - 1)];

    const kmRemaining = Math.max(0, next.target_km - totalKm);
    const segmentSpan = next.target_km - prev.target_km;
    const segmentProgress = totalKm - prev.target_km;
    const stagePercent =
      segmentSpan > 0 ? Math.min(100, Math.max(0, (segmentProgress / segmentSpan) * 100)) : 100;

    const maxExpeditionKm = waypoints[waypoints.length - 1].target_km || 1;
    const overallPercent = Math.min(100, Math.max(0, (totalKm / maxExpeditionKm) * 100));
    // Tracé coloré : avance d'étape en étape (les étapes sont régulièrement espacées)
    const prevIdx = Math.max(0, nextIdx - 1);
    const mapPercent =
      waypoints.length > 1
        ? Math.min(
            100,
            ((prevIdx + (nextIdx > 0 ? stagePercent / 100 : 0)) / (waypoints.length - 1)) * 100,
          )
        : 100;

    return {
      currentStageIndex: nextIdx,
      nextStage: next,
      previousStage: prev,
      kmToNext: Math.round(kmRemaining * 10) / 10,
      stageProgressPercent: Math.round(stagePercent),
      overallProgressPercent: Math.round(overallPercent * 10) / 10,
      mapProgressPercent: mapPercent,
    };
  }, [totalKm, waypoints]);

  useEffect(() => {
    // Par défaut : la prochaine destination (une fois les km chargés)
    if (!loading && nextStage && nextStage.id && !selectedWaypointId) {
      setSelectedWaypointId(nextStage.id);
    }
  }, [loading, nextStage, selectedWaypointId]);

  const cyclistPosition = useMemo(() => {
    if (!previousStage.id || !nextStage.id) return { x: 100, y: 350 };
    const fraction = stageProgressPercent / 100;
    const x = previousStage.x + (nextStage.x - previousStage.x) * fraction;
    const y = previousStage.y + (nextStage.y - previousStage.y) * fraction;
    return { x: Math.round(x), y: Math.round(y) };
  }, [previousStage, nextStage, stageProgressPercent]);

  const pathD = useMemo(() => {
    if (waypoints.length === 0) return "";
    return waypoints.reduce((acc, pt, idx) => {
      if (idx === 0) return `M ${pt.x} ${pt.y}`;
      const prev = waypoints[idx - 1];
      const cx1 = prev.x + (pt.x - prev.x) * 0.5;
      const cy1 = prev.y;
      const cx2 = prev.x + (pt.x - prev.x) * 0.5;
      const cy2 = pt.y;
      return `${acc} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${pt.x} ${pt.y}`;
    }, "");
  }, [waypoints]);

  const selectedWaypoint = waypoints.find((wp) => wp.id === selectedWaypointId) || nextStage;

  const isSelectedWaypointReached = totalKm >= (selectedWaypoint?.target_km || 0);

  if (waypoints.length === 0) return null;

  return (
    <Card className={cn("overflow-hidden border-border/80 shadow-md", className)}>
      <CardHeader className="bg-gradient-to-r from-emerald-600/15 via-primary/10 to-amber-500/10 pb-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-600 to-primary text-white shadow-md">
              <Compass className="h-5 w-5" />
            </span>
            <div>
              <CardTitle className="font-display text-xl font-bold flex items-center gap-2">
                <span>Le Grand Périple Scout</span>
                <Badge
                  variant="outline"
                  className="text-[10px] font-bold border-emerald-500/40 text-emerald-600"
                >
                  Carte Collective
                </Badge>
              </CardTitle>
              <CardDescription className="text-xs">
                Chaque kilomètre fait avancer la troupe, de Moustier jusqu&apos;au tour du monde
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="px-3 py-1 font-mono font-black text-sm">
              <Bike className="h-3.5 w-3.5 mr-1 text-primary" />
              {totalKm.toFixed(1)} km au total
            </Badge>

            <Button
              variant="outline"
              size="icon"
              onClick={() => loadCollectiveDistance(true)}
              disabled={loading || refreshing}
              className="h-8 w-8 text-muted-foreground hover:text-foreground"
            >
              <RotateCw className={cn("h-4 w-4", refreshing && "animate-spin text-primary")} />
            </Button>
          </div>
        </div>

        <div className="mt-4 rounded-2xl border border-primary/25 bg-card/95 p-4 shadow-sm backdrop-blur-sm">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                  <Navigation className="h-3 w-3 animate-pulse" />
                  Prochaine destination
                </span>
                <span className="text-xs text-muted-foreground">
                  Étape {currentStageIndex} sur {waypoints.length - 1}
                </span>
              </div>

              <div className="flex items-baseline gap-2">
                <h3 className="font-display text-lg sm:text-xl font-black text-foreground truncate">
                  {nextStage.name}
                </h3>
                <span className="text-xs font-semibold text-muted-foreground">
                  ({fmtKm(nextStage.target_km)} km)
                </span>
              </div>

              <p className="text-xs text-muted-foreground">{nextStage.subtitle}</p>
            </div>

            <div className="flex items-center gap-4 bg-muted/40 p-3 rounded-xl border border-border/60 shrink-0">
              <div className="text-right">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Distance restante
                </div>
                <div className="font-display text-2xl font-black text-primary">
                  {kmToNext === 0 ? "Franchie !" : `${kmToNext} km`}
                </div>
              </div>
              <div className="h-10 w-10 grid place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
                <Flag className="h-5 w-5" />
              </div>
            </div>
          </div>

          <div className="mt-3.5 space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-muted-foreground">
                Depuis {previousStage.name} ({fmtKm(previousStage.target_km)} km)
              </span>
              <span className="font-mono font-bold text-primary">
                {stageProgressPercent}% complété
              </span>
            </div>
            <Progress value={stageProgressPercent} className="h-2.5 rounded-full" />
          </div>
        </div>
      </CardHeader>

      <CardContent className="p-4 sm:p-6 space-y-6">
        <div className="relative overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-b from-card to-muted/20 shadow-inner">
          <div className="w-full overflow-x-auto">
            <svg
              viewBox="0 0 940 440"
              className="w-full h-auto min-w-[720px] select-none"
              style={{ maxHeight: "420px" }}
            >
              <defs>
                <linearGradient id="routeGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#10b981" />
                  <stop offset="60%" stopColor="#f59e0b" />
                  <stop offset="100%" stopColor="#ef4444" />
                </linearGradient>
                <filter id="pinShadow" x="-20%" y="-20%" width="140%" height="140%">
                  <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.3" />
                </filter>
              </defs>

              <path
                d={pathD}
                fill="none"
                stroke="currentColor"
                strokeOpacity="0.2"
                strokeWidth="6"
                strokeLinecap="round"
                strokeDasharray="8 8"
              />
              <path
                d={pathD}
                fill="none"
                stroke="url(#routeGradient)"
                strokeWidth="5"
                strokeLinecap="round"
                pathLength={100}
                strokeDasharray="100"
                strokeDashoffset={100 - mapProgressPercent}
                className="transition-all duration-700 ease-out"
              />

              {waypoints.map((wp, idx) => {
                const isReached = totalKm >= wp.target_km;
                const isNext = wp.id === nextStage.id;
                const isSelected = wp.id === selectedWaypoint?.id;

                let fillColor = "#94a3b8";
                if (isReached) fillColor = "#10b981";
                if (isNext) fillColor = "#f59e0b";

                return (
                  <g
                    key={wp.id}
                    onClick={() => setSelectedWaypointId(wp.id)}
                    className="cursor-pointer transition-transform hover:scale-110 origin-center"
                    transform={`translate(${wp.x}, ${wp.y})`}
                  >
                    {isNext && (
                      <circle
                        r="22"
                        fill="none"
                        stroke="#f59e0b"
                        strokeWidth="2"
                        opacity="0.6"
                        className="animate-ping"
                      />
                    )}
                    {isSelected && (
                      <circle
                        r="20"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2"
                        strokeDasharray="3 3"
                        className="animate-spin text-primary"
                        style={{ animationDuration: "12s" }}
                      />
                    )}
                    <circle
                      r="14"
                      fill={fillColor}
                      filter="url(#pinShadow)"
                      stroke="#ffffff"
                      strokeWidth="2.5"
                    />
                    <text textAnchor="middle" dy="4" fontSize="10" fontWeight="bold" fill="#ffffff">
                      {isReached ? "✓" : idx}
                    </text>
                    <title>{`${wp.name} – ${fmtKm(wp.target_km)} km`}</title>
                    <text
                      y={idx % 2 === 0 ? 32 : -24}
                      textAnchor="middle"
                      className={cn(
                        "text-[11px] font-bold select-none",
                        isSelected
                          ? "fill-primary font-black"
                          : isReached
                            ? "fill-foreground"
                            : "fill-muted-foreground",
                      )}
                    >
                      {wp.badge_emoji} {fmtKm(wp.target_km)} km
                    </text>
                  </g>
                );
              })}

              <g
                transform={`translate(${cyclistPosition.x}, ${cyclistPosition.y})`}
                className="transition-all duration-700 ease-out"
              >
                <circle r="18" fill="#10b981" opacity="0.25" className="animate-ping" />
                <circle
                  r="12"
                  fill="#f97316"
                  stroke="#ffffff"
                  strokeWidth="2"
                  filter="url(#pinShadow)"
                />
                <text textAnchor="middle" dy="4" fontSize="10">
                  🚴
                </text>
              </g>
            </svg>
          </div>
        </div>

        {selectedWaypoint && (
          <div className="rounded-2xl border border-border/80 bg-card p-5 shadow-xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-border/60 pb-3">
              <div className="flex items-center gap-3">
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-2xl shadow-xs border border-primary/20">
                  {selectedWaypoint.badge_emoji}
                </span>
                <div>
                  <div className="flex items-center gap-2">
                    <h4 className="font-display text-lg font-bold text-foreground">
                      {selectedWaypoint.name}
                    </h4>
                    {isSelectedWaypointReached ? (
                      <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 text-[10px] font-bold">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Validée
                      </Badge>
                    ) : selectedWaypoint.id === nextStage?.id ? (
                      <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20 text-[10px] font-bold">
                        <Flame className="h-3 w-3 mr-1" /> Actuelle
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-muted-foreground font-semibold"
                      >
                        <Lock className="h-3 w-3 mr-1" /> Verrouillé
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Distance requise : <strong>{fmtKm(selectedWaypoint.target_km)} km</strong>
                    {selectedWaypoint.subtitle &&
                      selectedWaypoint.subtitle !== selectedWaypoint.name && (
                        <> · {selectedWaypoint.subtitle}</>
                      )}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                <Award className="h-4 w-4 text-amber-500" />
                <div>
                  <span className="text-[10px] text-muted-foreground block font-medium">
                    Badge Troupe
                  </span>
                  <span className="font-bold text-foreground">{selectedWaypoint.badge_name}</span>
                </div>
              </div>
            </div>

            {selectedWaypoint.description &&
              selectedWaypoint.description !== selectedWaypoint.name && (
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {selectedWaypoint.description}
                </p>
              )}
            {!isSelectedWaypointReached && (
              <p className="text-xs font-semibold text-primary">
                Encore {fmtKm(Math.ceil(selectedWaypoint.target_km - totalKm))} km pour
                l&apos;atteindre !
              </p>
            )}
          </div>
        )}

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-display text-sm font-bold text-foreground flex items-center gap-2">
              <Flag className="h-4 w-4 text-primary" />
              <span>Carnet de route de l&apos;Expédition</span>
            </h4>
            <span className="text-[11px] text-muted-foreground">
              <strong>
                {Math.max(0, waypoints.filter((wp) => totalKm >= wp.target_km).length - 1)}
              </strong>{" "}
              étapes franchies sur {waypoints.length - 1}
            </span>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            {waypoints.map((wp) => {
              const isReached = totalKm >= wp.target_km;
              const isNext = wp.id === nextStage?.id;
              const isSelected = wp.id === selectedWaypoint?.id;

              return (
                <button
                  key={wp.id}
                  type="button"
                  onClick={() => setSelectedWaypointId(wp.id)}
                  className={cn(
                    "flex flex-col text-left p-3 rounded-xl border transition-all text-xs",
                    isSelected
                      ? "border-primary bg-primary/5 shadow-xs"
                      : isNext
                        ? "border-amber-500/50 bg-amber-500/5"
                        : isReached
                          ? "border-emerald-500/30 bg-emerald-500/5"
                          : "border-border/60 bg-card/60",
                  )}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className="text-base">{wp.badge_emoji}</span>
                    <span className="font-mono font-black text-[11px] text-muted-foreground">
                      {fmtKm(wp.target_km)} km
                    </span>
                  </div>
                  <div className="font-bold text-foreground truncate mt-1.5" title={wp.name}>
                    {isReached && <CheckCircle2 className="mr-1 inline h-3 w-3 text-emerald-600" />}
                    {wp.name}
                  </div>
                  <div className="text-[10px] text-muted-foreground truncate">{wp.badge_name}</div>
                </button>
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CollectiveRouteMap;
