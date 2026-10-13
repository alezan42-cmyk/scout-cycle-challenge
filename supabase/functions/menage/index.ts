// =====================================================================
// Fonction Edge « menage » : ménage automatique du site Alezan 42
//
// Appelée chaque nuit par pg_cron (en-tête x-cron-secret) ou par un admin
// depuis la page Admin (jeton de session). Elle :
//  1. appelle cleanup_database() : sorties à plusieurs vides, comptes à
//     rebours dépassés, sorties en attente de plus de 60 jours, liens Strava
//     et descriptions des sorties validées depuis plus de 30 jours ;
//  2. efface les photos de preuve validées depuis plus de 30 jours
//     (les km restent, proof_path passe à null) ;
//  3. efface les fichiers orphelins de plus de 7 jours (proofs et backgrounds)
//     qui ne sont plus référencés nulle part ;
//  4. note le résultat dans cleanup_runs.
// Corps JSON optionnel : { "dry_run": true } = aperçu, rien n'est supprimé.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const PHOTO_DAYS = 30;
const ORPHAN_DAYS = 7;
const MAX_FILES_PER_RUN = 300;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });

/** Nom du fichier dans un bucket à partir de son URL publique (ou null). */
function fileName(url: string | null | undefined, bucket: string): string | null {
  if (!url) return null;
  const marker = `/object/public/${bucket}/`;
  const i = url.indexOf(marker);
  if (i < 0) return null;
  return decodeURIComponent(url.slice(i + marker.length).split("?")[0] ?? "") || null;
}

