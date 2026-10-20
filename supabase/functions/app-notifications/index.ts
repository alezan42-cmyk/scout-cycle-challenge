import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

const url = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") ?? "";
const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY") ?? "";
const vapidSubject = Deno.env.get("VAPID_SUBJECT") ?? "https://alezan42-cycling.pages.dev";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-cron-secret",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

function brusselsSunday(hour: number) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Brussels",
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return values.weekday === "Sun" && values.hour === String(hour).padStart(2, "0")
    ? `${values.year}-${values.month}-${values.day}`
    : null;
}

async function createSundayReminders() {
  const { data: settings, error: settingsError } = await admin
    .from("app_notification_settings")
    .select("weekly_enabled,weekly_hour,weekly_title,weekly_body")
    .eq("singleton", true)
    .maybeSingle();
  if (settingsError) throw settingsError;
  if (!settings?.weekly_enabled) return 0;
  const sunday = brusselsSunday(settings.weekly_hour);
  if (!sunday) return 0;
  const { data: profiles, error } = await admin.from("profiles").select("id").limit(5000);
  if (error) throw error;
  const rows = (profiles ?? []).map(({ id }) => ({
    user_id: id,
    kind: "weekly_reminder",
    title: settings.weekly_title,
    body: settings.weekly_body,
    href: "/app/enregistrer",
    dedupe_key: `weekly:${id}:${sunday}`,
  }));
  if (!rows.length) return 0;
  const result = await admin
    .from("app_notifications")
    .upsert(rows, { onConflict: "dedupe_key", ignoreDuplicates: true });
  if (result.error) throw result.error;
  return rows.length;
}

async function deleteExpiredReadNotifications() {
  const readBefore = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data, error } = await admin
    .from("app_notifications")
    .delete()
    .not("read_at", "is", null)
    .lt("read_at", readBefore)
    .select("id");
  if (error) throw error;
  return data?.length ?? 0;
}

