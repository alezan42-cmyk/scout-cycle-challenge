// =====================================================================
// Fonction Edge « alerte-attente » : e-mail aux chefs quand trop de
// sorties attendent une validation.
//
// Appelée par la base (trigger après chaque nouvelle sortie en attente,
// en-tête x-cron-secret) ou par un admin depuis la page Admin
// (corps { "test": true } = e-mail de test, sans condition de seuil).
// Réglages : table alert_settings (seuil, destinataires, délai).
// Envoi par SMTP (Gmail : mot de passe d'application) avec les secrets
// SMTP_USER, SMTP_PASS et, en option, SMTP_HOST, SMTP_PORT, SMTP_FROM.
// =====================================================================
import { createClient } from "npm:@supabase/supabase-js@2";
import nodemailer from "npm:nodemailer@6.9.16";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SITE_URL = "https://alezan42-cycling.lesscoutsdemoustier.be";

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

const escapeHtml = (s: string) =>
  s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

type Settings = {
  enabled: boolean;
  threshold: number;
  emails: string[];
  cooldown_hours: number;
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

  // ---------- Qui appelle ? ----------
  let isAdminCall = false;
  const secret = req.headers.get("x-cron-secret");
  if (secret) {
    const { data: ok } = await admin.rpc("cleanup_check_secret", { _secret: secret });
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
    isAdminCall = true;
  }

  let test = false;
  try {
    const body = await req.json();
    test = isAdminCall && body?.test === true;
  } catch {
    // pas de corps
  }

  const { data: s, error: sErr } = await admin
    .from("alert_settings")
    .select("enabled, threshold, emails, cooldown_hours")
    .eq("id", true)
    .single();
  if (sErr || !s) return json({ error: "Réglages introuvables : " + (sErr?.message ?? "") }, 500);
  const settings = s as Settings;
  if (!settings.emails?.length) return json({ envoye: false, raison: "Aucun destinataire" });

  // ---------- Sorties en attente ----------
  const { data: pending, count } = await admin
    .from("activities")
    .select("km, ride_date, created_at, user_id", { count: "exact" })
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(25);
  const n = count ?? 0;

  if (!test) {
    // Seuil, activation et délai vérifiés et réservés en une seule opération
    const { data: claimed } = await admin.rpc("pending_alert_claim", { _count: n });
    if (claimed !== true)
      return json({
        envoye: false,
        raison: "Seuil non dépassé ou délai pas écoulé",
        en_attente: n,
      });
  }

  // Noms des scouts concernés (totem, sinon prénom)
  const ids = [...new Set((pending ?? []).map((p) => p.user_id))];
  const { data: profs } = ids.length
    ? await admin.from("profiles").select("id, totem, full_name, patrols(name)").in("id", ids)
    : { data: [] };
  const nameOf = new Map(
    (
      (profs ?? []) as unknown as {
        id: string;
        totem: string | null;
        full_name: string | null;
        patrols: { name: string } | null;
      }[]
    ).map((p) => [
      p.id,
      `${p.totem || (p.full_name ?? "Scout").split(" ")[0]}${p.patrols?.name ? ` (${p.patrols.name})` : ""}`,
    ]),
  );
  const oldest = pending?.[0]?.created_at
    ? Math.floor((Date.now() - Date.parse(pending[0].created_at)) / 864e5)
    : 0;

  const rows = (pending ?? [])
    .map(
      (p) =>
        `<tr><td style="padding:4px 8px">${escapeHtml(nameOf.get(p.user_id) ?? "Scout")}</td>` +
        `<td style="padding:4px 8px;text-align:right">${Number(p.km).toLocaleString("fr-BE")} km</td>` +
        `<td style="padding:4px 8px">${new Date(p.ride_date).toLocaleDateString("fr-BE")}</td></tr>`,
    )
    .join("");
  const subject = `${test ? "[TEST] " : ""}${n} sortie${n > 1 ? "s" : ""} en attente de validation – Alezan 42`;
  const html = `
<div style="font-family:Arial,sans-serif;max-width:560px;color:#2b1d12">
  <h2 style="margin:0 0 8px">⏳ ${n} sortie${n > 1 ? "s" : ""} attend${n > 1 ? "ent" : ""} une validation</h2>
  <p style="margin:0 0 12px">${test ? "Ceci est un e-mail de test. " : ""}Le seuil d'alerte est de plus de ${settings.threshold} sorties.${oldest > 0 ? ` La plus ancienne attend depuis ${oldest} jour${oldest > 1 ? "s" : ""}.` : ""}</p>
  ${rows ? `<table style="border-collapse:collapse;font-size:14px;margin-bottom:16px">${rows}</table>` : ""}
  ${n > 25 ? `<p style="font-size:13px;color:#7a6250">… et ${n - 25} autre(s).</p>` : ""}
  <p><a href="${SITE_URL}/admin" style="display:inline-block;background:#e8782a;color:#fff;text-decoration:none;padding:10px 16px;border-radius:8px;font-weight:bold">Valider les sorties</a></p>
  <p style="font-size:12px;color:#7a6250">Prochain rappel au plus tôt dans ${settings.cooldown_hours} h. Réglages : Admin → Sorties → Alerte e-mail.</p>
</div>`;
  const text = `${n} sortie(s) en attente de validation sur le site Alezan 42.\n${(pending ?? [])
    .map((p) => `- ${nameOf.get(p.user_id) ?? "Scout"} : ${p.km} km (${p.ride_date})`)
    .join("\n")}\n\nValider : ${SITE_URL}/admin`;

  // ---------- Envoi ----------
  // En cas d'échec, on libère la réservation pour réessayer à la prochaine sortie
  const release = async () => {
    if (!test) await admin.from("alert_settings").update({ last_sent_at: null }).eq("id", true);
  };
  const user = Deno.env.get("SMTP_USER");
  const pass = Deno.env.get("SMTP_PASS");
  if (!user || !pass) {
    await release();
    return json(
      // 200 : l'admin voit le message dans la page (un code d'erreur le masquerait)
      { envoye: false, erreur: "Serveur d'e-mail non configuré (SMTP_USER / SMTP_PASS)" },
      200,
    );
  }
  const port = Number(Deno.env.get("SMTP_PORT") ?? 465);
  try {
    const transport = nodemailer.createTransport({
      host: Deno.env.get("SMTP_HOST") ?? "smtp.gmail.com",
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transport.sendMail({
      from: Deno.env.get("SMTP_FROM") ?? `Alezan 42 <${user}>`,
      to: user,
      bcc: settings.emails,
      subject,
      text,
      html,
    });
  } catch (e) {
    await release();
    return json(
      {
        envoye: false,
        erreur: "Envoi impossible : " + (e instanceof Error ? e.message : String(e)),
      },
      200,
    );
  }
  return json({ envoye: true, en_attente: n, destinataires: settings.emails.length, test });
});
