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
}: {
  title: string;
  description?: string;
  children: ReactNode;
  root?: boolean;
  action?: ReactNode;
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