async function dispatchPending() {
  if (!vapidPublicKey || !vapidPrivateKey)
    throw new Error("Clés VAPID absentes (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)");
  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);
  const { data: notifications, error } = await admin
    .from("app_notifications")
    .select("id,user_id,title,body,href,push_attempts")
    .is("push_sent_at", null)
    .order("created_at", { ascending: true })
    .limit(100);
  if (error) throw error;
  let delivered = 0;
  for (const notification of notifications ?? []) {
    const { data: subscriptions, error: subscriptionError } = await admin
      .from("app_push_subscriptions")
      .select("endpoint,subscription")
      .eq("user_id", notification.user_id);
    let deliveryError = subscriptionError?.message ?? "";
    for (const row of subscriptions ?? []) {
      try {
        await webpush.sendNotification(
          row.subscription,
          JSON.stringify({
            title: notification.title,
            body: notification.body,
            url: notification.href,
          }),
        );
        delivered++;
      } catch (error) {
        const status = (error as { statusCode?: number }).statusCode;
        deliveryError = String(error);
        if (status === 404 || status === 410)
          await admin.from("app_push_subscriptions").delete().eq("endpoint", row.endpoint);
        console.warn("Échec d’envoi push", notification.id, status ?? error);
      }
    }
    const attempts = notification.push_attempts + (deliveryError ? 1 : 0);
    await admin
      .from("app_notifications")
      .update({
        push_sent_at: !deliveryError || attempts >= 5 ? new Date().toISOString() : null,
        push_attempts: attempts,
        push_last_error: deliveryError ? deliveryError.slice(0, 500) : null,
      })
      .eq("id", notification.id)
      .is("push_sent_at", null);
  }
  return { attempted: notifications?.length ?? 0, delivered };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (request.method !== "POST") return json({ error: "POST attendu" }, 405);
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return json({ error: "JSON invalide" }, 400);
  }

  if (request.headers.has("x-cron-secret")) {
    const { data: valid } = await admin.rpc("cleanup_check_secret", {
      _secret: request.headers.get("x-cron-secret"),
    });
    if (valid !== true) return json({ error: "Clé invalide" }, 401);
    try {
      const reminders = await createSundayReminders();
      const deleted = await deleteExpiredReadNotifications();
      const push = await dispatchPending();
      return json({ reminders, deleted, ...push });
    } catch (error) {
      console.error("Traitement des notifications", error);
      return json({ error: String(error) }, 500);
    }
  }

  if (body.action === "public-key") return json({ publicKey: vapidPublicKey });
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const { data: authData, error: authError } = await admin.auth.getUser(token);
  if (authError || !authData.user) return json({ error: "Connexion requise" }, 401);
  if (body.action === "register-installation") {
    const installationId = typeof body.installationId === "string" ? body.installationId : "";
    const platform = typeof body.platform === "string" ? body.platform : "other";
    if (
      installationId.length < 8 ||
      installationId.length > 100 ||
      !["ios", "android", "desktop", "other"].includes(platform)
    )
      return json({ error: "Informations d’installation invalides" }, 400);
    const { error } = await admin.from("app_installations").upsert(
      {
        user_id: authData.user.id,
        installation_id: installationId,
        platform,
        last_seen_at: new Date().toISOString(),
      },
      { onConflict: "user_id,installation_id" },
    );
    return error
      ? json({ error: "Enregistrement de l’application impossible" }, 500)
      : json({ ok: true });
  }
  if (body.action === "admin-status") {
    const { data: role } = await admin
      .from("user_roles")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .eq("role", "admin")
      .maybeSingle();
    if (!role) return json({ error: "Accès réservé au staff" }, 403);
    const [profilesResult, installationsResult, subscriptionsResult] = await Promise.all([
      admin.from("profiles").select("id,full_name,totem").order("full_name"),
      admin.from("app_installations").select("user_id,platform,last_seen_at"),
      admin.from("app_push_subscriptions").select("user_id,updated_at"),
    ]);
    if (profilesResult.error || installationsResult.error || subscriptionsResult.error)
      return json({ error: "Impossible de charger l’état de l’application" }, 500);
    const installations = installationsResult.data ?? [];
    const subscriptions = subscriptionsResult.data ?? [];
    return json({
      scouts: (profilesResult.data ?? []).map((scout) => {
        const devices = installations.filter((entry) => entry.user_id === scout.id);
        const pushes = subscriptions.filter((entry) => entry.user_id === scout.id);
        const lastSeen =
          devices
            .map((entry) => entry.last_seen_at)
            .sort()
            .at(-1) ?? null;
        return {
          id: scout.id,
          full_name: scout.full_name,
          totem: scout.totem,
          app_used: devices.length > 0,
          device_count: devices.length,
          platforms: [...new Set(devices.map((entry) => entry.platform))],
          last_seen_at: lastSeen,
          notifications_enabled: pushes.length > 0,
          push_device_count: pushes.length,
        };
      }),
    });
  }
  if (body.action === "subscribe") {
    const subscription = body.subscription as
      { endpoint?: string; keys?: { p256dh?: string; auth?: string } } | undefined;
    if (
      !subscription?.endpoint ||
      !subscription.keys?.p256dh ||
      !subscription.keys.auth ||
      !subscription.endpoint.startsWith("https://")
    ) {
      return json({ error: "Abonnement push invalide" }, 400);
    }
    const { error } = await admin.from("app_push_subscriptions").upsert({
      endpoint: subscription.endpoint,
      user_id: authData.user.id,
      subscription,
      updated_at: new Date().toISOString(),
    });
    return error ? json({ error: "Enregistrement impossible" }, 500) : json({ ok: true });
  }
  if (body.action === "unsubscribe") {
    const endpoint = typeof body.endpoint === "string" ? body.endpoint : "";
    const { error } = await admin
      .from("app_push_subscriptions")
      .delete()
      .eq("endpoint", endpoint)
      .eq("user_id", authData.user.id);
    return error ? json({ error: "Désactivation impossible" }, 500) : json({ ok: true });
  }
  return json({ error: "Action non prise en charge" }, 400);
});
