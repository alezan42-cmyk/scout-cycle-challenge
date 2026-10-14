import { useQuery } from "@tanstack/react-query";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import logoAlezan from "@/assets/logo-alezan.png";

// Client non typé : la table des étapes n'est pas dans les types générés
const supabase = supabaseClient as unknown as SupabaseClient;

/**
 * Étapes de l'Expédition (« Le Grand Périple Scout ») et leur illustration.
 * Les étapes viennent de la table `expedition_waypoints` (lecture publique).
 */

export interface ExpeditionStage {
  id: string;
  name: string;
  subtitle: string;
  target_km: number;
  description: string;
  badge_name: string;
  badge_emoji: string;
}

export function useExpeditionStages() {
  return useQuery<ExpeditionStage[]>({
    queryKey: ["expedition-stages"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("expedition_waypoints")
        .select("id, name, subtitle, target_km, description, badge_name, badge_emoji")
        .order("target_km", { ascending: true });
      if (error) throw error;
      return (data ?? []) as ExpeditionStage[];
    },
  });
}

export interface StageArt {
  /** Image (illustration 3D ou photo) ; sinon on affiche l'emoji de l'étape */
  src?: string | undefined;
  /** Photo plein cadre (la Terre) plutôt qu'une illustration posée sur un fond */
  photo?: boolean | undefined;
  /** Fond dégradé derrière l'illustration */
  bg: string;
}

const ART_BY_ID: Record<string, StageArt> = {
  base: { src: "/expedition/fleur.webp", bg: "from-emerald-200 to-emerald-500" },
  broceliande: { src: "/expedition/walk.webp", bg: "from-sky-200 to-sky-500" },
  kandersteg: { src: "/expedition/mountain.webp", bg: "from-sky-100 to-indigo-400" },
  "Badge Alezan": { src: logoAlezan, bg: "from-white to-orange-100" },
  "jamboree-2027": { src: "/expedition/camping.webp", bg: "from-lime-200 to-green-600" },
  rome: { src: "/expedition/rome.webp", bg: "from-amber-100 to-orange-400" },
  compostelle: { src: "/expedition/shell.webp", bg: "from-cyan-100 to-blue-500" },
  "cap-nord": { src: "/expedition/compass.webp", bg: "from-slate-200 to-indigo-600" },
  "tour-de-france": { src: "/expedition/biking.webp", bg: "from-yellow-200 to-yellow-500" },
  amazone: { src: "/expedition/parrot.webp", bg: "from-emerald-200 to-teal-600" },
  "diametre-terre": { src: "/expedition/volcano.webp", bg: "from-orange-200 to-red-600" },
  "muraille-chine": { src: "/expedition/dragon.webp", bg: "from-rose-200 to-red-600" },
  "tour-du-monde": { src: "/earth-blue-marble.webp", photo: true, bg: "from-sky-900 to-black" },
};

const ART_BY_EMOJI: Record<string, string> = {
  "⚜️": "/expedition/fleur.webp",
  "🏃": "/expedition/walk.webp",
  "🚶": "/expedition/walk.webp",
  "🏔️": "/expedition/mountain.webp",
  "🏛️": "/expedition/rome.webp",
  "🐚": "/expedition/shell.webp",
  "🧭": "/expedition/compass.webp",
  "🚴": "/expedition/biking.webp",
  "🌋": "/expedition/volcano.webp",
  "🐉": "/expedition/dragon.webp",
  "🏅": "/expedition/medal.webp",
  "🏆": "/expedition/trophy.webp",
  "⛺": "/expedition/camping.webp",
};

/** Illustration d'une étape : par identifiant, sinon par emoji, sinon l'emoji lui-même. */
export function stageArt(stage: Pick<ExpeditionStage, "id" | "badge_emoji">): StageArt {
  const byId = ART_BY_ID[stage.id];
  if (byId) return byId;
  const src = ART_BY_EMOJI[stage.badge_emoji?.trim()];
  return { src, bg: "from-amber-100 to-orange-300" };
}

export type StageStatus = "done" | "next" | "locked";

export interface StageProgress {
  status: StageStatus;
  /** Avancée cumulée depuis 0 km vers cette étape (0 → 1) */
  fraction: number;
  /** Km restants pour l'atteindre */
  remaining: number;
}

/** Index de la prochaine étape à atteindre (la dernière si tout est atteint). */
export function nextStageIndex(stages: ExpeditionStage[], km: number) {
  const i = stages.findIndex((s) => s.target_km > km);
  return i === -1 ? Math.max(0, stages.length - 1) : i;
}

export function stageProgress(stages: ExpeditionStage[], index: number, km: number): StageProgress {
  const stage = stages[index];
  if (!stage) return { status: "locked", fraction: 0, remaining: 0 };
  if (km >= stage.target_km) return { status: "done", fraction: 1, remaining: 0 };
  const next = nextStageIndex(stages, km);
  return {
    status: index === next ? "next" : "locked",
    fraction: index === next ? Math.min(1, Math.max(0, km / stage.target_km)) : 0,
    remaining: Math.max(0, stage.target_km - km),
  };
}

const kmFmt = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 0 });
export const formatStageKm = (km: number) => kmFmt.format(Math.ceil(km));
