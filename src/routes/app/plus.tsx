import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  Award,
  CalendarClock,
  CalendarDays,
  CircleUserRound,
  Compass,
  HandHeart,
  History,
  LogIn,
  LogOut,
  MapPinned,
  Medal,
  ShieldCheck,
  Shirt,
  Users,
} from "lucide-react";
import { AppPageShell } from "@/components/AppPageShell";
import { AppCard, AppList, AppListRow, AppSection } from "@/components/app/AppUi";
import { AnimationToggle } from "@/components/AnimationToggle";
import { useAuth } from "@/lib/useAuth";
import { getPatrolEmblem } from "@/lib/database";

export const Route = createFileRoute("/app/plus")({ ssr: false, component: MoreScreen });

function MoreScreen() {
  const { user, profile, isAdmin, signOut } = useAuth();
  const navigate = useNavigate();
  const name = profile?.totem
    ? `${profile.totem}${profile.quali ? ` ${profile.quali}` : ""}`
    : profile?.full_name || user?.email?.split("@")[0];

  return (
    <AppPageShell root title="Plus">
      {user ? (
        <Link to="/profil" className="block">
          <AppCard className="flex items-center gap-4 p-4 active:bg-muted/60">
            <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/12 text-2xl">
              {profile?.patrol_name ? getPatrolEmblem(profile.patrol_name) : "⚜️"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[18px] font-bold text-foreground">{name}</span>
              <span className="block truncate text-[14px] text-muted-foreground">
                {profile?.patrol_name
                  ? `Patrouille ${profile.patrol_name} · mon profil`
                  : "Voir mon profil"}
              </span>
            </span>
            <CircleUserRound className="h-5 w-5 shrink-0 text-muted-foreground/60" />
          </AppCard>
        </Link>
      ) : (
        <AppList>
          <AppListRow
            to="/auth"
            icon={LogIn}
            title="Se connecter"
            subtitle="Pour enregistrer tes km"
          />
        </AppList>
      )}

      <AppSection title="La troupe">
        <AppList>
          <AppListRow
            to="/app/maillots"
            icon={Shirt}
            iconClassName="bg-amber-500/15 text-amber-600"
            title="Maillots"
            subtitle="Jaune et à pois"
          />
          <AppListRow
            to={user ? "/app/sorties-prevues" : "/auth"}
            icon={CalendarDays}
            iconClassName="bg-primary/12 text-primary"
            title="Sorties prévues"
            subtitle="Proposer une sortie, s'inscrire"
          />
          <AppListRow
            to="/app/expedition"
            icon={Compass}
            iconClassName="bg-sky-500/12 text-sky-600"
            title="Expédition"
            subtitle="Les étapes jusqu'au tour du monde"
          />
          <AppListRow
            to="/app/defis"
            icon={Award}
            iconClassName="bg-rose-500/12 text-rose-600"
            title="Défis"
          />
          <AppListRow
            to="/app/sorties"
            icon={Users}
            iconClassName="bg-emerald-500/12 text-emerald-700"
            title="Sorties de la troupe"
          />
          <AppListRow to="/app/compte-a-rebours" icon={CalendarClock} title="Compte à rebours" />
          <AppListRow to="/timeline" icon={History} title="Ligne du temps" />
          {user && (
            <AppListRow
              to="/carte"
              icon={MapPinned}
              iconClassName="bg-sky-500/12 text-sky-600"
              title="Carte des parcours"
            />
          )}
          <AppListRow
            to="/solidarite"
            icon={HandHeart}
            iconClassName="bg-pink-500/12 text-pink-600"
            title="Solidarité"
          />
        </AppList>
      </AppSection>

      {user && (
        <AppSection title="Moi">
          <AppList>
            <AppListRow
              to="/app/trophees"
              icon={Medal}
              iconClassName="bg-amber-500/15 text-amber-600"
              title="Mes trophées"
            />
          </AppList>
        </AppSection>
      )}

      {isAdmin && (
        <AppSection title="Staff">
          <AppList>
            <AppListRow
              to="/admin"
              icon={ShieldCheck}
              iconClassName="bg-violet-500/12 text-violet-600"
              title="Administration"
              subtitle="Valider les sorties, gérer la troupe"
            />
          </AppList>
        </AppSection>
      )}

      {user && (
        <AppList>
          <AppListRow
            icon={LogOut}
            danger
            title="Se déconnecter"
            chevron={false}
            onClick={async () => {
              await signOut();
              void navigate({ to: "/app" });
            }}
          />
        </AppList>
      )}

      <div className="space-y-1 pb-2 text-center text-[12px] text-muted-foreground/80">
        <p>ALEZAN 42 · version {__APP_VERSION__}</p>
        <AnimationToggle />
      </div>
    </AppPageShell>
  );
}
