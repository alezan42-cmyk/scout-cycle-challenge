export type AlezanContext =
  | "general"
  | "home"
  | "ride"
  | "timeline"
  | "solidarity"
  | "profile"
  | "map"
  | "admin"
  | "welcome"
  | "post_ride"
  | "leader"
  | "chasing";

export interface AlezanQuoteData {
  distanceToYellow?: number;
  pursuerName?: string;
  pursuerDistance?: number;
}

const PAGE_QUOTES: Partial<Record<AlezanContext, string[]>> = {
  home: [
    "Bienvenue au départ ! Chaque kilomètre rapproche ta patrouille du sommet.",
    "Prêt·e à faire grimper le compteur ? Je garde un œil sur le classement !",
  ],
  ride: [
    "Avant de partir, vérifie ton casque, tes freins et ta gourde. Après, raconte-moi ta sortie !",
    "Une sortie, un souvenir, des kilomètres pour la patrouille. À toi de jouer !",
  ],
  timeline: [
    "Les kilomètres passent, les souvenirs restent. Quelle aventure va rejoindre la timeline ?",
    "Chaque camp a son histoire. Fais défiler les souvenirs au trot tranquille !",
  ],
  solidarity: [
    "Un kilomètre pédalé ensemble peut faire beaucoup de bien. Continuons la route solidaire !",
    "Pour la bonne cause, chaque coup de pédale compte. Je suis fier de rouler avec vous !",
  ],
  profile: [
    "Ton profil, c'est ton camp de base. Garde ton totem et ta patrouille à jour !",
    "On roule mieux quand on sait avec qui on fait équipe. Vérifie tes infos de scout !",
  ],
  map: [
    "Nos traces dessinent les aventures de la troupe. Où nous mènera la prochaine sortie ?",
    "La carte se remplit au fil des sorties. Les départs et arrivées restent protégés !",
  ],
  admin: [
    "Merci au staff de garder le défi juste et accueillant pour toute la troupe !",
    "Un classement fiable, c'est un défi plus motivant. Merci de veiller au peloton !",
  ],
  welcome: [
    "Content de te retrouver ! Connecte-toi et rejoins le peloton de l'Alezan 42.",
    "Bienvenue dans l'équipe : ton prochain kilomètre commence ici !",
  ],
  general: [
    "Hennissement de motivation ! Continue comme ça !",
    "N'oublie pas de t'hydrater pendant tes sorties !",
    "Chaque kilomètre compte, au trot ou au galop !",
    "Prêt·e pour une nouvelle aventure à vélo ?",
  ],
  post_ride: [
    "Superbe sortie ! L'avoine est bien méritée aujourd'hui !",
    "Bravo ! Tu as fait chauffer les cuissots !",
    "Excellente contribution ! L'équipe te remercie !",
  ],
};

export function getAlezanQuote(context: AlezanContext, data?: AlezanQuoteData): string {
  if (context === "leader" && data?.pursuerName) {
    const distance = data.pursuerDistance;
    return distance === undefined
      ? `Tu es maillot jaune ! ${data.pursuerName} est dans tes roues !`
      : `Tu es maillot jaune ! ${data.pursuerName} n'est qu'à ${distance} km de te dépasser !`;
  }

  if (context === "chasing" && data?.distanceToYellow !== undefined) {
    return `Allez ! Tu n'es plus qu'à ${data.distanceToYellow} km du maillot jaune. En danseuse !`;
  }

  const quotes = PAGE_QUOTES[context] ?? PAGE_QUOTES.general!;
  return quotes[Math.floor(Math.random() * quotes.length)]!;
}
