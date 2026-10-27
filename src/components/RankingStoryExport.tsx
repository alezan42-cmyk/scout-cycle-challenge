import { useMemo, useState } from "react";
import { Download, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { computeJerseys, type JerseyCandidate } from "@/lib/jerseys";
import { formatKm, rankPatrols, useTroopData, type AppPeriod } from "@/lib/appData";
import { isStaffPatrol } from "@/lib/categories";
import { toast } from "sonner";

type Section = "patrols" | "yellow" | "white";
interface StoryRankings {
  patrols: Array<{ name: string; km: number }>;
  holders: Array<{ type: "yellow" | "white"; category: string; candidate: JerseyCandidate }>;
}
const SECTION_LABELS: Record<Section, string> = {
  patrols: "Classement des patrouilles (scouts)",
  yellow: "Maillots jaunes",
  white: "Maillots blancs",
};
const PERIOD_LABELS: Record<AppPeriod, string> = {
  week: "Cette semaine",
  month: "Ce mois-ci",
  all: "Depuis le début",
};

export function RankingStoryExport() {
  const { data } = useTroopData();
  const [open, setOpen] = useState(false);
  const [period, setPeriod] = useState<AppPeriod>("week");
  const [sections, setSections] = useState<Section[]>(["patrols", "yellow", "white"]);
  const [isExporting, setIsExporting] = useState(false);

  const rankings = useMemo(() => {
    if (!data) return null;
    const patrols = rankPatrols(data, period, "all").filter((p) => !p.is_staff && p.km > 0);
    const range =
      period === "week" ? currentRange("week") : period === "month" ? currentRange("month") : null;
    const profiles = data.profiles;
    const totals = new Map<string, { km: number; dplus: number }>();
    for (const activity of data.activities) {
      if (activity.status !== "approved") continue;
      if (range && (activity.ride_date < range.from || activity.ride_date > range.to)) continue;
      const total = totals.get(activity.user_id) ?? { km: 0, dplus: 0 };
      total.km += Number(activity.km || 0);
      total.dplus += Number(activity.elevation_m || 0);
      totals.set(activity.user_id, total);
    }
    const candidates: JerseyCandidate[] = profiles.map((profile) => {
      const patrol = profile.patrols;
      const staff = isStaffPatrol(patrol) || (!patrol && !!profile.is_admin);
      const total = totals.get(profile.id) ?? { km: 0, dplus: 0 };
      return {
        user_id: profile.id,
        display_name: profile.totem
          ? `${profile.totem}${profile.quali ? ` ${profile.quali}` : ""}`
          : profile.full_name || "Scout",
        patrol_name: patrol?.name || "Sans patrouille",
        category: staff ? "staff" : patrol?.category || "homme",
        is_chef: staff,
        scout_year: profile.scout_year,
        km: total.km,
        dplus: total.dplus,
      };
    });
    const jerseys = computeJerseys(candidates);
    const holders = [
      ...Object.entries(jerseys).flatMap(([category, holders]) =>
        holders.yellow ? [{ type: "yellow" as const, category, candidate: holders.yellow }] : [],
      ),
      ...Object.entries(jerseys).flatMap(([category, holders]) =>
        holders.white ? [{ type: "white" as const, category, candidate: holders.white }] : [],
      ),
    ];
    return { patrols, holders };
  }, [data, period]);

  const toggleSection = (section: Section) => {
    setSections((current) =>
      current.includes(section)
        ? current.filter((item) => item !== section)
        : [...current, section],
    );
  };

  async function exportPng() {
    if (!rankings || sections.length === 0) return;
    setIsExporting(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = 1080;
      canvas.height = 1920;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas indisponible");
      drawStory(ctx, canvas.width, canvas.height, rankings, sections, period);
      const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
      if (!blob) throw new Error("Création du PNG impossible");
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `classement-alezan42-${period}.png`;
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
      setOpen(false);
    } catch {
      toast.error("L’image du classement n’a pas pu être créée.");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="gap-2 rounded-xl">
          <ImageIcon className="h-4 w-4" /> Exporter une story
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Créer l’image du classement</DialogTitle>
          <DialogDescription>
            Une image verticale 9:16, prête à partager en story.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-5 py-2">
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Période</legend>
            {(["week", "month", "all"] as const).map((value) => (
              <label
                key={value}
                className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm"
              >
                <input
                  type="radio"
                  name="story-period"
                  checked={period === value}
                  onChange={() => setPeriod(value)}
                />
                {PERIOD_LABELS[value]}
              </label>
            ))}
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="mb-2 text-sm font-semibold">Contenu</legend>
            {(["patrols", "yellow", "white"] as const).map((section) => (
              <label
                key={section}
                className="flex cursor-pointer items-center gap-3 rounded-xl border p-3 text-sm"
              >
                <Checkbox
                  checked={sections.includes(section)}
                  onCheckedChange={() => toggleSection(section)}
                />
                {SECTION_LABELS[section]}
              </label>
            ))}
          </fieldset>
        </div>
        <DialogFooter>
          <Button
            onClick={() => void exportPng()}
            disabled={!rankings || !sections.length || isExporting}
            className="gap-2"
          >
            <Download className="h-4 w-4" /> {isExporting ? "Création…" : "Télécharger le PNG"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function currentRange(period: "week" | "month") {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  else start.setDate(1);
  const end = new Date(start);
  end.setDate(
    start.getDate() +
      (period === "week"
        ? 6
        : new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate() - 1),
  );
  const key = (date: Date) =>
    `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  return { from: key(start), to: key(end) };
}

function drawStory(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  rankings: StoryRankings,
  sections: Section[],
  period: AppPeriod,
) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, "#ffe2bf");
  bg.addColorStop(1, "#f6c48e");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#fff6e9";
  roundRect(ctx, 38, 38, width - 76, height - 76, 38);
  ctx.fill();
  ctx.textAlign = "center";
  ctx.fillStyle = "#5a2d1b";
  ctx.font = "800 64px Arial, sans-serif";
  ctx.fillText("CLASSEMENT", width / 2, 160);
  ctx.fillText(
    period === "week" ? "DE LA SEMAINE" : period === "month" ? "DU MOIS" : "DEPUIS LE DÉBUT",
    width / 2,
    235,
  );
  ctx.fillStyle = "#9b6849";
  ctx.font = "500 30px Arial, sans-serif";
  ctx.fillText("ALEZAN 42 · kilomètres partagés", width / 2, 292);

  let y = 365;
  if (sections.includes("patrols")) {
    y = sectionTitle(ctx, "PATROUILLES", y);
    const shown = rankings.patrols.slice(0, 9);
    shown.forEach((patrol, index) => {
      drawMedal(ctx, index + 1, 126, y - 22);
      ctx.textAlign = "left";
      ctx.fillStyle = "#542a19";
      ctx.font = "700 34px Arial, sans-serif";
      ctx.fillText(patrol.name, 184, y);
      ctx.textAlign = "right";
      ctx.font = "700 34px Arial, sans-serif";
      ctx.fillText(`${formatKm(patrol.km)} km`, width - 120, y);
      y += 73;
    });
    if (rankings.patrols.length > shown.length) {
      ctx.textAlign = "center";
      ctx.fillStyle = "#9b6849";
      ctx.font = "500 23px Arial, sans-serif";
      ctx.fillText(
        `et ${rankings.patrols.length - shown.length} autre(s) patrouille(s)`,
        width / 2,
        y - 18,
      );
      y += 30;
    }
    y += 35;
  }

  const visibleHolders = rankings.holders.filter((holder) => sections.includes(holder.type));
  if (visibleHolders.length) {
    if (y > 360) y += 10;
    y = sectionTitle(ctx, "MAILLOTS", y);
    for (const holder of visibleHolders) {
      drawJersey(ctx, 124, y - 52, holder.type === "yellow" ? "#f4bd23" : "#fffdf4");
      const jerseyName = holder.type === "yellow" ? "Maillot jaune" : "Maillot blanc";
      const category =
        holder.category === "homme" ? "Garçons" : holder.category === "femme" ? "Filles" : "Staff";
      ctx.textAlign = "left";
      ctx.fillStyle = "#9b6849";
      ctx.font = "600 21px Arial, sans-serif";
      ctx.fillText(`${jerseyName.toUpperCase()} · ${category.toUpperCase()}`, 205, y - 12);
      ctx.fillStyle = "#542a19";
      ctx.font = "700 33px Arial, sans-serif";
      ctx.fillText(holder.candidate.display_name, 205, y + 31);
      ctx.textAlign = "right";
      ctx.font = "700 28px Arial, sans-serif";
      ctx.fillText(`${formatKm(holder.candidate.km)} km`, width - 120, y + 31);
      y += 104;
    }
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "#a97a5a";
  ctx.font = "500 19px Arial, sans-serif";
  ctx.fillText("Chaque sortie compte · alezan42-cycling.pages.dev", width / 2, height - 105);
}

function sectionTitle(ctx: CanvasRenderingContext2D, text: string, y: number) {
  ctx.fillStyle = "#c24b16";
  ctx.font = "700 23px Arial, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 540, y);
  ctx.fillStyle = "#e7c7a9";
  ctx.fillRect(115, y + 15, 850, 2);
  return y + 75;
}

function drawMedal(ctx: CanvasRenderingContext2D, rank: number, x: number, y: number) {
  ctx.textAlign = "center";
  ctx.font = "32px Arial, sans-serif";
  ctx.fillText(rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`, x, y + 5);
}

function drawJersey(ctx: CanvasRenderingContext2D, x: number, y: number, color: string) {
  ctx.save();
  ctx.translate(x, y);
  ctx.beginPath();
  ctx.moveTo(15, 10);
  ctx.lineTo(40, 0);
  ctx.lineTo(55, 13);
  ctx.lineTo(70, 0);
  ctx.lineTo(95, 10);
  ctx.lineTo(111, 38);
  ctx.lineTo(92, 49);
  ctx.lineTo(84, 37);
  ctx.lineTo(84, 100);
  ctx.lineTo(26, 100);
  ctx.lineTo(26, 37);
  ctx.lineTo(18, 49);
  ctx.lineTo(0, 38);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = "#c89163";
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.restore();
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
}
