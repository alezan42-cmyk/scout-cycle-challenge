import { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "@tanstack/react-router";
import {
  History,
  CircleUserRound,
  Trophy,
  ShieldCheck,
  LogOut,
  Bike,
  LogIn,
  HandHeart,
  MapPinned,
  Menu,
  X,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/lib/useAuth";
import { cn } from "@/lib/utils";
import logoAlezan from "@/assets/logo-alezan.png";
import { HeaderTrim } from "@/components/SeasonalDecor";
import { PwaInstallButton } from "@/components/PwaInstallButton";

interface NavItem {
  to: string;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  requiresAuth?: boolean;
  requiresAdmin?: boolean;
}

export function SiteHeader() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  // La page est pré-rendue sur « / » : on ne marque la page active qu'une fois
  // dans le navigateur, sinon « Classement » resterait surligné partout.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const currentPath = mounted ? location.pathname : null;

  // Close mobile menu whenever navigating
  useEffect(() => {
    setMobileMenuOpen(false);
  }, [location.pathname]);

  const handleSignOut = async () => {
    setMobileMenuOpen(false);
    await signOut();
    navigate({ to: "/" });
  };

  const navItems: NavItem[] = [
    {
      to: "/",
      label: "Classement",
      description: "Classement hebdomadaire des patrouilles et des scouts",
      icon: Trophy,
    },
    {
      to: "/timeline",
      label: "Timeline",
      description: "Historique et grands événements de l'ALEZAN 42",
      icon: History,
    },
    {
      to: "/carte",
      label: "Carte",
      description: "Carte interactive des zones roulées et courues (-200m protégés)",
      icon: MapPinned,
      requiresAuth: true,
    },
    {
      to: "/solidarite",
      label: "Solidarité",
      description: "Actions solidaires et kilomètres partagés",
      icon: HandHeart,
    },
    {
      to: "/mes-km",
      label: "Mes km",
      description: "Enregistrer une sortie vélo ou course à pied",
      icon: Bike,
    },
    {
      to: "/profil",
      label: "Profil",
      description: "Mon profil scout, totem, qualificatif et patrouille",
      icon: CircleUserRound,
      requiresAuth: true,
    },
    {
      to: "/admin",
      label: "Admin",
      description: "Panneau de modération et gestion du staff",
      icon: ShieldCheck,
      requiresAdmin: true,
    },
  ];

  const visibleItems = navItems.filter((item) => {
    if (item.requiresAdmin && !isAdmin) return false;
    if (item.requiresAuth && !user) return false;
    return true;
  });

  return (
    <header className="sticky top-0 z-50 w-full border-b border-white/10 bg-[var(--header)]/95 text-white shadow-lg backdrop-blur-md">
      <HeaderTrim />
      {/* Main Bar */}
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-2.5 sm:py-3">
        {/* Brand Logo & by Aquila */}
        <Link
          to="/"
          onClick={() => setMobileMenuOpen(false)}
          className="flex items-center gap-2.5 group shrink-0"
        >
          <span className="grid h-9 w-12 sm:h-10 sm:w-14 place-items-center rounded-xl bg-white px-1 py-0.5 shadow-md transition-transform group-hover:scale-105">
            <img
              src={logoAlezan}
              alt="Logo Alezan 42 Cycling Team"
              className="h-full w-full object-contain"
            />
          </span>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display text-base sm:text-lg font-black tracking-wider text-white">
                ALEZAN-42
              </span>
              <span className="hidden rounded-full bg-orange-500/20 border border-orange-500/30 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300 sm:inline-block">
                Défi Vélo
              </span>
            </div>
            <p className="text-[10px] text-amber-300/80 font-medium tracking-wide leading-none sm:text-[11px]">
              by Aquila 🦅
            </p>
          </div>
        </Link>

        {/* ============================================================== */}
        {/* NAVIGATION ORDINATEUR : icônes aux couleurs du thème, libellé déplié au survol */}
        {/* ============================================================== */}
        <nav className="hidden md:flex items-center gap-2">
          <div className="flex items-center gap-0.5 rounded-xl border border-white/10 bg-white/[0.04] p-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentPath === item.to;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  title={item.label}
                  aria-label={item.label}
                  aria-current={isActive ? "page" : undefined}
                  className={cn(
                    "group relative flex h-9 items-center rounded-lg px-2.5 text-[13px] font-semibold transition-all duration-300",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/40",
                    isActive
                      ? "bg-[var(--nav-active)] text-[var(--nav-active-foreground)] shadow-sm"
                      : "text-[var(--nav-icon)] hover:bg-[var(--nav-hover)] hover:text-white",
                  )}
                >
                  <Icon
                    className="h-[18px] w-[18px] shrink-0 transition-transform duration-200 group-hover:scale-110"
                    strokeWidth={1.75}
                  />
                  {/* Libellé replié, il se déplie au survol (ou au focus clavier) */}
                  <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 ease-out group-hover:max-w-[120px] group-hover:pl-2 group-hover:opacity-100 group-focus-visible:max-w-[120px] group-focus-visible:pl-2 group-focus-visible:opacity-100">
                    {item.label}
                  </span>
                </Link>
              );
            })}
          </div>

          {/* Desktop Auth Button */}
          <div className="ml-1 pl-1 border-l border-white/15">
            {user ? (
              <Button
                size="sm"
                variant="ghost"
                onClick={handleSignOut}
                title="Déconnexion"
                aria-label="Déconnexion"
                className="group h-9 gap-0 rounded-lg px-2.5 text-white/65 transition-all hover:bg-rose-500/20 hover:text-rose-200"
              >
                <LogOut
                  className="h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110"
                  strokeWidth={1.75}
                />
                <span className="max-w-0 overflow-hidden whitespace-nowrap opacity-0 transition-all duration-300 ease-out group-hover:max-w-[120px] group-hover:pl-2 group-hover:opacity-100">
                  Déconnexion
                </span>
              </Button>
            ) : (
              <Button
                size="sm"
                asChild
                className="rounded-xl bg-orange-600 font-bold text-white hover:bg-orange-500 shadow-md transition-all hover:scale-105"
              >
                <Link to="/auth" className="flex items-center gap-1.5">
                  <LogIn className="h-4 w-4" />
                  <span>Connexion</span>
                </Link>
              </Button>
            )}
          </div>
        </nav>

        <PwaInstallButton />

        {/* ============================================================== */}
        {/* MOBILE HAMBURGER BUTTON (< md) */}
        {/* ============================================================== */}
        <div className="flex md:hidden items-center gap-2">
          {!user && (
            <Button
              size="sm"
              asChild
              className="rounded-xl bg-orange-600 font-bold text-white hover:bg-orange-500 shadow-sm text-xs px-2.5 h-8"
            >
              <Link to="/auth" className="flex items-center gap-1">
                <LogIn className="h-3.5 w-3.5" />
                <span>Connexion</span>
              </Link>
            </Button>
          )}

          <button
            type="button"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className={cn(
              "flex h-9 w-9 items-center justify-center rounded-xl border transition-all",
              mobileMenuOpen
                ? "bg-white/20 border-white/30 text-white shadow-inner"
                : "bg-white/10 border-white/10 text-white/90 hover:bg-white/15 hover:text-white",
            )}
            aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* ============================================================== */}
      {/* MOBILE MENU DROPDOWN (< md) */}
      {/* ============================================================== */}
      {mobileMenuOpen && (
        <div className="md:hidden border-t border-white/10 bg-[#171a17] shadow-2xl animate-in slide-in-from-top-2 duration-200">
          {/* User profile summary if logged in */}
          {user && (
            <div className="border-b border-white/10 bg-black/30 px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-8 w-8 place-items-center rounded-lg bg-orange-500/20 text-sm">
                    ⚜️
                  </span>
                  <div>
                    <p className="text-xs font-black text-white">
                      {profile?.totem || profile?.full_name || user.email}
                    </p>
                    <p className="text-[10px] text-white/60">
                      {profile?.patrol_name || "Membre connecté"}
                    </p>
                  </div>
                </div>
                {isAdmin && (
                  <span className="rounded-full bg-amber-400/20 border border-amber-400/40 px-2 py-0.5 text-[10px] font-bold text-amber-300">
                    Admin
                  </span>
                )}
              </div>
            </div>
          )}

          {/* Navigation Links List */}
          <div className="max-h-[70vh] overflow-y-auto p-3 space-y-1">
            {visibleItems.map((item) => {
              const Icon = item.icon;
              const isActive = location.pathname === item.to;

              return (
                <Link
                  key={item.to}
                  to={item.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className={cn(
                    "flex items-center justify-between rounded-xl p-2.5 transition-all",
                    isActive
                      ? "bg-white/15 text-white shadow-xs font-bold"
                      : "text-white/80 hover:bg-white/10 hover:text-white",
                  )}
                >
                  <div className="flex items-center gap-3">
                    <span
                      className={cn(
                        "grid h-9 w-9 shrink-0 place-items-center rounded-lg border",
                        isActive
                          ? "border-transparent bg-[var(--nav-active)] text-[var(--nav-active-foreground)]"
                          : "border-white/10 bg-[var(--nav-hover)] text-[var(--nav-icon)]",
                      )}
                    >
                      <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
                    </span>
                    <div>
                      <p className="text-sm font-bold leading-tight">{item.label}</p>
                      <p className="text-[11px] text-white/50 leading-tight mt-0.5">
                        {item.description}
                      </p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-white/40 shrink-0" />
                </Link>
              );
            })}

            {/* Logout / Login button at bottom of mobile menu */}
            <div className="pt-2 mt-2 border-t border-white/10">
              {user ? (
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex w-full items-center justify-between rounded-xl p-2.5 text-rose-300 hover:bg-rose-500/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <span className="grid h-8 w-8 place-items-center rounded-lg bg-rose-500/20">
                      <LogOut className="h-4 w-4 text-rose-400" />
                    </span>
                    <span className="text-sm font-bold">Se déconnecter</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-rose-400/50" />
                </button>
              ) : (
                <Link
                  to="/auth"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-600 p-3 font-bold text-white shadow-md hover:bg-orange-500 transition-colors"
                >
                  <LogIn className="h-4 w-4" />
                  <span>Se connecter à mon compte</span>
                </Link>
              )}
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
