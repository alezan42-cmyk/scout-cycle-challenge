import { Link, useLocation } from "@tanstack/react-router";
import { House, Trophy, Plus, ListChecks, LayoutGrid } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { cn } from "@/lib/utils";

/**
 * Barre d'onglets de l'application installée : chaque onglet ouvre directement
 * son écran (pas de menu intermédiaire), le « + » central enregistre une sortie.
 */
export function AppTabBar() {
  const { user } = useAuth();
  const { pathname } = useLocation();

  const tabs = [
    {
      to: "/app",
      label: "Accueil",
      icon: House,
      active: pathname === "/app" || pathname === "/app/",
    },
    {
      to: "/app/classement",
      label: "Classement",
      icon: Trophy,
      active: pathname.startsWith("/app/classement"),
    },
    null,
    {
      to: user ? "/app/mes-kms" : "/auth",
      label: "Mes km",
      icon: ListChecks,
      active: pathname.startsWith("/app/mes-kms") || pathname.startsWith("/app/trophees"),
    },
    {
      to: "/app/plus",
      label: "Plus",
      icon: LayoutGrid,
      active:
        pathname.startsWith("/app/plus") ||
        ["/profil", "/admin", "/solidarite", "/timeline", "/carte"].some((p) =>
          pathname.startsWith(p),
        ) ||
        ["/app/maillots", "/app/defis", "/app/sorties", "/app/compte-a-rebours"].some((p) =>
          pathname.startsWith(p),
        ),
    },
  ] as const;

  const recordActive = pathname.startsWith("/app/enregistrer");

  return (
    <nav aria-label="Navigation de l’application" className="app-tabbar">
      {tabs.map((tab, i) => {
        if (!tab) {
          return (
            <Link
              key="record"
              to={(recordActive ? "/app" : user ? "/app/enregistrer" : "/auth") as never}
              aria-label={recordActive ? "Fermer" : "Enregistrer une sortie"}
              className="app-tab app-tab-record"
            >
              <span className={cn("app-record-button", recordActive && "app-record-button-active")}>
                <Plus className="h-7 w-7" strokeWidth={2.6} />
              </span>
              <span className="sr-only">Enregistrer</span>
            </Link>
          );
        }
        const Icon = tab.icon;
        return (
          <Link
            key={i}
            to={tab.to as never}
            aria-current={tab.active ? "page" : undefined}
            className={cn("app-tab", tab.active && "app-tab-active")}
          >
            <Icon className="h-6 w-6" strokeWidth={tab.active ? 2.3 : 1.8} />
            <span>{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
