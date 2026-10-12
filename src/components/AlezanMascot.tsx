import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { getAlezanQuote, type AlezanContext } from "@/lib/alezanQuotes";
import { useSeasonalTheme } from "@/context/SeasonalThemeContext";
import { useAuth } from "@/lib/useAuth";
import { supabase } from "@/integrations/supabase/client";

import alezanClassique from "@/assets/Perso/Alezan_Classique.png";
import alezanHalloween from "@/assets/Perso/Alezan_Halloween.png";
import alezanNoel from "@/assets/Perso/Alezan_Noel.png";
import alezanStValentin from "@/assets/Perso/Alezan_St_Valentin.png";
import alezanAnniversaire from "@/assets/Perso/Alezan_Anniversaire.png";
import alezanEte from "@/assets/Perso/Alezan_Ete.png";

interface Birthday {
  user_id: string;
  display_name: string;
  days_until: number;
}

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
  const { user } = useAuth();
  const { theme: currentTheme } = useSeasonalTheme();
  const pageContext = context ?? PAGE_CONTEXT[pathname] ?? "general";
  const quote = useMemo(() => getAlezanQuote(pageContext), [pageContext]);
  const { data: birthdays = [] } = useQuery<Birthday[]>({
    queryKey: ["birthdays", user?.id],
    enabled: !!user?.id,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("upcoming_birthdays", { _days: 7 });
      if (error) return [];
      return (data as Birthday[] | null) ?? [];
    },
  });
  const birthdayCelebrants = birthdays.filter((birthday) => birthday.days_until === 0);
  const birthdayMode = birthdayCelebrants.length > 0;
  const birthdayGreeting = birthdayMode
    ? birthdayCelebrants.some((birthday) => birthday.user_id === user?.id)
      ? "Joyeux anniversaire à toi et à la troupe ! 🎉"
      : `Aujourd’hui, on fête ${birthdayCelebrants.map((birthday) => birthday.display_name).join(", ")} ! 🎉`
    : quote;

  const currentImage = birthdayMode
    ? alezanAnniversaire
    : currentTheme === "ete"
      ? alezanEte
      : currentTheme === "halloween"
        ? alezanHalloween
        : currentTheme === "noel"
          ? alezanNoel
          : currentTheme === "valentin"
            ? alezanStValentin
            : alezanClassique;

  return (
    <aside
      aria-label="Le mot d'Alezan"
      className="pointer-events-none fixed bottom-4 right-3 z-40 flex max-w-[calc(100vw-1.5rem)] items-end gap-2 sm:bottom-6 sm:right-6 sm:gap-3"
    >
      <div
        className={`relative mb-6 ${birthdayMode ? "max-w-[min(8rem,calc(100vw-12rem))] sm:max-w-[min(13rem,calc(100vw-13rem))]" : "max-w-[min(13rem,calc(100vw-9rem))]"} rounded-2xl border border-border/80 bg-card/95 px-3 py-2.5 shadow-lg shadow-black/10 backdrop-blur-sm after:absolute after:-right-1.5 after:bottom-4 after:h-3 after:w-3 after:rotate-45 after:border-r after:border-t after:border-border/80 after:bg-card`}
      >
        <p className="mb-0.5 text-[9px] font-black uppercase tracking-[0.14em] text-primary">
          {birthdayMode ? "Mode anniversaire" : "Alezan te glisse un mot"}
        </p>
        <p
          role="status"
          className="text-[11px] font-medium leading-snug text-foreground sm:text-xs"
        >
          {birthdayGreeting}
        </p>
      </div>
      <img
        src={currentImage}
        alt="Alezan, le compagnon de route de la troupe"
        className={
          birthdayMode
            ? "h-20 w-36 shrink-0 object-contain drop-shadow-md sm:h-28 sm:w-52"
            : currentTheme === "ete"
              ? "h-28 w-28 shrink-0 object-cover object-center drop-shadow-md sm:h-36 sm:w-36"
              : "h-28 w-28 shrink-0 object-contain drop-shadow-md sm:h-36 sm:w-36"
        }
      />
    </aside>
  );
}
