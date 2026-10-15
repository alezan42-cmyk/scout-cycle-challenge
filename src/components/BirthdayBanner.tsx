import { useQuery } from "@tanstack/react-query";
import { Cake } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useSeasonalTheme } from "@/context/SeasonalThemeContext";

type Birthday = {
  user_id: string;
  display_name: string;
  patrol_name: string | null;
  birth_day: number;
  birth_month: number;
  days_until: number;
};

const MONTHS_SHORT = [
  "janv.",
  "févr.",
  "mars",
  "avr.",
  "mai",
  "juin",
  "juil.",
  "août",
  "sept.",
  "oct.",
  "nov.",
  "déc.",
];

function whenLabel(b: Birthday): string {
  if (b.days_until === 1) return "demain";
  return `le ${b.birth_day} ${MONTHS_SHORT[b.birth_month - 1] ?? ""}`;
}

/**
 * Anniversaires du jour (et des 7 prochains jours) — visible uniquement par
 * les membres connectés. La base ne renvoie rien aux visiteurs sans compte.
 */
export function BirthdayBanner({ userId }: { userId: string | undefined }) {
  const { settings } = useSeasonalTheme();
  const { data: birthdays = [] } = useQuery<Birthday[]>({
    queryKey: ["birthdays", userId],
    enabled: !!userId,
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("upcoming_birthdays", { _days: 7 });
      if (error) return [];
      return (data as Birthday[] | null) ?? [];
    },
  });

  const todayDate = new Date();
  const todayUtc = Date.UTC(todayDate.getFullYear(), todayDate.getMonth(), todayDate.getDate());
  const staffBirthdays = settings.staffBirthdays.flatMap((birthdayDate) => {
    const [month, day] = birthdayDate.split("-").map(Number);
    let next = new Date(todayDate.getFullYear(), month - 1, day);
    if (next.getMonth() !== month - 1) next = new Date(todayDate.getFullYear(), month, 0);
    let diff = Math.round(
      (Date.UTC(next.getFullYear(), next.getMonth(), next.getDate()) - todayUtc) / 86_400_000,
    );
    if (diff < 0) {
      next = new Date(todayDate.getFullYear() + 1, month - 1, day);
      if (next.getMonth() !== month - 1) next = new Date(todayDate.getFullYear() + 1, month, 0);
      diff = Math.round(
        (Date.UTC(next.getFullYear(), next.getMonth(), next.getDate()) - todayUtc) / 86_400_000,
      );
    }
    return diff <= 7 ? [{ date: birthdayDate, days_until: diff }] : [];
  });

  if (!userId || (birthdays.length === 0 && staffBirthdays.length === 0)) return null;

  const today = birthdays.filter((b) => b.days_until === 0);
  const soon = birthdays.filter((b) => b.days_until > 0);
  const staffToday = staffBirthdays.filter((b) => b.days_until === 0);
  const staffSoon = staffBirthdays.filter((b) => b.days_until > 0);
  const isMe = (b: Birthday) => b.user_id === userId;

  return (
    <section
      aria-label="Anniversaires"
      className="rounded-2xl border border-pink-300/60 bg-gradient-to-r from-pink-500/10 via-amber-400/10 to-card p-4 shadow-sm"
    >
      {today.length > 0 && (
        <div className="flex items-start gap-3">
          <span className="text-3xl leading-none" aria-hidden>
            🎂
          </span>
          <div>
            <p className="font-display text-lg font-bold text-foreground">
              {today.some(isMe) && today.length === 1
                ? "Joyeux anniversaire à toi !"
                : `Joyeux anniversaire à ${today
                    .map((b) => (isMe(b) ? "toi" : b.display_name))
                    .join(", ")
                    .replace(/, ([^,]*)$/, " et $1")} !`}
            </p>
            <p className="text-xs text-muted-foreground">
              {today
                .filter((b) => b.patrol_name && !isMe(b))
                .map((b) => `${b.display_name} (${b.patrol_name})`)
                .join(" · ") || "Bonne journée et bonne route 🚴"}
            </p>
          </div>
        </div>
      )}
      {soon.length > 0 && (
        <p
          className={
            today.length > 0
              ? "mt-3 border-t border-pink-300/40 pt-2 text-xs text-muted-foreground"
              : "flex items-center gap-2 text-xs text-muted-foreground"
          }
        >
          {today.length === 0 && <Cake className="h-4 w-4 shrink-0 text-pink-500" />}
          <span>
            <span className="font-semibold text-foreground">Bientôt : </span>
            {soon.map((b) => `${isMe(b) ? "toi" : b.display_name} (${whenLabel(b)})`).join(" · ")}
          </span>
        </p>
      )}
      {staffToday.length > 0 && (
        <p className="mt-3 flex items-center gap-2 border-t border-pink-300/40 pt-2 text-sm font-semibold text-foreground">
          <span aria-hidden>🎂</span>
          Aujourd&apos;hui, nous fêtons l&apos;anniversaire du staff de la troupe !
        </p>
      )}
      {staffSoon.length > 0 && (
        <p className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
          {today.length === 0 && <Cake className="h-4 w-4 shrink-0 text-pink-500" />}
          <span>
            <span className="font-semibold text-foreground">Anniversaire du staff bientôt : </span>
            {staffSoon
              .map((b) => {
                const [month, day] = b.date.split("-").map(Number);
                return b.days_until === 1 ? "demain" : `le ${day} ${MONTHS_SHORT[month - 1] ?? ""}`;
              })
              .join(" · ")}
          </span>
        </p>
      )}
    </section>
  );
}
