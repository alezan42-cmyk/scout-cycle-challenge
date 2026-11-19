import type { Activity, Patrol } from "@/lib/database";
import { getActivitySport, SPORT_INFO } from "@/lib/database";

/* -------------------------------------------------------------------------- */
/*  Types d'export                                                            */
/*  Pour ajouter un type (ex : "patrouilles"), ajoute-le ici, dans             */
/*  TYPE_LABELS, puis une branche dans generatePdf().                          */
/* -------------------------------------------------------------------------- */

export type ExportType = "sorties" | "profils";

export const TYPE_LABELS: Record<ExportType, string> = {
  sorties: "Sorties",
  profils: "Profils",
};

export const PROFILE_FIELDS = [
  { key: "nom", label: "Nom" },
  { key: "totem", label: "Totem" },
  { key: "dateNaissance", label: "Date de naissance" },
  { key: "email", label: "Email" },
  { key: "telephone", label: "Téléphone" },
  { key: "patrouille", label: "Patrouille" },
  { key: "annee", label: "Année" },
  { key: "strava", label: "Strava" },
] as const;

export type ProfileFieldKey = (typeof PROFILE_FIELDS)[number]["key"];

type ProfileLike = {
  id: string;
  full_name?: string | null;
  totem?: string | null;
  email?: string | null;
  phone?: string | null;
  strava_url?: string | null;
  scout_year?: number | null;
  patrol_id?: string | null;
  birth_day?: number | null;
  birth_month?: number | null;
};

export type ActivityRow = {
  id: string;
  km: number | string;
  ride_date: string;
  note?: string | null;
  profiles?: {
    full_name?: string | null;
    totem?: string | null;
    patrol_id?: string | null;
  } | null;
};

type BaseReport = {
  patrols: Patrol[];
  /** Texte libre ajouté au titre, ex : "Camp d'été" */
  customLabel?: string;
  /** Résumé des filtres appliqués, affiché sous le titre */
  filtersLabel: string;
};

export type SortiesReport = BaseReport & {
  type: "sorties";
  rows: ActivityRow[];
  withPatrolRecap: boolean;
};

export type ProfilsReport = BaseReport & {
  type: "profils";
  rows: ProfileLike[];
  fields: ProfileFieldKey[];
};

export type Report = SortiesReport | ProfilsReport;

/* -------------------------------------------------------------------------- */
/*  Utilitaires                                                               */
/* -------------------------------------------------------------------------- */

const pad = (n: number) => String(n).padStart(2, "0");

/** YYYY/MM/DD */
export function formatDateSlash(d: Date | string): string {
  if (typeof d === "string" && /^\d{4}-\d{2}-\d{2}/.test(d)) {
    return d.slice(0, 10).replace(/-/g, "/");
  }
  const date = typeof d === "string" ? new Date(d) : d;
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
}

/** YYYY-MM-DD (pour les noms de fichiers : le "/" est interdit) */
function formatDateDash(d: Date): string {
  return formatDateSlash(d).replace(/\//g, "-");
}

const fmtKm = (n: number) => n.toFixed(1).replace(".", ",");

function slugify(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const BROWN: [number, number, number] = [92, 58, 33];
const ORANGE: [number, number, number] = [217, 119, 6];
const CREAM: [number, number, number] = [250, 245, 238];

/* -------------------------------------------------------------------------- */
/*  Génération                                                                */
/* -------------------------------------------------------------------------- */

/* -------------------------------------------------------------------------- */
/*  Chargement de jsPDF depuis un CDN (aucune installation npm nécessaire)    */
/*  Pour mettre à jour la librairie : change simplement les numéros de        */
/*  version dans les deux URL ci-dessous.                                      */
/* -------------------------------------------------------------------------- */

const JSPDF_URL = "https://cdn.jsdelivr.net/npm/jspdf@2.5.2/dist/jspdf.umd.min.js";
const AUTOTABLE_URL =
  "https://cdn.jsdelivr.net/npm/jspdf-autotable@3.8.4/dist/jspdf.plugin.autotable.min.js";

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const existing = document.querySelector(`script[src="${src}"]`) as HTMLScriptElement | null;
    if (existing?.dataset.loaded === "1") return resolve();
    const s = existing ?? document.createElement("script");
    s.addEventListener("load", () => {
      s.dataset.loaded = "1";
      resolve();
    });
    s.addEventListener("error", () => reject(new Error(`Impossible de charger ${src}`)));
    if (!existing) {
      s.src = src;
      s.async = true;
      document.head.appendChild(s);
    }
  });
}

