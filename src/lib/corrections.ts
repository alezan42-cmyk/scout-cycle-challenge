import { SPORT_INFO, type ActivitySport } from "@/lib/database";

/** Une entrée du journal `activity_corrections` (écrite par la base, jamais par le site). */
export interface ActivityCorrection {
  id: string;
  activity_id: string | null;
  user_id: string;
  admin_id: string | null;
  action: "modification" | "suppression" | "refus";
  ride_date: string | null;
  km: number | string | null;
  changes: Record<string, { avant?: unknown; apres?: unknown } | unknown>;
  created_at: string;
  seen_at: string | null;
}

const nf = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 });
const shortDate = (d: string | null) =>
  d
    ? new Date(d + "T12:00:00").toLocaleDateString("fr-BE", { day: "numeric", month: "numeric" })
    : "?";
const sportName = (v: unknown) => SPORT_INFO[(v as ActivitySport) ?? "velo"]?.short ?? String(v);

/** Détail des champs changés, ex. « km 45 → 4,5 · sport Vélo → Marche ». */
export function describeChanges(changes: ActivityCorrection["changes"]): string[] {
  const out: string[] = [];
  const get = (k: string) => changes[k] as { avant?: unknown; apres?: unknown } | undefined;
  const km = get("km");
  if (km) out.push(`km ${nf.format(Number(km.avant))} → ${nf.format(Number(km.apres))}`);
  const dplus = get("elevation_m");
  if (dplus)
    out.push(
      `D+ ${dplus.avant == null ? "—" : `${nf.format(Number(dplus.avant))} m`} → ${
        dplus.apres == null ? "—" : `${nf.format(Number(dplus.apres))} m`
      }`,
    );
  const date = get("ride_date");
  if (date) out.push(`date ${shortDate(String(date.avant))} → ${shortDate(String(date.apres))}`);
  const sport = get("sport");
  if (sport && typeof sport === "object" && "apres" in sport)
    out.push(`sport ${sportName(sport.avant)} → ${sportName(sport.apres)}`);
  if (get("status")) out.push("remise en attente de validation");
  return out;
}

/** Phrase pour le scout (page « Mes km »). */
export function correctionMessage(c: ActivityCorrection): string {
  const what = `Ta sortie du ${shortDate(c.ride_date)}${
    c.km != null ? ` (${nf.format(Number(c.km))} km)` : ""
  }`;
  if (c.action === "suppression") return `${what} a été supprimée par le staff.`;
  if (c.action === "refus") return `${what} a été refusée par le staff.`;
  const details = describeChanges(c.changes);
  return `${what} a été corrigée par le staff${details.length ? " : " + details.join(" · ") : ""}.`;
}

/** Résumé court pour le journal admin. */
export function correctionSummary(c: ActivityCorrection): string {
  if (c.action === "suppression") return "supprimée";
  if (c.action === "refus") return "refusée";
  return describeChanges(c.changes).join(" · ") || "modifiée";
}
