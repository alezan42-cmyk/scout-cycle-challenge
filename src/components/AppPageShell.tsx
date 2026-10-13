import { useEffect, useState, type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";

/** Focused screen shell used only by the installed app routes. */
export function AppPageShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const [standalone, setStandalone] = useState<boolean | null>(null);
  useEffect(() => {
    const installed = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(installed);
    if (!installed) window.location.replace("/");
  }, []);

  if (standalone !== true) return <div className="min-h-screen bg-background" />;
  return (
    <main className="app-page-shell min-h-screen bg-background px-4 pb-28 pt-5 sm:px-6">
      <div className="mx-auto max-w-3xl space-y-5">
        <Link to="/" className="inline-flex min-h-10 items-center gap-2 rounded-full px-3 text-sm font-semibold text-muted-foreground hover:bg-muted">
          <ArrowLeft className="h-4 w-4" /> Accueil
        </Link>
        <header className="space-y-1">
          <h1 className="font-display text-2xl font-black tracking-tight">{title}</h1>
          {description && <p className="text-sm text-muted-foreground">{description}</p>}
        </header>
        <div className="space-y-5">{children}</div>
      </div>
    </main>
  );
}