async function getJsPDF(): Promise<any> {
  const w = window as any;
  if (!w.jspdf?.jsPDF) await loadScript(JSPDF_URL);
  // Le plugin se branche tout seul sur window.jspdf.jsPDF
  if (!w.jspdf?.jsPDF?.API?.autoTable) await loadScript(AUTOTABLE_URL);
  if (!w.jspdf?.jsPDF?.API?.autoTable) throw new Error("jsPDF n'a pas pu être initialisé.");
  return w.jspdf.jsPDF;
}

/**
 * Génère et télécharge le PDF. Retourne le nom du fichier.
 * jsPDF n'est chargé qu'au moment de l'export : il n'alourdit pas le reste du site.
 */
export async function generatePdf(report: Report): Promise<string> {
  const jsPDF = await getJsPDF();

  const now = new Date();
  const typeLabel = TYPE_LABELS[report.type];
  const custom = report.customLabel?.trim();
  const title = [formatDateSlash(now), typeLabel, custom].filter(Boolean).join(" - ");

  const doc: any = new jsPDF({
    orientation: "portrait",
    unit: "mm",
    format: "a4",
  });
  const pageW: number = doc.internal.pageSize.getWidth();
  const pageH: number = doc.internal.pageSize.getHeight();
  const marginX = 14;

  // --- Bandeau de titre ---
  doc.setFillColor(...BROWN);
  doc.rect(0, 0, pageW, 28, "F");
  doc.setFillColor(...ORANGE);
  doc.rect(0, 28, pageW, 1.5, "F");
  doc.setTextColor(255, 255, 255);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(18);
  doc.text(title, marginX, 13);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.text("ALEZAN 42 · Défi vélo scout", marginX, 21);

  // --- Résumé + filtres ---
  let summary: string;
  if (report.type === "sorties") {
    const total = report.rows.reduce((s, r) => s + Number(r.km || 0), 0);
    summary = `${report.rows.length} sortie${report.rows.length > 1 ? "s" : ""} · ${fmtKm(total)} km au total`;
  } else {
    summary = `${report.rows.length} membre${report.rows.length > 1 ? "s" : ""}`;
  }
  doc.setTextColor(40, 40, 40);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.text(summary, marginX, 38);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.setTextColor(100, 100, 100);
  const filterLines: string[] = doc.splitTextToSize(
    `Filtres : ${report.filtersLabel}`,
    pageW - marginX * 2,
  );
  doc.text(filterLines, marginX, 43.5);
  const startY = 43.5 + filterLines.length * 4 + 3;

  const tableBase = {
    theme: "striped",
    styles: { fontSize: 9, cellPadding: 2.2, overflow: "linebreak", textColor: [40, 40, 40] },
    headStyles: { fillColor: BROWN, textColor: [255, 255, 255], fontStyle: "bold" },
    alternateRowStyles: { fillColor: CREAM },
    footStyles: { fillColor: ORANGE, textColor: [255, 255, 255], fontStyle: "bold" },
    margin: { left: marginX, right: marginX, top: 16, bottom: 16 },
  };

  if (report.type === "sorties") {
    const patrolName = (id?: string | null) => report.patrols.find((p) => p.id === id)?.name ?? "-";
    const total = report.rows.reduce((s, r) => s + Number(r.km || 0), 0);

    doc.autoTable({
      ...tableBase,
      startY,
      head: [["Date", "Scout", "Patrouille", "Sport", "Distance"]],
      body: report.rows.map((r) => {
        const p = r.profiles;
        const scout = p?.full_name
          ? p.totem
            ? `${p.full_name} (${p.totem})`
            : p.full_name
          : "Inconnu";
        const sport = SPORT_INFO[getActivitySport(r as unknown as Activity)].short;
        return [
          formatDateSlash(r.ride_date),
          scout,
          patrolName(p?.patrol_id),
          sport,
          `${fmtKm(Number(r.km))} km`,
        ];
      }),
      foot: [["", "", "", "Total", `${fmtKm(total)} km`]],
      showFoot: "lastPage",
      columnStyles: {
        0: { cellWidth: 28 },
        3: { cellWidth: 22 },
        4: { halign: "right", cellWidth: 28, fontStyle: "bold" },
      },
      didParseCell: (data: any) => {
        if (data.section === "foot" && data.column.index === 4) data.cell.styles.halign = "right";
        if (data.section === "head" && data.column.index === 4) data.cell.styles.halign = "right";
      },
    });

    // --- Récapitulatif par patrouille ---
    if (report.withPatrolRecap && report.rows.length > 0) {
      const byPatrol = new Map<string, { count: number; km: number }>();
      for (const r of report.rows) {
        const name = patrolName(r.profiles?.patrol_id);
        const cur = byPatrol.get(name) ?? { count: 0, km: 0 };
        cur.count += 1;
        cur.km += Number(r.km || 0);
        byPatrol.set(name, cur);
      }
      const recap = [...byPatrol.entries()].sort((a, b) => b[1].km - a[1].km);

      let y: number = doc.lastAutoTable.finalY + 12;
      if (y + 30 > pageH - 16) {
        doc.addPage();
        y = 20;
      }
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(...BROWN);
      doc.text("Récapitulatif par patrouille", marginX, y);

      doc.autoTable({
        ...tableBase,
        startY: y + 3,
        head: [["Rang", "Patrouille", "Sorties", "Distance"]],
        body: recap.map(([name, v], i) => [
          String(i + 1),
          name,
          String(v.count),
          `${fmtKm(v.km)} km`,
        ]),
        columnStyles: {
          0: { cellWidth: 16 },
          2: { cellWidth: 24 },
          3: { halign: "right", cellWidth: 32, fontStyle: "bold" },
        },
        didParseCell: (data: any) => {
          if (data.section === "head" && data.column.index === 3) data.cell.styles.halign = "right";
        },
      });
    }
  } else {
    const patrolName = (id?: string | null) => report.patrols.find((p) => p.id === id)?.name ?? "-";
    const cols = PROFILE_FIELDS.filter((f) => report.fields.includes(f.key));
    const value = (p: ProfileLike, key: ProfileFieldKey): string => {
      switch (key) {
        case "nom":
          return p.full_name || "-";
        case "totem":
          return p.totem || "-";
        case "dateNaissance":
          return p.birth_day && p.birth_month ? `${pad(p.birth_day)}/${pad(p.birth_month)}` : "-";
        case "email":
          return p.email || "-";
        case "telephone":
          return p.phone || "-";
        case "patrouille":
          return patrolName(p.patrol_id);
        case "annee":
          return p.scout_year ? `${p.scout_year}e` : "-";
        case "strava":
          return p.strava_url || "-";
      }
    };
    doc.autoTable({
      ...tableBase,
      startY,
      head: [cols.map((c) => c.label)],
      body: report.rows.map((p) => cols.map((c) => value(p, c.key))),
    });
  }

  // --- Pied de page : date de génération + pagination ---
  const total = doc.getNumberOfPages();
  const stamp = `Généré le ${formatDateSlash(now)} à ${pad(now.getHours())}:${pad(now.getMinutes())}`;
  for (let i = 1; i <= total; i++) {
    doc.setPage(i);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(130, 130, 130);
    doc.text(`ALEZAN 42 · ${stamp}`, marginX, pageH - 8);
    doc.text(`Page ${i} / ${total}`, pageW - marginX, pageH - 8, { align: "right" });
  }

  const filename = `${formatDateDash(now)}_${typeLabel}${custom ? `_${slugify(custom)}` : ""}.pdf`;
  doc.save(filename);
  return filename;
}
