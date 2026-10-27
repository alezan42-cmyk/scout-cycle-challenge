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

type JerseyType = "yellow" | "polka" | "white";
type JerseyCategory = "homme" | "femme";
type Section = "patrols" | JerseyType;
interface StoryRankings {
  patrols: Array<{ name: string; km: number }>;
  holders: Array<{ type: JerseyType; category: JerseyCategory; candidate: JerseyCandidate | null }>;
}
const SECTION_LABELS: Record<Section, string> = {
  patrols: "Classement des patrouilles (scouts)",
  yellow: "Maillots jaunes (garçons et filles)",
  polka: "Maillots à pois (garçons et filles)",
  white: "Maillots blancs (garçons et filles)",
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
  const [sections, setSections] = useState<Section[]>(["patrols", "yellow", "polka", "white"]);
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
    const categories: JerseyCategory[] = ["homme", "femme"];
    const holders: StoryRankings["holders"] = (["yellow", "polka", "white"] as const).flatMap(
      (type) =>
        categories.map((category) => ({
          type,
          category,
          candidate:
            type === "yellow"
              ? jerseys[category].yellow
              : type === "polka"
                ? jerseys[category].climber
                : jerseys[category].white,
        })),
    );
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
            {(["patrols", "yellow", "polka", "white"] as const).map((section) => (
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
  bg.addColorStop(0, "#ffdcae");
  bg.addColorStop(1, "#f8c991");
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = "rgba(255,255,255,.56)";
  ctx.lineWidth = 3;
  roundRect(ctx, 24, 24, width - 48, height - 48, 32);
  ctx.stroke();
  ctx.textAlign = "center";
  ctx.shadowColor = "rgba(93,48,29,.22)";
  ctx.shadowBlur = 5;
  ctx.shadowOffsetY = 4;
  ctx.fillStyle = "#fffaf1";
  ctx.font = "italic 900 75px Georgia, 'Times New Roman', serif";
  const title =
    period === "week"
      ? ["CLASSEMENT DE LA", "SEMAINE"]
      : period === "month"
        ? ["CLASSEMENT", "DU MOIS"]
        : ["CLASSEMENT", "DEPUIS LE DÉBUT"];
  ctx.fillText(title[0], width / 2, 155);
  ctx.fillText(title[1], width / 2, 238);
  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.fillStyle = "rgba(255,250,241,.9)";
  ctx.font = "500 27px Georgia, serif";
  ctx.fillText(PERIOD_LABELS[period].toLocaleLowerCase("fr"), width / 2, 292);

  let y = 365;
  if (sections.includes("patrols")) {
    y = sectionTitle(ctx, "patrouilles", y);
    const shown = rankings.patrols.slice(0, 3);
    shown.forEach((patrol, index) => {
      drawMedal(ctx, index + 1, 264, y - 18);
      ctx.textAlign = "left";
      ctx.fillStyle = "#fffaf1";
      ctx.font = "bold 39px Georgia, serif";
      ctx.fillText(patrol.name.toLocaleUpperCase("fr"), 315, y);
      ctx.textAlign = "right";
      ctx.fillText(`${formatKm(patrol.km)} km`, width - 155, y);
      y += 72;
    });
    y += 25;
  }

  const visibleHolders = rankings.holders.filter((holder) => sections.includes(holder.type));
  if (visibleHolders.length) {
    y = sectionTitle(ctx, "individuel", y);
    const jerseyGroups: Array<{ type: JerseyType; holders: typeof visibleHolders }> = [
      { type: "yellow", holders: visibleHolders.filter((holder) => holder.type === "yellow") },
      { type: "polka", holders: visibleHolders.filter((holder) => holder.type === "polka") },
      { type: "white", holders: visibleHolders.filter((holder) => holder.type === "white") },
    ].filter((group) => group.holders.length);
    const groupHeight = Math.min(210, Math.floor((height - y - 175) / jerseyGroups.length));
    for (const group of jerseyGroups) {
      const centerY = y + groupHeight / 2;
      drawJersey(ctx, 126, centerY - 52, group.type);
      const jerseyName =
        group.type === "yellow"
          ? "Maillot jaune"
          : group.type === "polka"
            ? "Maillot à pois"
            : "Maillot blanc";
      ctx.textAlign = "left";
      ctx.fillStyle = "rgba(255,250,241,.88)";
      ctx.font = "italic 700 22px Georgia, serif";
      ctx.fillText(jerseyName.toLocaleLowerCase("fr"), 270, centerY - 23);
      for (const holder of group.holders) {
        const rowY = centerY + (holder.category === "homme" ? 20 : 60);
        const label = holder.category === "homme" ? "1H" : "1F";
        const name = holder.candidate?.display_name ?? "En attente";
        const metric = holder.candidate
          ? group.type === "polka"
            ? `${Math.round(holder.candidate.dplus)} D+`
            : `${formatKm(holder.candidate.km)} km`
          : "—";
        ctx.fillStyle = "#fffaf1";
        ctx.font = "bold 30px Georgia, serif";
        ctx.textAlign = "left";
        ctx.fillText(`${label}  ${name}`, 270, rowY);
        ctx.textAlign = "right";
        ctx.fillText(metric, width - 125, rowY);
      }
      y += groupHeight;
    }
  }
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(255,250,241,.88)";
  ctx.font = "500 19px Georgia, serif";
  ctx.fillText("Chaque sortie compte · alezan42-cycling.pages.dev", width / 2, height - 90);
}

function sectionTitle(ctx: CanvasRenderingContext2D, text: string, y: number) {
  ctx.fillStyle = "rgba(255,250,241,.9)";
  ctx.font = "italic 700 28px Georgia, serif";
  ctx.textAlign = "center";
  ctx.fillText(text, 540, y);
  ctx.fillStyle = "rgba(255,250,241,.55)";
  ctx.fillRect(135, y + 18, 810, 2);
  return y + 66;
}

function drawMedal(ctx: CanvasRenderingContext2D, rank: number, x: number, y: number) {
  ctx.textAlign = "center";
  ctx.font = "32px Arial, sans-serif";
  ctx.fillText(rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : `${rank}.`, x, y + 5);
}

function drawJersey(ctx: CanvasRenderingContext2D, x: number, y: number, type: JerseyType) {
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
  ctx.fillStyle = type === "yellow" ? "#ffd21f" : "#fffdf4";
  ctx.fill();
  if (type === "polka") {
    ctx.fillStyle = "#d94a3a";
    for (const [dotX, dotY] of [
      [35, 31],
      [62, 25],
      [78, 48],
      [43, 57],
      [66, 76],
      [34, 84],
    ]) {
      ctx.beginPath();
      ctx.arc(dotX, dotY, 5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  if (type === "white") {
    ctx.fillStyle = "#5cb9d5";
    ctx.fillRect(26, 72, 58, 10);
  }
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
