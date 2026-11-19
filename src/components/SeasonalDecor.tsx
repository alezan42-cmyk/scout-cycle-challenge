import { useMemo } from "react";
import { useSeasonalTheme } from "@/context/SeasonalThemeContext";
import type { SeasonalThemeId } from "@/lib/seasonalTheme";

type Mode = "fall" | "fly" | "race";

interface ParticleSpec {
  chars: string[];
  mode: Mode;
  count: number;
  /** taille en px [min, max] */
  size: [number, number];
  /** durée de l'animation en secondes [min, max] */
  duration: [number, number];
  opacity?: number;
  /** hauteur de vol en % de l'écran [min, max] (modes "fly" et "race") */
  altitude?: [number, number];
  /** petits bonds pendant la traversée (lapin) */
  bounce?: boolean;
}

interface Corner {
  char: string;
  className: string;
  size: number;
}

interface Decor {
  particles: ParticleSpec[];
  corners: Corner[];
  sun?: boolean;
  waves?: boolean;
  /** tapis au sol (répété sur toute la largeur) */
  ground?: string;
  /** traits de vitesse (24h vélo) */
  streaks?: number;
}

const DECOR: Record<Exclude<SeasonalThemeId, "default">, Decor> = {
  automne: {
    ground: "🍂🍁🍂🍃🍁🍂",
    particles: [
      {
        chars: ["🍂", "🍁", "🍂", "🍃"],
        mode: "fall",
        count: 16,
        size: [16, 26],
        duration: [11, 22],
        opacity: 0.9,
      },
    ],
    corners: [
      { char: "🦔", className: "bottom-5 left-4", size: 30 },
      { char: "🍄", className: "bottom-5 right-5", size: 26 },
    ],
  },
  valentin: {
    particles: [
      {
        chars: ["💕", "❤️", "💗", "💖"],
        mode: "fall",
        count: 16,
        size: [14, 24],
        duration: [10, 20],
        opacity: 0.85,
      },
    ],
    corners: [
      { char: "💌", className: "bottom-2 left-3", size: 32 },
      { char: "🌹", className: "bottom-2 right-4", size: 30 },
    ],
  },
  paques: {
    ground: "🌱🌿🌼🌱🌿🌷",
    particles: [
      {
        chars: ["🌼", "🌸"],
        mode: "fall",
        count: 8,
        size: [14, 20],
        duration: [14, 24],
        opacity: 0.8,
      },
      {
        chars: ["🐇"],
        mode: "race",
        count: 1,
        size: [30, 30],
        duration: [16, 16],
        altitude: [90, 90],
        bounce: true,
      },
      {
        chars: ["🐥"],
        mode: "fly",
        count: 2,
        size: [18, 22],
        duration: [28, 40],
        altitude: [20, 60],
      },
    ],
    corners: [
      { char: "🧺", className: "bottom-5 left-4", size: 32 },
      { char: "🐣", className: "bottom-5 right-5", size: 28 },
    ],
  },
  course24h: {
    streaks: 7,
    particles: [
      {
        chars: ["🚴💨", "🚴‍♀️💨", "🚴💨", "🚵💨"],
        mode: "race",
        count: 6,
        size: [28, 40],
        duration: [5, 11],
        altitude: [84, 94],
      },
      {
        chars: ["🎉", "🏁", "✨"],
        mode: "fall",
        count: 10,
        size: [12, 18],
        duration: [8, 14],
        opacity: 0.75,
      },
    ],
    corners: [
      { char: "🏆", className: "top-20 left-3", size: 30 },
      { char: "⏱️", className: "top-20 right-4", size: 26 },
    ],
  },
  hiver: {
    particles: [
      {
        chars: ["❄️", "❅", "❆"],
        mode: "fall",
        count: 14,
        size: [12, 22],
        duration: [12, 24],
        opacity: 0.75,
      },
    ],
    corners: [
      { char: "⛄", className: "bottom-5 left-4", size: 36 },
      { char: "🧤", className: "bottom-5 right-5", size: 26 },
    ],
  },
  carnaval: {
    particles: [
      {
        chars: ["🎊", "🎉", "✨", "🎊"],
        mode: "fall",
        count: 22,
        size: [12, 22],
        duration: [7, 15],
        opacity: 0.9,
      },
      {
        chars: ["🎈"],
        mode: "fly",
        count: 3,
        size: [26, 34],
        duration: [24, 40],
        altitude: [15, 70],
      },
    ],
    corners: [
      { char: "🎭", className: "bottom-2 left-3", size: 34 },
      { char: "🥁", className: "bottom-2 right-4", size: 30 },
    ],
  },
  nationale: {
    particles: [
      {
        chars: ["✨", "⭐"],
        mode: "fall",
        count: 12,
        size: [12, 20],
        duration: [8, 16],
        opacity: 0.8,
      },
      {
        chars: ["🇧🇪"],
        mode: "fly",
        count: 3,
        size: [22, 30],
        duration: [24, 40],
        altitude: [18, 60],
      },
    ],
    corners: [
      { char: "🍟", className: "bottom-2 left-3", size: 32 },
      { char: "🧇", className: "bottom-2 right-4", size: 30 },
    ],
  },
  foot: {
    ground: "🌱🌿🌱🌱🌿",
    particles: [
      {
        chars: ["⚽"],
        mode: "race",
        count: 2,
        size: [22, 30],
        duration: [9, 15],
        altitude: [88, 93],
        bounce: true,
      },
      {
        chars: ["🎉", "🟨", "⚽"],
        mode: "fall",
        count: 9,
        size: [12, 18],
        duration: [9, 16],
        opacity: 0.75,
      },
    ],
    corners: [
      { char: "🥅", className: "bottom-6 left-3", size: 36 },
      { char: "🏆", className: "bottom-6 right-4", size: 30 },
    ],
  },
  tennis: {
    particles: [
      {
        chars: ["🎾"],
        mode: "race",
        count: 2,
        size: [20, 26],
        duration: [8, 13],
        altitude: [87, 93],
        bounce: true,
      },
      {
        chars: ["🎾"],
        mode: "fall",
        count: 6,
        size: [14, 20],
        duration: [10, 18],
        opacity: 0.85,
      },
    ],
    corners: [
      { char: "🏟️", className: "bottom-2 left-3", size: 32 },
      { char: "🏆", className: "bottom-2 right-4", size: 30 },
    ],
  },
  anniversaire: {
    particles: [
      {
        chars: ["🎉", "🎊", "✨", "🎈"],
        mode: "fall",
        count: 20,
        size: [14, 24],
        duration: [8, 16],
        opacity: 0.9,
      },
      {
        chars: ["🎈"],
        mode: "fly",
        count: 3,
        size: [24, 34],
        duration: [22, 36],
        altitude: [15, 65],
      },
    ],
    corners: [
      { char: "🎂", className: "bottom-2 left-3", size: 34 },
      { char: "🎁", className: "bottom-2 right-4", size: 30 },
    ],
  },
  halloween: {
    particles: [
      {
        chars: ["🦇"],
        mode: "fly",
        count: 4,
        size: [20, 30],
        duration: [16, 30],
        altitude: [12, 60],
      },
      {
        chars: ["👻"],
        mode: "fly",
        count: 1,
        size: [26, 34],
        duration: [42, 55],
        altitude: [30, 70],
        opacity: 0.6,
      },
    ],
    corners: [
      { char: "🎃", className: "bottom-2 left-3", size: 36 },
      { char: "🕯️", className: "bottom-2 right-4", size: 28 },
    ],
  },
  noel: {
    particles: [
      {
        chars: ["❄️", "❅", "❆"],
        mode: "fall",
        count: 26,
        size: [12, 24],
        duration: [9, 20],
        opacity: 0.8,
      },
    ],
    corners: [
      { char: "🎄", className: "bottom-2 left-3", size: 40 },
      { char: "🎁", className: "bottom-2 right-4", size: 30 },
    ],
  },
  printemps: {
    particles: [
      {
        chars: ["🌸", "🌸", "🌼"],
        mode: "fall",
        count: 14,
        size: [14, 22],
        duration: [12, 24],
        opacity: 0.85,
      },
      {
        chars: ["🦋"],
        mode: "fly",
        count: 3,
        size: [20, 26],
        duration: [22, 38],
        altitude: [20, 75],
      },
    ],
    corners: [
      { char: "🌷", className: "bottom-1 left-3", size: 34 },
      { char: "🌼", className: "bottom-1 right-4", size: 28 },
    ],
  },
  ete: {
    sun: true,
    waves: true,
    particles: [
      {
        chars: ["☁️"],
        mode: "fly",
        count: 3,
        size: [36, 54],
        duration: [60, 95],
        altitude: [8, 45],
        opacity: 0.7,
      },
      {
        chars: ["🦋"],
        mode: "fly",
        count: 2,
        size: [20, 24],
        duration: [24, 36],
        altitude: [35, 80],
      },
    ],
    corners: [
      { char: "🌴", className: "bottom-3 left-3", size: 40 },
      { char: "🍉", className: "bottom-3 right-4", size: 28 },
    ],
  },
};

