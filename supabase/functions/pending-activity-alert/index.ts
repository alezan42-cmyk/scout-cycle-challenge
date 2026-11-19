import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "POST attendu" }, 405);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const cronSecret = req.headers.get("x-cron-secret");
  if (!cronSecret) return json({ error: "Clé manquante" }, 401);
  const { data: secretIsValid, error: secretError } = await admin.rpc("cleanup_check_secret", {
    _secret: cronSecret,
  });
  if (secretError || secretIsValid !== true) return json({ error: "Clé invalide" }, 401);

  const resendKey = Deno.env.get("RESEND_API_KEY");
  const from = Deno.env.get("PENDING_ACTIVITY_ALERT_FROM");
  const recipients = (Deno.env.get("PENDING_ACTIVITY_ALERT_TO") ?? "")
    .split(",")
    .map((email) => email.trim())
    .filter(Boolean);
  if (!resendKey || !from || recipients.length === 0) {
    return json({ error: "Configuration email incomplète" }, 503);
  }

  const { count, error: countError } = await admin
    .from("activities")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending");
  if (countError) return json({ error: "Impossible de compter les activités" }, 500);

  const pendingCount = count ?? 0;
  const { data: alert, error: claimError } = await admin.rpc("claim_pending_activity_alert", {
    _pending_count: pendingCount,
  });
  if (claimError) return json({ error: "Impossible de vérifier le seuil d'alerte" }, 500);

  const claim = alert as { should_send?: boolean; pending_count?: number } | null;
  if (!claim?.should_send) {
    return json({ status: "aucune alerte", pending_count: pendingCount });
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to: recipients,
      subject: `Alezan 42 : ${pendingCount} activités à approuver`,
      text: `Il y a actuellement ${pendingCount} activités en attente d'approbation sur Alezan 42.\n\nOuvrir l'administration : https://alezan42-cycling.lesscoutsdemoustier.be/admin`,
    }),
  });

  if (!response.ok) {
    await admin.rpc("release_pending_activity_alert");
    console.error("Resend a refusé l'alerte email", response.status);
    return json({ error: "L'email n'a pas pu être envoyé" }, 502);
  }

  return json({ status: "email accepté", pending_count: pendingCount });
});
