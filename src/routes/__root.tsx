import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
  type ErrorComponentProps,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import { Toaster } from "@/components/ui/sonner";
import { SiteHeader } from "@/components/SiteHeader";
import { AlezanMascot } from "@/components/AlezanMascot";
import { AuthProvider } from "@/context/AuthContext";
import { SeasonalThemeProvider } from "@/context/SeasonalThemeContext";
import { SeasonalDecor } from "@/components/SeasonalDecor";
import { AnimationToggle } from "@/components/AnimationToggle";
import { THEME_BOOT_SCRIPT } from "@/lib/seasonalTheme";
import { APP_BOOT_SCRIPT } from "@/lib/standalone";
import { supabase } from "@/integrations/supabase/client";
import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error }: ErrorComponentProps) {
  console.error(error);
  const router = useRouter();

  const errorMsg =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "Erreur inattendue de rendu";

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-bold tracking-tight text-foreground">
          Une erreur est survenue lors du chargement
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Quelque chose s'est mal passé. Tu peux réessayer ou recharger l'accueil.
        </p>
        <p className="mt-3 rounded-lg border border-destructive/20 bg-destructive/10 p-2.5 text-xs text-destructive text-left font-mono overflow-auto max-h-24">
          {errorMsg}
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              try {
                localStorage.removeItem("alezan_standalone_db_v2");
              } catch {
                // ignore storage error
              }
              router.invalidate();
              reset();
              window.location.reload();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Réessayer / Recharger
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Retour à l'accueil
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#a84300" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "default" },
      { name: "apple-mobile-web-app-title", content: "ALEZAN 42" },
      { title: "ALEZAN 42 — Défi vélo des patrouilles" },
      { name: "description", content: "Concours de kilomètres à vélo entre patrouilles scoutes." },
      { property: "og:title", content: "ALEZAN 42 — Défi vélo des patrouilles" },
      {
        property: "og:description",
        content: "Concours de kilomètres à vélo entre patrouilles scoutes.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Archivo+Black&family=Work+Sans:wght@400;500;600&display=swap",
      },
      { rel: "icon", href: "/favicon.ico", type: "image/x-icon" },
      { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
    ],
  }),
  // Applique le dernier thème connu avant l'affichage (évite un flash aux couleurs standard)
  // App installée : marque <html> et ouvre l'accueil de l'app (le site n'est pas concerné)
  scripts: () => [{ children: THEME_BOOT_SCRIPT }, { children: APP_BOOT_SCRIPT }],
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="fr" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  useEffect(() => {
    if (!import.meta.env.DEV && "serviceWorker" in navigator && window.isSecureContext) {
      void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => {
        // L’application reste utilisable même si le service worker est indisponible.
      });
    }
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      router.invalidate();
      if (event !== "SIGNED_OUT") queryClient?.invalidateQueries();
    });
    return () => data?.subscription?.unsubscribe?.();
  }, [router, queryClient]);

  return (
    <QueryClientProvider client={queryClient}>
      <SeasonalThemeProvider>
        <AuthProvider>
          <SiteHeader />
          <AlezanMascot />
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <footer className="site-footer py-4 text-center text-[10px] text-muted-foreground/70">
            Version {__APP_VERSION__} · mise en ligne le{" "}
            {new Date(__APP_BUILT_AT__).toLocaleString("fr-BE", {
              dateStyle: "short",
              timeStyle: "short",
            })}
            <AnimationToggle />
          </footer>
          <Toaster />
          <SeasonalDecor />
        </AuthProvider>
      </SeasonalThemeProvider>
    </QueryClientProvider>
  );
}
