import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import {
  Shield,
  User,
  ArrowRight,
  ArrowLeft,
  ChevronRight,
  CheckCircle2,
  Lock,
  Mail,
  Phone,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { db } from "@/lib/database";
import { ForgotPassword } from "@/components/ForgotPassword";
import logoAlezanComplet from "@/assets/logo-alezan.png";
import { isStaffPatrol, isTroopStaffPatrol, TROOP_STAFF_PATROL_NAME } from "@/lib/categories";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Connexion & Inscription — ALEZAN 42" },
      { name: "description", content: "Connecte-toi pour enregistrer tes kilomètres à vélo." },
      { property: "og:title", content: "Connexion & Inscription — ALEZAN 42" },
      { property: "og:description", content: "Rejoins le défi vélo des patrouilles." },
    ],
  }),
  component: AuthPage,
});

interface PatrolItem {
  id: string;
  name: string;
  category: "homme" | "femme" | "staff";
}

const loginSchema = z.object({
  email: z.string().trim().email("Email invalide").max(255),
  password: z.string().min(4, "4 caractères minimum").max(72),
});

const signupSchema = z
  .object({
    email: z.string().trim().email("Email invalide").max(255),
    password: z.string().min(6, "Le mot de passe doit comporter au moins 6 caractères").max(72),
    full_name: z.string().trim().min(2, "Nom et prénom requis").max(100),
    totem: z.string().trim().max(60).optional(),
    quali: z.string().trim().max(60).optional(),
    scout_year: z.string().min(1, "Précise ton année scout ou si tu es chef"),
    patrol_id: z.string().min(1, "Sélectionne ta patrouille"),
    phone: z.string().trim().max(25).optional(),
    birth_day: z.string(),
    birth_month: z.string(),
  })
  .superRefine((data, ctx) => {
    if (Boolean(data.birth_day) !== Boolean(data.birth_month)) {
      ctx.addIssue({
        code: "custom",
        message: "Anniversaire : choisis le jour et le mois (ou aucun des deux)",
        path: [data.birth_day ? "birth_month" : "birth_day"],
      });
      return;
    }
    if (data.birth_day && data.birth_month) {
      const day = Number(data.birth_day);
      const month = Number(data.birth_month);
      const maxDay = month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
      if (
        !Number.isInteger(day) ||
        !Number.isInteger(month) ||
        day < 1 ||
        day > maxDay ||
        month < 1 ||
        month > 12
      ) {
        ctx.addIssue({
          code: "custom",
          message: "Date d’anniversaire invalide",
          path: ["birth_day"],
        });
      }
    }
  });

const MONTHS = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