// Pseudo-aléatoire stable : les décorations ne « sautent » pas à chaque rendu
function rnd(seed: number) {
  const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
  return x - Math.floor(x);
}
const between = (seed: number, [min, max]: [number, number]) => min + rnd(seed) * (max - min);

export function SeasonalDecor() {
  const { theme, animated } = useSeasonalTheme();
  const decor = theme === "default" ? null : DECOR[theme];

  const particles = useMemo(() => {
    if (!decor) return [];
    return decor.particles.flatMap((spec, s) =>
      Array.from({ length: spec.count }, (_, i) => {
        const seed = (s + 1) * 1000 + i;
        const duration = between(seed + 1, spec.duration);
        return {
          key: `${s}-${i}`,
          mode: spec.mode,
          char: spec.chars[i % spec.chars.length],
          left: spec.mode === "fall" ? `${rnd(seed + 2) * 100}%` : undefined,
          top:
            spec.mode === "fall" ? undefined : `${between(seed + 3, spec.altitude ?? [10, 70])}%`,
          bounce: !!spec.bounce,
          size: between(seed + 4, spec.size),
          duration,
          // délai négatif : la scène est déjà « en cours » à l'arrivée
          delay: -rnd(seed + 5) * duration,
          drift: (rnd(seed + 6) - 0.5) * 140,
          wobble: (rnd(seed + 7) - 0.5) * 90,
          opacity: spec.opacity ?? 0.9,
        };
      }),
    );
  }, [decor]);

  const streaks = useMemo(
    () =>
      Array.from({ length: decor?.streaks ?? 0 }, (_, i) => ({
        key: i,
        top: `${12 + rnd(500 + i) * 76}%`,
        duration: 0.9 + rnd(600 + i) * 1.6,
        delay: -rnd(700 + i) * 3,
      })),
    [decor],
  );

  if (!decor) return null;

  return (
    <div className={`festive-layer${animated ? "" : " festive-still"}`} aria-hidden="true">
      {decor.waves && <div className="festive-waves" />}
      {decor.ground && <div className="festive-ground">{decor.ground.repeat(40)}</div>}
      {animated &&
        streaks.map((st) => (
          <span
            key={`streak-${st.key}`}
            className="festive-streak"
            style={{
              top: st.top,
              animationDuration: `${st.duration}s`,
              animationDelay: `${st.delay}s`,
            }}
          />
        ))}
      {decor.sun && <div className="festive-sun">☀️</div>}
      {decor.corners.map((c) => (
        <span
          key={c.char}
          className={`festive-corner hidden sm:block ${c.className}`}
          style={{ fontSize: c.size }}
        >
          {c.char}
        </span>
      ))}
      {(animated ? particles : []).map((p) => (
        <span
          key={p.key}
          className={`festive-particle ${p.mode}`}
          style={
            {
              left: p.left,
              top: p.top,
              fontSize: p.size,
              animationDuration: `${p.duration}s`,
              animationDelay: `${p.delay}s`,
              "--drift": `${p.drift}px`,
              "--wobble": `${p.wobble}px`,
              "--op": p.opacity,
              opacity: p.mode === "fly" ? p.opacity : undefined,
            } as React.CSSProperties
          }
        >
          {p.bounce ? <span className="festive-bounce">{p.char}</span> : p.char}
        </span>
      ))}
    </div>
  );
}

const VINE = "🌿🌸🌿🌼🌿🌷".repeat(30);

/** Bandeau accroché sous l'en-tête du site (guirlande, toile d'araignée, etc.). */
export function HeaderTrim() {
  const { theme, animated } = useSeasonalTheme();
  if (theme === "default") return null;

  return (
    <div
      className={`festive-trim festive-trim-${theme}${animated ? "" : " festive-still"}`}
      aria-hidden="true"
    >
      {theme === "halloween" && (
        <>
          <span className="festive-web">🕸️</span>
          <span className="festive-spider">
            <i />
            <b>🕷️</b>
          </span>
        </>
      )}
      {theme === "printemps" && VINE}
      {theme === "valentin" && "💗❤️💕".repeat(60)}
      {theme === "anniversaire" && "🎉🎈✨🎊🎁".repeat(45)}
      {theme === "paques" && "🥚🐣🌷🥚🐰🌼".repeat(40)}
      {theme === "automne" && "🍁🍂🍃".repeat(60)}
    </div>
  );
}
