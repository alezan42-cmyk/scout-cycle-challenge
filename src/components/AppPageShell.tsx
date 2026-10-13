import { useEffect, useState, type ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { isStandalone } from "@/lib/standalone";
import { cn } from "@/lib/utils";

/**
 * Écran de l'application installée : grand titre, sous-titre court, contenu aéré.
 * `root` = écran d'un onglet (pas de bouton retour). Hors application, renvoie vers le site.
 */
export function AppPageShell({
  title,
  description,
  children,
  root = false,
  action,
  heroImage,
  heroPosition = "center",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  root?: boolean;
  action?: ReactNode;
  /** Photo plein écran en haut (accueil) : titre en blanc dessus, contenu qui la chevauche */
  heroImage?: string | undefined;
  heroPosition?: string;
}) {
  const router = useRouter();
  const [standalone, setStandalone] = useState<boolean | null>(null);
  useEffect(() => {
    const installed = isStandalone();
    setStandalone(installed);
    if (!installed) window.location.replace("/");
  }, []);

  if (standalone !== true) return <div className="min-h-screen bg-background" />;

  const goBack = () => {
    if (window.history.length > 1) router.history.back();
    else void router.navigate({ to: "/app" });
  };

  if (heroImage) {
    return (
      <main className="app-screen min-h-screen bg-background">
        <div className="relative isolate overflow-hidden bg-bark">
          <img
            src={heroImage}
            alt=""
            aria-hidden
            className="absolute inset-0 -z-10 h-full w-full object-cover"
            style={{ objectPosition: heroPosition }}
          />
          {/* Voile aux couleurs du thème + dégradé pour lire le texte et fondre dans la page */}
          <div className="absolute inset-0 -z-10 bg-primary/25 mix-blend-multiply" />
          <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/45 via-black/20 to-black/70" />
          <div className="mx-auto flex min-h-[calc(16.5rem+env(safe-area-inset-top))] max-w-xl flex-col justify-end px-5 pb-16 pt-[calc(2.5rem+env(safe-area-inset-top))]">
            <div className="flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h1 className="font-display text-[30px] font-black leading-[1.1] tracking-tight text-white drop-shadow-sm">
                  {title}
                </h1>
                {description && (
                  <p className="mt-1.5 text-[15px] leading-snug text-white/85">{description}</p>
                )}
              </div>
              {action}
            </div>
          </div>
        </div>
        <div className="relative mx-auto -mt-10 max-w-xl px-5 pb-[calc(7rem+env(safe-area-inset-bottom))]">
          <div className="space-y-7">{children}</div>
        </div>
      </main>
    );
  }

  return (
    <main className="app-screen min-h-screen bg-background">
      <div className="mx-auto max-w-xl px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-[calc(1rem+env(safe-area-inset-top))]">
        <div className={cn("flex h-10 items-center justify-between", root && "h-2")}>
          {!root && (
            <button
              type="button"
              onClick={goBack}
              className="-ml-2 inline-flex h-10 items-center gap-0.5 rounded-full pl-1 pr-3 text-[15px] font-semibold text-primary active:bg-primary/10"
            >
              <ChevronLeft className="h-6 w-6" strokeWidth={2.2} />
              Retour
            </button>
          )}
          {!root && action}
        </div>
        <header className="mb-6 mt-1 flex items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="font-display text-[30px] font-black leading-[1.1] tracking-tight text-foreground">
              {title}
            </h1>
            {description && (
              <p className="mt-1.5 text-[15px] leading-snug text-muted-foreground">{description}</p>
            )}
          </div>
          {root && action}
        </header>
        <div className="space-y-7">{children}</div>
      </div>
    </main>
  );
}