function AuthPage() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"login" | "signup">("login");
  const [busy, setBusy] = useState(false);
  const [patrols, setPatrols] = useState<PatrolItem[]>([]);

  // Login form state
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");

  // Signup form state
  const [signupForm, setSignupForm] = useState({
    email: "",
    password: "",
    full_name: "",
    totem: "",
    quali: "",
    scout_year: "",
    patrol_id: "",
    phone: "",
    birth_day: "",
    birth_month: "",
  });

  // Load patrols from Supabase for the registration dropdown
  useEffect(() => {
    async function loadPatrols() {
      const { data } = (await supabase
        .from("patrols")
        .select("id, name, category")
        .order("name")) as { data: PatrolItem[] | null };
      let list: PatrolItem[] = data ? [...data] : [];
      const hasStaff = list.some(
        (p) => p.name.toLowerCase().includes("staff") || p.name.toLowerCase().includes("chef"),
      );
      if (!hasStaff) {
        list = [{ id: "staff", name: TROOP_STAFF_PATROL_NAME, category: "staff" }, ...list];
      }
      setPatrols(list);
    }
    loadPatrols();
  }, []);

  // Handle Login submission
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = loginSchema.safeParse({
      email: loginEmail.trim(),
      password: loginPassword,
    });

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message);
      return;
    }

    setBusy(true);

    try {
      const email = parsed.data.email.trim();
      const password = parsed.data.password;

      // 1. Authenticate with real Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (authError) {
        setBusy(false);
        const msg = authError.message.toLowerCase();
        if (msg.includes("invalid login credentials") || msg.includes("not found")) {
          toast.error(
            "Identifiants incorrects ou compte inexistant dans Supabase. Si tu n'as pas encore créé ton compte, clique sur l'onglet 'Inscription' ci-dessus !",
          );
        } else if (msg.includes("email not confirmed")) {
          toast.error(
            "Adresse e-mail non confirmée. Vérifie ta boîte de réception pour valider ton inscription Supabase.",
          );
        } else {
          toast.error("Erreur de connexion Supabase : " + authError.message);
        }
        return;
      }

      // Ensure profile exists in Supabase now that session is active
      if (authData.user) {
        try {
          const { data: existingProf } = await supabase
            .from("profiles")
            .select("id")
            .eq("id", authData.user.id)
            .maybeSingle();

          if (!existingProf) {
            const meta = authData.user.user_metadata || {};
            await supabase.from("profiles").upsert(
              {
                id: authData.user.id,
                email: authData.user.email,
                full_name:
                  (meta["full_name"] as string) ||
                  (meta["name"] as string) ||
                  email.split("@")[0] ||
                  "Scout",
                totem: (meta["totem"] as string) || null,
                quali: (meta["quali"] as string) || null,
                scout_year: meta["scout_year"] ? Number(meta["scout_year"]) : null,
                patrol_id:
                  meta["patrol_id"] && String(meta["patrol_id"]).includes("-")
                    ? String(meta["patrol_id"])
                    : null,
                phone: (meta["phone"] as string) || null,
                onboarded: true,
              },
              { onConflict: "id" },
            );
          }
        } catch (syncErr) {
          console.warn("Post-login profile sync:", syncErr);
        }
      }

      // Also keep local DB in sync
      try {
        db.signIn(email);
      } catch {
        // ignore
      }

      await refreshProfile();
      setBusy(false);
      toast.success("Bon retour parmi nous !");
      window.location.href = "/";
    } catch (err: unknown) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Impossible d'établir la session : " + msg);
    }
  };

  // Handle Signup submission
  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = signupSchema.safeParse(signupForm);

    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message);
      return;
    }

    setBusy(true);
    const d = parsed.data;

    let targetPatrolId: string | null = d.patrol_id;
    // « Staff » choisi à l'inscription = la patrouille Staff troupe
    const staffPatrol = patrols.find((p) => isTroopStaffPatrol(p));

    if (targetPatrolId === "staff" || targetPatrolId === "patrol-staff") {
      targetPatrolId = staffPatrol?.id || null;
    }

    const isStaff =
      d.scout_year === "staff" ||
      d.scout_year === "chef" ||
      d.patrol_id === "staff" ||
      d.patrol_id === "patrol-staff" ||
      isStaffPatrol(patrols.find((p) => p.id === d.patrol_id));
    const scoutYearNum = isStaff ? null : Number(d.scout_year);

    try {
      const email = d.email.trim();
      const password = d.password;

      // 1. Create account directly in Supabase Auth (auth.users)
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: d.full_name.trim(),
            name: d.full_name.trim(),
            totem: d.totem?.trim() || null,
            quali: d.quali?.trim() || null,
            scout_year: scoutYearNum ? String(scoutYearNum) : null,
            patrol_id: targetPatrolId,
            phone: d.phone?.trim() || null,
            birth_day: d.birth_day ? Number(d.birth_day) : null,
            birth_month: d.birth_month ? Number(d.birth_month) : null,
          },
        },
      });

      if (authError) {
        console.error("Erreur Supabase Auth signUp:", authError);
        toast.error("Erreur Supabase : " + authError.message);
        setBusy(false);
        return;
      }

      const newUserId = authData.user?.id;

      // 2. Explicitly write/upsert into public.profiles in Supabase
      if (newUserId) {
        try {
          const { error: profileError } = await supabase.from("profiles").upsert(
            {
              id: newUserId,
              email,
              full_name: d.full_name.trim(),
              totem: d.totem?.trim() || null,
              quali: d.quali?.trim() || null,
              scout_year: scoutYearNum,
              patrol_id: targetPatrolId && targetPatrolId.includes("-") ? targetPatrolId : null,
              phone: d.phone?.trim() || null,
              birth_day: d.birth_day ? Number(d.birth_day) : null,
              birth_month: d.birth_month ? Number(d.birth_month) : null,
              onboarded: true,
            },
            { onConflict: "id" },
          );

          if (profileError) {
            console.warn("Notice insertion profil Supabase:", profileError);
          }
        } catch (profEx) {
          console.warn("Exception insertion profil Supabase:", profEx);
        }
      }

      // 3. Keep local DB synchronized
      try {
        db.signUp(email, {
          full_name: d.full_name.trim(),
          totem: d.totem?.trim() || null,
          quali: d.quali?.trim() || null,
          scout_year: scoutYearNum,
          patrol_id: targetPatrolId,
          phone: d.phone?.trim() || null,
          birth_day: d.birth_day ? Number(d.birth_day) : null,
          birth_month: d.birth_month ? Number(d.birth_month) : null,
          is_chef: isStaff,
        });
      } catch {
        // ignore
      }

      await refreshProfile();
      setBusy(false);

      if (authData.session) {
        toast.success("Compte scout créé avec succès dans Supabase ! Bienvenue sur l'ALEZAN 42.");
      } else {
        toast.success(
          "Compte créé dans Supabase ! Si la confirmation par e-mail est active, vérifie ta boîte de réception.",
        );
      }
      window.location.href = "/";
    } catch (err: unknown) {
      setBusy(false);
      const msg = err instanceof Error ? err.message : String(err);
      toast.error("Erreur lors de la création du compte : " + msg);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-md px-4 py-8 sm:py-12">
        {/* Navigation Breadcrumb */}
        <div className="mb-6 flex items-center justify-between text-xs">
          <Link
            to="/"
            className="inline-flex items-center gap-1.5 font-bold text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>← Retour au Défi (Accueil)</span>
          </Link>
          <Link
            to="/timeline"
            className="inline-flex items-center gap-1 font-semibold text-muted-foreground hover:text-foreground transition-colors"
          >
            <span>Timeline</span>
            <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {/* Header Icon & Title */}
        <div className="text-center">
          <img
            src={logoAlezanComplet}
            alt="Alezan 42 Cycling Team"
            className="mx-auto h-24 w-auto drop-shadow-sm"
          />
          <h1 className="mt-4 font-display text-2xl sm:text-3xl font-black text-foreground">
            Défi Vélo ALEZAN 42
          </h1>
          <p className="mt-1 text-xs sm:text-sm text-muted-foreground">
            Plateforme officielle de comptabilisation des kilomètres de la troupe
          </p>
        </div>

        {/* Already Logged In Card */}
        {user ? (
          <div className="mt-8 rounded-2xl border border-border/80 bg-card p-6 shadow-sm text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-500 mb-3">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <h2 className="font-display text-lg font-bold text-foreground">Tu es déjà connecté</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Connecté avec <strong>{user.email}</strong>
              {profile?.totem && <span> ({profile.totem})</span>}
              {profile?.patrol_name && (
                <span className="block mt-0.5 text-primary font-medium">
                  Patrouille {profile.patrol_name}
                </span>
              )}
            </p>

            <div className="mt-6 flex flex-col gap-2">
              <Button asChild className="rounded-xl font-bold bg-primary text-primary-foreground">
                <Link to="/mes-km">Accéder à mes kilomètres</Link>
              </Button>
              <Button asChild variant="outline" className="rounded-xl">
                <Link to="/profil">Voir / Modifier mon profil scout</Link>
              </Button>
              <Button asChild variant="secondary" className="rounded-xl font-medium">
                <Link to="/">Voir le Classement général</Link>
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={async () => {
                  await signOut();
                  toast.info("Déconnecté");
                }}
                className="mt-2 text-xs text-muted-foreground hover:text-destructive"
              >
                Changer de compte (Se déconnecter)
              </Button>
            </div>
          </div>
        ) : (
          /* Authentication Tabs */
          <div className="mt-8 rounded-2xl border border-border/80 bg-card p-5 sm:p-6 shadow-sm">
            <Tabs
              value={tab}
              onValueChange={(v) => setTab(v as "login" | "signup")}
              className="w-full"
            >
              <TabsList className="grid w-full grid-cols-2 rounded-xl mb-6">
                <TabsTrigger value="login" className="rounded-lg font-bold text-xs sm:text-sm">
                  Se connecter
                </TabsTrigger>
                <TabsTrigger value="signup" className="rounded-lg font-bold text-xs sm:text-sm">
                  Créer un compte
                </TabsTrigger>
              </TabsList>

              {/* TAB 1: Connexion */}
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-1.5">
                    <Label htmlFor="login-email" className="text-xs font-semibold">
                      Adresse email
                    </Label>
                    <Input
                      id="login-email"
                      type="email"
                      placeholder="scout@troupe.fr"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="login-pw" className="text-xs font-semibold">
                      Mot de passe
                    </Label>
                    <Input
                      id="login-pw"
                      type="password"
                      placeholder="••••••••"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                    <div className="pt-1 text-right">
                      <ForgotPassword initialEmail={loginEmail} />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 mt-2 shadow"
                  >
                    {busy ? "Connexion..." : "Se connecter"}
                  </Button>

                  <div className="pt-2 text-center">
                    <button
                      type="button"
                      onClick={() => setTab("signup")}
                      className="text-xs text-primary hover:underline font-medium"
                    >
                      Nouveau scout ? Crée ton compte avec ta patrouille ici
                    </button>
                  </div>
                </form>
              </TabsContent>

              {/* TAB 2: Inscription complète scout */}
              <TabsContent value="signup">
                <form onSubmit={handleSignup} className="space-y-3.5">
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 text-xs text-muted-foreground flex items-center gap-2">
                    <Sparkles className="h-4 w-4 text-primary shrink-0" />
                    <span>
                      Renseigne ta patrouille et ton totem dès maintenant pour que tes sorties
                      comptent immédiatement !
                    </span>
                  </div>

                  {/* Identifiants */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="signup-email" className="text-xs font-semibold">
                        Email <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="signup-email"
                        type="email"
                        placeholder="scout@mail.com"
                        value={signupForm.email}
                        onChange={(e) => setSignupForm({ ...signupForm, email: e.target.value })}
                        required
                        autoComplete="email"
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="signup-pw" className="text-xs font-semibold">
                        Mot de passe <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        id="signup-pw"
                        type="password"
                        placeholder="Au moins 6 caractères"
                        value={signupForm.password}
                        onChange={(e) => setSignupForm({ ...signupForm, password: e.target.value })}
                        required
                        autoComplete="new-password"
                      />
                    </div>
                  </div>

                  {/* Identité scout */}
                  <div className="space-y-1">
                    <Label htmlFor="signup-name" className="text-xs font-semibold">
                      Nom & Prénom <span className="text-destructive">*</span>
                    </Label>
                    <Input
                      id="signup-name"
                      placeholder="Ex: Antoine Martin"
                      value={signupForm.full_name}
                      onChange={(e) => setSignupForm({ ...signupForm, full_name: e.target.value })}
                      required
                    />
                  </div>

                  {/* Totem & Qualificatif */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label htmlFor="signup-totem" className="text-xs font-semibold">
                        Totem <span className="text-muted-foreground font-normal">(optionnel)</span>
                      </Label>
                      <Input
                        id="signup-totem"
                        placeholder="Ex: Condor"
                        value={signupForm.totem}
                        onChange={(e) => setSignupForm({ ...signupForm, totem: e.target.value })}
                      />
                    </div>

                    <div className="space-y-1">
                      <Label htmlFor="signup-quali" className="text-xs font-semibold">
                        Quali <span className="text-muted-foreground font-normal">(optionnel)</span>
                      </Label>
                      <Input
                        id="signup-quali"
                        placeholder="Ex: Persévérant"
                        value={signupForm.quali}
                        onChange={(e) => setSignupForm({ ...signupForm, quali: e.target.value })}
                      />
                    </div>
                  </div>

                  {/* Patrouille & Année */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">
                        Patrouille <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={signupForm.patrol_id}
                        onValueChange={(val) => setSignupForm({ ...signupForm, patrol_id: val })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choisir patrouille..." />
                        </SelectTrigger>
                        <SelectContent>
                          {patrols.map((p) => {
                            const isStaff = isStaffPatrol(p);
                            return (
                              <SelectItem key={p.id} value={p.id}>
                                {isStaff
                                  ? `👑 ${p.name} (Staff)`
                                  : `${p.name} (${p.category === "femme" ? "Guide / F" : "Scout / H"})`}
                              </SelectItem>
                            );
                          })}
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-1">
                      <Label className="text-xs font-semibold">
                        Année scout <span className="text-destructive">*</span>
                      </Label>
                      <Select
                        value={signupForm.scout_year}
                        onValueChange={(val) => setSignupForm({ ...signupForm, scout_year: val })}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Choisir l'année..." />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">1ère année (Novice)</SelectItem>
                          <SelectItem value="2">2ème année</SelectItem>
                          <SelectItem value="3">3ème année</SelectItem>
                          <SelectItem value="4">4ème année (Aîné/CP)</SelectItem>
                          <SelectItem value="staff">👑 Staff</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-semibold">
                      Anniversaire{" "}
                      <span className="text-muted-foreground font-normal">(optionnel)</span>
                    </Label>
                    <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                      <Select
                        value={signupForm.birth_day || "none"}
                        onValueChange={(v) =>
                          setSignupForm({ ...signupForm, birth_day: v === "none" ? "" : v })
                        }
                      >
                        <SelectTrigger aria-label="Jour de l'anniversaire">
                          <SelectValue placeholder="Jour" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          <SelectItem value="none">—</SelectItem>
                          {Array.from({ length: 31 }, (_, i) => String(i + 1)).map((d) => (
                            <SelectItem key={d} value={d}>
                              {d}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={signupForm.birth_month || "none"}
                        onValueChange={(v) =>
                          setSignupForm({ ...signupForm, birth_month: v === "none" ? "" : v })
                        }
                      >
                        <SelectTrigger aria-label="Mois de l'anniversaire">
                          <SelectValue placeholder="Mois" />
                        </SelectTrigger>
                        <SelectContent className="max-h-72">
                          <SelectItem value="none">—</SelectItem>
                          {MONTHS.map((m, i) => (
                            <SelectItem key={m} value={String(i + 1)}>
                              {m}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      Seuls le jour et le mois sont demandés, jamais l’année.
                    </p>
                  </div>

                  {/* Téléphone (optionnel) */}
                  <div className="space-y-1">
                    <Label htmlFor="signup-phone" className="text-xs font-semibold">
                      Téléphone mobile{" "}
                      <span className="text-muted-foreground font-normal">(optionnel)</span>
                    </Label>
                    <Input
                      id="signup-phone"
                      type="tel"
                      placeholder="06 12 34 56 78"
                      value={signupForm.phone}
                      onChange={(e) => setSignupForm({ ...signupForm, phone: e.target.value })}
                    />
                  </div>

                  <Button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 mt-3 shadow"
                  >
                    {busy ? "Création en cours..." : "Créer mon compte scout"}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </div>
        )}
      </main>
    </div>
  );
}