const daysAgo = (n: number) => new Date(Date.now() - n * 24 * 3600 * 1000).toISOString();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // ---------- Qui appelle ? ----------
  let source = "nuit";
  const cronSecret = req.headers.get("x-cron-secret");
  if (cronSecret) {
    const { data: ok } = await admin.rpc("cleanup_check_secret", { _secret: cronSecret });
    if (ok !== true) return json({ error: "Clé invalide" }, 401);
  } else {
    const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) return json({ error: "Connexion requise" }, 401);
    const { data: role } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return json({ error: "Réservé aux admins" }, 403);
    source = "admin";
  }

  let dryRun = false;
  try {
    const body = await req.json();
    dryRun = body?.dry_run === true;
  } catch {
    // pas de corps : vrai ménage
  }

  const report: Record<string, unknown> = { source, aperçu: dryRun };
  const errors: string[] = [];

  // ---------- 1. Base de données ----------
  const { data: db, error: dbError } = await admin.rpc("cleanup_database", { _dry: dryRun });
  if (dbError) errors.push("base : " + dbError.message);
  const dbReport = (db ?? {}) as Record<string, unknown>;
  report.groupes_vides_supprimes = dbReport.groupes_vides_supprimes ?? 0;
  report.comptes_a_rebours_desactives = dbReport.comptes_a_rebours_desactives ?? 0;
  report.sorties_en_attente_supprimees = dbReport.sorties_en_attente_supprimees ?? 0;
  report.sorties_validees_nettoyees = dbReport.sorties_validees_nettoyees ?? 0;
  const pendingFiles = ((dbReport.fichiers_a_effacer as string[] | undefined) ?? [])
    .map((u) => fileName(u, "proofs"))
    .filter((n): n is string => !!n);

  // ---------- 2. Photos de preuve validées depuis plus de 30 jours ----------
  const { data: oldProofs, error: proofError } = await admin
    .from("activities")
    .select("id, proof_path")
    .eq("status", "approved")
    .not("proof_path", "is", null)
    .lt("validated_at", daysAgo(PHOTO_DAYS))
    .limit(MAX_FILES_PER_RUN);
  if (proofError) errors.push("photos : " + proofError.message);
  const photoRows = (oldProofs ?? []) as { id: string; proof_path: string }[];
  const photoFiles = photoRows
    .map((r) => fileName(r.proof_path, "proofs"))
    .filter(Boolean) as string[];

  // ---------- 3. Fichiers orphelins ----------
  const orphanFiles: Record<string, string[]> = { proofs: [], backgrounds: [] };
  if (!errors.length) {
    // Tout ce qui est encore référencé quelque part
    const [acts, challenges, routes, timeline, settings] = await Promise.all([
      admin.from("activities").select("proof_path, gpx_path"),
      admin.from("scout_challenges").select("gpx_template_path"),
      admin.from("proposed_routes").select("gpx_url"),
      admin.from("timeline").select("image_url"),
      admin.from("site_settings").select("value"),
    ]);
    const queryErrors = [acts, challenges, routes, timeline, settings].filter((r) => r.error);
    if (queryErrors.length) {
      errors.push("références : " + queryErrors.map((r) => r.error!.message).join(", "));
    } else {
      const used = new Set<string>();
      for (const a of (acts.data ?? []) as {
        proof_path: string | null;
        gpx_path: string | null;
      }[]) {
        for (const u of [a.proof_path, a.gpx_path]) {
          const n = fileName(u, "proofs");
          if (n) used.add("proofs/" + n);
        }
      }
      for (const c of (challenges.data ?? []) as { gpx_template_path: string | null }[]) {
        const n = fileName(c.gpx_template_path, "proofs");
        if (n) used.add("proofs/" + n);
      }
      for (const r of (routes.data ?? []) as { gpx_url: string | null }[]) {
        const n = fileName(r.gpx_url, "proofs");
        if (n) used.add("proofs/" + n);
      }
      for (const t of (timeline.data ?? []) as { image_url: string | null }[]) {
        for (const b of ["proofs", "backgrounds"]) {
          const n = fileName(t.image_url, b);
          if (n) used.add(`${b}/${n}`);
        }
      }
      for (const s of (settings.data ?? []) as { value: string }[]) {
        const n = fileName(s.value, "backgrounds");
        if (n) used.add("backgrounds/" + n);
      }

      const limit = daysAgo(ORPHAN_DAYS);
      for (const bucket of ["proofs", "backgrounds"] as const) {
        for (let offset = 0; offset < 5000; offset += 1000) {
          const { data: list, error } = await admin.storage
            .from(bucket)
            .list("", { limit: 1000, offset, sortBy: { column: "name", order: "asc" } });
          if (error) {
            errors.push(`liste ${bucket} : ${error.message}`);
            break;
          }
          for (const f of list ?? []) {
            if (!f.id || f.name.startsWith(".")) continue; // dossiers et fichiers techniques
            if (used.has(`${bucket}/${f.name}`)) continue;
            if (!f.created_at || f.created_at > limit) continue; // trop récent : envoi en cours ?
            orphanFiles[bucket].push(f.name);
          }
          if (!list || list.length < 1000) break;
        }
      }
    }
  }

  const toDelete = {
    proofs: [...new Set([...pendingFiles, ...photoFiles, ...orphanFiles.proofs])].slice(
      0,
      MAX_FILES_PER_RUN,
    ),
    backgrounds: orphanFiles.backgrounds.slice(0, MAX_FILES_PER_RUN),
  };
  report.photos_de_preuve_effacees = photoRows.length;
  report.fichiers_orphelins_effaces = orphanFiles.proofs.length + orphanFiles.backgrounds.length;
  report.fichiers_effaces = toDelete.proofs.length + toDelete.backgrounds.length;

  // ---------- Suppression des fichiers ----------
  if (!dryRun) {
    for (const bucket of ["proofs", "backgrounds"] as const) {
      const names = toDelete[bucket];
      for (let i = 0; i < names.length; i += 100) {
        const { error } = await admin.storage.from(bucket).remove(names.slice(i, i + 100));
        if (error) errors.push(`suppression ${bucket} : ${error.message}`);
      }
    }
    if (photoRows.length) {
      const { error } = await admin
        .from("activities")
        .update({ proof_path: null })
        .in(
          "id",
          photoRows.map((r) => r.id),
        );
      if (error) errors.push("mise à jour des sorties : " + error.message);
    }
    await admin.from("cleanup_runs").insert({
      trigger_source: source,
      details: { ...report, erreurs: errors },
    });
  }

  return json({ ...report, erreurs: errors }, errors.length ? 207 : 200);
});
