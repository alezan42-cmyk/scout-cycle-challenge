import { useMemo } from "react";
import { useLocation } from "@tanstack/react-router";
import { getAlezanQuote, type AlezanContext } from "@/lib/alezanQuotes";
import { useSeasonalTheme } from "@/context/SeasonalThemeContext";

import alezanClassique from "@/assets/Perso/Alezan_Classique.png";
import alezanHalloween from "@/assets/Perso/Alezan_Halloween.png";
import alezanNoel from "@/assets/Perso/Alezan_Noel.png";
import alezanStValentin from "@/assets/Perso/Alezan_St_Valentin.png";

const PAGE_CONTEXT: Record<string, AlezanContext> = {
  "/": "home",
  "/mes-km": "ride",
  "/timeline": "timeline",
  "/solidarite": "solidarity",
  "/profil": "profile",
  "/carte": "map",
  "/admin": "admin",
  "/auth": "welcome",
};

interface AlezanMascotProps {
  context?: AlezanContext;
}

/** Le compagnon de route Alezan accueille les scouts avec un mot lié à la page. */
export function AlezanMascot({ context }: AlezanMascotProps) {
  const { pathname } = useLocation();
  const { currentTheme } = useSeasonalTheme();
  const pageContext = context ?? PAGE_CONTEXT[pathname] ?? "general";
  const quote = useMemo(() => getAlezanQuote(pageContext), [pageContext]);

  const currentImage =
    currentTheme === "halloween"
      ? alezanHalloween
      : currentTheme === "noel"
        ? alezanNoel
        : currentTheme === "valentin"
          ? alezanStValentin
          : alezanClassique;

  return (
    <aside
      aria-label="Le mot d'Alezan"
      className="border-b border-primary/10 bg-primary/[0.04]"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2 sm:gap-4 sm:py-2.5">
        <img
          src={currentImage}
          alt="Alezan, le compagnon de route de la troupe"
          className="h-12 w-16 shrink-0 object-contain sm:h-14 sm:w-20"
        />
        <div className="min-w-0 border-l-2 border-primary/30 pl-3 sm:pl-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-primary">
            Le mot d'Alezan
          </p>
          <p role="status" className="text-xs font-medium leading-relaxed text-foreground sm:text-sm">
            {quote}
          </p>
        </div>
      </div>
    </aside>
  );
}
