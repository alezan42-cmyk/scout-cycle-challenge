import { pelotonMultiplier } from "@/lib/peloton";
import type { SeasonalThemeId } from "@/lib/seasonalTheme";

/**
 * Phrases d'encouragement affichées après l'enregistrement d'une sortie.
 * Le ton dépend de la distance, du dénivelé, du thème de fête et, pour une sortie
 * à plusieurs, des points Peloton possibles.
 */

export interface EncouragementInput {
  km: number;
  sport: "velo" | "course" | "marche";
  /** dénivelé positif en mètres, si renseigné */
  elevation?: number | null;
  /** statut de la sortie (le message ne change pas, il est gardé pour de futurs usages) */
  status?: "approved" | "pending";
  /** nombre de personnes prévues dans la sortie à plusieurs (toi comprise) */
  groupSize?: number | null;
  theme: SeasonalThemeId;
  /** pour les tests : générateur aléatoire dans [0, 1[ */
  random?: () => number;
}

export interface Encouragement {
  /** phrase principale, en gras */
  headline: string;
  /** lignes complémentaires (dénivelé, sortie à plusieurs) */
  extras: string[];
}

const nf = new Intl.NumberFormat("fr-BE", { maximumFractionDigits: 1 });
export const formatNumber = (n: number) => nf.format(n);

// {km} est remplacé par la distance
const TIERS: { max: number; lines: string[] }[] = [
  {
    max: 5,
    lines: [
      "Chaque kilomètre compte, bravo ! 👏",
      "{km} km de plus : la machine est lancée ! 🚀",
      "Un petit tour qui fait du bien, et {km} km pour la patrouille !",
    ],
  },
  {
    max: 15,
    lines: [
      "Joli ! Tes {km} km font avancer la patrouille ! 💪",
      "Belle sortie : {km} km de plus au compteur ! 🌟",
      "Bravo, {km} km, ça s'accumule vite ! 😎",
    ],
  },
  {
    max: 30,
    lines: [
      "Waouw, {km} km ! Tu régales ! 🔥",
      "{km} km ! La patrouille peut compter sur toi ! 💥",
      "Quelle sortie : {km} km, respect ! 🙌",
    ],
  },
  {
    max: 60,
    lines: [
      "Énorme ! {km} km, la patrouille te dit merci ! 🏅",
      "{km} km d'un coup : tu es en feu ! 🔥🔥",
      "Impressionnant, {km} km ! Les autres ont du souci à se faire ! 😄",
    ],
  },
  {
    max: 100,
    lines: [
      "Monstrueux ! {km} km, tu es une machine ! 🦾",
      "{km} km ?! Chapeau bas, quelle performance ! 🎩",
    ],
  },
  {
    max: Infinity,
    lines: [
      "LÉGENDAIRE ! {km} km, ça mérite une ola ! 🏆",
      "{km} km ! Les livres d'histoire vont en parler ! 📚🔥",
    ],
  },
];

const THEME_LINES: Partial<Record<SeasonalThemeId, string[]>> = {
  automne: ["Les feuilles volent sur ton passage ! 🍂"],
  hiver: ["Même dans le froid, tu assures ! ❄️", "Pas de glaçon pour t'arrêter ! 🧊"],
  halloween: ["Même les fantômes peinent à te suivre ! 👻", "Quelle sortie à faire frémir ! 🎃"],
  noel: ["Plus rapide que le traîneau du Père Noël ! 🎅", "Un cadeau pour la patrouille ! 🎁"],
  valentin: ["La patrouille t'aime à fond la caisse ! 💘"],
  paques: ["Un vrai lapin de course ! 🐇", "Tu ramasses les kilomètres comme des œufs ! 🥚"],
  printemps: ["Ça fleurit de kilomètres ! 🌸", "Le printemps te réussit ! 🌷"],
  ete: ["Ça chauffe, ça brille ! ☀️", "Le soleil est jaloux de ton énergie ! 😎"],
  course24h: ["Pied au plancher, cap sur la ligne d'arrivée ! 🏁", "À fond, à fond, à fond ! ⚡"],
  nationale: ["Vive la Belgique, vive les kilomètres ! 🇧🇪"],
  carnaval: [
    "Quelle ambiance, des confettis pour toi ! 🎉",
    "Gilles et serpentins, tu mérites une fanfare ! 🎺",
  ],
  foot: ["BUUUT ! La patrouille exulte ! ⚽", "Carton vert pour cette sortie ! 🟩"],
  tennis: ["Jeu, set et match ! 🎾", "Quel smash, cette sortie ! 🎾"],
};

function pick<T>(list: T[], random: () => number): T {
  return list[Math.min(list.length - 1, Math.floor(random() * list.length))]!;
}

export function buildEncouragement(input: EncouragementInput): Encouragement {
  const random = input.random ?? Math.random;
  const km = Math.max(0, input.km);
  const kmText = formatNumber(km);

  const tier = TIERS.find((t) => km < t.max) ?? TIERS[TIERS.length - 1]!;
  let headline = pick(tier.lines, random).replace("{km}", kmText);

  // Une fois sur deux, la phrase du thème en cours remplace la phrase classique
  const themed = THEME_LINES[input.theme];
  if (themed && random() < 0.5) headline = pick(themed, random);

  const extras: string[] = [];

  const elevation = input.elevation ?? 0;
  if (elevation >= 1000) {
    extras.push(`⛰️ ${formatNumber(elevation)} m de dénivelé : tu as grimpé une vraie montagne !`);
  } else if (elevation >= 500) {
    extras.push(`⛰️ ${formatNumber(elevation)} m de dénivelé : ça grimpe dur !`);
  } else if (elevation >= 200) {
    extras.push(`⛰️ ${formatNumber(elevation)} m de dénivelé, jolies jambes !`);
  }

  const size = input.groupSize ?? 0;
  if (size >= 2) {
    const mult = pelotonMultiplier(size);
    const points = Math.round(km * mult * 10) / 10;
    extras.push(
      `🤝 Ensemble on va plus loin ! À ${size}, ta sortie peut rapporter jusqu'à ` +
        `${formatNumber(points)} points Peloton (×${formatNumber(mult)}), comptés dès que ` +
        `tous les participants ont validé leur sortie.`,
    );
  }

  return { headline, extras };
}
