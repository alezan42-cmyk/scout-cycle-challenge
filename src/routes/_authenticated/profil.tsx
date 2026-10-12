import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { User, Check, Crown, Link2 } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { db, getPatrolEmblem } from "@/lib/database";
import { isStaffPatrol, isTroopStaffPatrol, TROOP_STAFF_PATROL_NAME } from "@/lib/categories";

export const Route = createFileRoute("/_authenticated/profil")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Mon profil — ALEZAN 42" },
      {
        name: "description",
        content: "Complète ton profil scout : totem, quali, année, patrouille.",
      },
    ],
  }),
  component: Profil,
});

const schema = z.object({
  full_name: z.string().trim().min(1, "Nom requis").max(100),
  totem: z.string().trim().max(60).optional().nullable(),
  quali: z.string().trim().max(60).optional().nullable(),
  scout_year: z.number().int().min(1).max(4).optional().nullable(),
  phone: z
    .string()
    .trim()
    .refine((v) => !v || /^[+0-9 ./-]{8,20}$/.test(v), "Format de téléphone invalide")
    .optional()
    .nullable(),
  strava_url: z
    .string()
    .trim()
    .max(255)
    .refine((v) => !v || /^https?:\/\//.test(v), "Lien Strava invalide (commence par https://)")
    .optional()
    .nullable(),
  patrol_id: z.string().min(1, "Choisis ta patrouille"),
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

/** Nombre de jours max d'un mois (29 en février : anniversaire du 29/02 accepté). */
function daysInMonth(month: number): number {
  return month === 2 ? 29 : [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function Profil() {
  const { user } = Route.useRouteContext();
  const { refreshProfile } = useAuth();
  const [patrols, setPatrols] = useState<{ id: string; name: string; category: string }[]>([]);
  const [f, setF] = useState({
    full_name: "",
    totem: "",
    quali: "",
    scout_year: "",
    phone: "",
    strava_url: "",
    patrol_id: "",
    birth_day: "",
    birth_month: "",
  });
  const [busy, setBusy] = useState(false);
  const [connectingStrava, setConnectingStrava] = useState(false);

  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get("strava");
    if (!result) return;
    if (result === "connected") toast.success("Compte Strava associé ! Les nouvelles sorties publiques seront synchronisées.");
    else if (result === "refused") toast.info("Connexion Strava annulée.");
    else toast.error("La connexion Strava a échoué. Réessaie plus tard.");
    window.history.replaceState({}, "", window.location.pathname);
  }, []);

  const connectStrava = async () => {
    setConnectingStrava(true);
    const { data, error } = await supabase.functions.invoke("strava-oauth", { body: {} });
    setConnectingStrava(false);
    const result = data as { url?: string; error?: string } | null;
    if (error || !result?.url) {
      toast.error(result?.error ?? error?.message ?? "Impossible de démarrer la connexion Strava.");
      return;
    }
    window.location.assign(result.url);
  };

  useEffect(() => {
    let active = true;
    async function loadData() {
      // 1. Charger les patrouilles
      const { data: pts } = await supabase
        .from("patrols")
        .select("id, name, category")
        .order("name");

      let list = pts && pts.length > 0 ? pts : db.getPatrols();
      if (
        !list.some(
          (p) => p.name.toLowerCase().includes("staff") || p.name.toLowerCase().includes("chef"),
        )
      ) {
        list = [{ id: "staff", name: TROOP_STAFF_PATROL_NAME, category: "staff" }, ...list];
      }
      if (active) {
        setPatrols(list);
      }

      // 2. Charger le profil uniquement depuis la table 'profiles'
      const { data: profile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", user.id)
        .maybeSingle();

      const p = profile || db.getProfile(user.id);
      if (active && p) {
        setF({
          full_name: p.full_name ?? "",
          totem: p.totem ?? "",
          quali: p.quali ?? "",
          scout_year: p.scout_year ? String(p.scout_year) : "",
          phone: p.phone ?? "",
          strava_url: p.strava_url ?? "",
          patrol_id: p.patrol_id ?? "",
          birth_day: p.birth_day ? String(p.birth_day) : "",
          birth_month: p.birth_month ? String(p.birth_month) : "",
        });
      }
    }
    loadData();
    return () => {
      active = false;
    };
  }, [user.id]);

  const selectedPatrol = patrols.find((p) => p.id === f.patrol_id);
  const isChefPatrol = isStaffPatrol(selectedPatrol);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);

    const yearVal = isChefPatrol ? null : f.scout_year ? Number(f.scout_year) : null;
    const parsed = schema.safeParse({
      ...f,
      totem: f.totem || null,
      quali: f.quali || null,
      phone: f.phone || null,
      strava_url: f.strava_url || null,
      scout_year: yearVal,
    });

    if (!parsed.success) {
      setBusy(false);
      toast.error(parsed.error.issues[0]?.message);
      return;
    }

    const d = parsed.data;

    // Anniversaire facultatif : jour ET mois, ou rien
    const birthDay = f.birth_day ? Number(f.birth_day) : null;
    const birthMonth = f.birth_month ? Number(f.birth_month) : null;
    if ((birthDay === null) !== (birthMonth === null)) {
      setBusy(false);
      toast.error("Anniversaire : choisis le jour et le mois (ou aucun des deux)");
      return;
    }
    if (birthDay && birthMonth && birthDay > daysInMonth(birthMonth)) {
      setBusy(false);
      toast.error("Cette date d'anniversaire n'existe pas");
      return;
    }

    let targetPatrolId: string | null = d.patrol_id;
    if (!targetPatrolId || d.patrol_id === "staff" || d.patrol_id.includes("staff")) {
      const staffItem = patrols.find((p) => isTroopStaffPatrol(p));
      if (staffItem) {
        targetPatrolId = staffItem.id;
      }
    }

    const profilePayload = {
      id: user.id,
      email: user.email || null,
      full_name: d.full_name.trim(),
      totem: d.totem?.trim() || null,
      quali: d.quali?.trim() || null,
      phone: d.phone?.trim() || null,
      strava_url: d.strava_url?.trim() || null,
      scout_year: d.scout_year ?? null,
      patrol_id: targetPatrolId,
      birth_day: birthDay,
      birth_month: birthMonth,
      onboarded: true,
    };

    try {
      // Insertion/Mise à jour ciblée uniquement sur la table publique 'profiles'
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from("profiles") as any).upsert(profilePayload);

      if (error) {
        throw new Error(error.message);
      }

      // Mise à jour du cache local
      db.updateProfile(user.id, {
        ...profilePayload,
        email: user.email ?? null,
        is_chef: isChefPatrol,
      });

      await refreshProfile();
      toast.success("Profil scout enregistré avec succès !");
      window.location.href = "/";
    } catch (err: any) {
      toast.error("Erreur lors de la sauvegarde : " + (err.message || err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <main className="mx-auto max-w-xl px-4 py-8 sm:py-12">
        <div className="mb-6 rounded-2xl border border-primary/20 bg-primary/10 p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 text-white font-black text-xl shadow">
                ⚜️
              </span>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-display font-black text-sm sm:text-base text-foreground">
                    {f.full_name || user.email?.split("@")[0] || "Scout"}
                  </span>
                  {f.totem && (
                    <span className="italic text-xs font-bold text-primary">
                      « {f.totem}
                      {f.quali ? ` ${f.quali}` : ""} »
                    </span>
                  )}
                  {selectedPatrol ? (
                    <span className="rounded-full bg-amber-500/20 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold text-amber-800 dark:text-amber-300">
                      {isChefPatrol
                        ? `👑 ${selectedPatrol.name} (Staff)`
                        : `${getPatrolEmblem(selectedPatrol.name)} Patrouille ${selectedPatrol.name}`}
                    </span>
                  ) : (
                    <span className="rounded-full bg-amber-500/10 border border-amber-500/30 px-2 py-0.5 text-[11px] font-bold text-amber-600">
                      ⚠️ Patrouille à définir
                    </span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Compte connecté : <strong>{user.email}</strong>
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to="/scout/$scoutId"
                params={{ scoutId: user.id }}
                className="text-xs font-bold text-primary hover:underline"
              >
                Voir mon profil
              </Link>
              <Link
                to="/"
                className="text-xs font-bold text-primary hover:underline inline-flex items-center gap-1"
              >
                ← Retour à l'accueil
              </Link>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 bg-card p-6 sm:p-8 shadow-sm">
          <div className="flex items-center gap-3 border-b pb-4">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
              <User className="h-5 w-5" />
            </span>
            <div>
              <h1 className="font-display text-2xl font-black text-foreground">Mon Profil Scout</h1>
              <p className="text-xs text-muted-foreground">
                Configure ton totem, ta patrouille et ton lien Strava
              </p>
            </div>
          </div>

          <form onSubmit={save} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="fullname">Nom et Prénom *</Label>
              <Input
                id="fullname"
                value={f.full_name}
                onChange={(e) => setF({ ...f, full_name: e.target.value })}
                placeholder="Ex: Baudouin Martin"
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="totem">Totem (optionnel)</Label>
                <Input
                  id="totem"
                  value={f.totem}
                  onChange={(e) => setF({ ...f, totem: e.target.value })}
                  placeholder="Ex: Élan"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="quali">Quali (optionnel)</Label>
                <Input
                  id="quali"
                  value={f.quali}
                  onChange={(e) => setF({ ...f, quali: e.target.value })}
                  placeholder="Ex: Généreux"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Patrouille *</Label>
              <Select
                value={f.patrol_id}
                onValueChange={(v) => {
                  setF({
                    ...f,
                    patrol_id: v,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Sélectionne ta patrouille" />
                </SelectTrigger>
                <SelectContent>
                  {patrols.map((p) => {
                    const isStaff = isStaffPatrol(p);
                    return (
                      <SelectItem key={p.id} value={p.id}>
                        {isStaff
                          ? `👑 ${p.name} (Staff)`
                          : `${p.name} (${p.category === "homme" ? "Garçons" : "Filles"})`}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>

            {isChefPatrol ? (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-700 dark:text-amber-300">
                <div className="flex items-center gap-1.5 font-bold">
                  <Crown className="h-4 w-4" />
                  Patrouille staff sélectionnée
                </div>
                <p className="mt-0.5 text-[11px] opacity-90">
                  Tes kilomètres comptent dans les classements Garçons et Filles, avec
                  l&apos;étiquette Staff.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5">
                <Label>Année scout</Label>
                <Select value={f.scout_year} onValueChange={(v) => setF({ ...f, scout_year: v })}>
                  <SelectTrigger>
                    <SelectValue placeholder="Sélectionne ton année dans la troupe" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1ère année (Nouveau)</SelectItem>
                    <SelectItem value="2">2ème année</SelectItem>
                    <SelectItem value="3">3ème année</SelectItem>
                    <SelectItem value="4">4ème année (CP / Aîné)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-1.5">
              <Label>Anniversaire (optionnel)</Label>
              <div className="grid grid-cols-[5.5rem_1fr] gap-2">
                <Select
                  value={f.birth_day || "none"}
                  onValueChange={(v) => setF({ ...f, birth_day: v === "none" ? "" : v })}
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
                  value={f.birth_month || "none"}
                  onValueChange={(v) => setF({ ...f, birth_month: v === "none" ? "" : v })}
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
                Seulement le jour et le mois, jamais l&apos;année. Ton anniversaire sera souhaité
                sur l&apos;accueil, visible uniquement par les membres connectés.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="phone">Numéro de téléphone (optionnel)</Label>
              <Input
                id="phone"
                type="tel"
                value={f.phone}
                onChange={(e) => setF({ ...f, phone: e.target.value })}
                placeholder="06 12 34 56 78"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="strava">Lien profil Strava (optionnel)</Label>
              <Input
                id="strava"
                value={f.strava_url}
                onChange={(e) => setF({ ...f, strava_url: e.target.value })}
                placeholder="https://www.strava.com/athletes/..."
              />
            </div>

            <div className="rounded-xl border border-orange-200 bg-orange-50/70 p-4 dark:border-orange-900 dark:bg-orange-950/20">
              <p className="text-sm font-semibold">Synchronise tes sorties Strava</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Associe ton compte pour importer automatiquement tes nouvelles sorties visibles par l’application.
              </p>
              <Button
                type="button"
                variant="outline"
                onClick={connectStrava}
                disabled={connectingStrava}
                className="mt-3 rounded-lg border-[#fc4c02]/40 font-bold text-[#d74300] hover:bg-orange-100"
              >
                <Link2 className="mr-2 h-4 w-4" />
                {connectingStrava ? "Connexion…" : "Associer mon compte Strava"}
              </Button>
            </div>

            <Button
              type="submit"
              disabled={busy}
              className="w-full rounded-xl font-bold bg-primary text-primary-foreground hover:bg-primary/90 mt-4 shadow"
            >
              <Check className="mr-2 h-4 w-4" />
              {busy ? "Enregistrement..." : "Enregistrer mon profil"}
            </Button>
          </form>
        </div>
      </main>
    </div>
  );
}
