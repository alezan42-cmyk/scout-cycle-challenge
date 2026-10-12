import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const clientId = Deno.env.get("STRAVA_CLIENT_ID")!;
const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET")!;
const verifyToken = Deno.env.get("STRAVA_WEBHOOK_VERIFY_TOKEN");
const expectedSubscriptionId = Deno.env.get("STRAVA_WEBHOOK_SUBSCRIPTION_ID");
const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

type StravaEvent = {
  object_type?: string;
  object_id?: number;
  aspect_type?: string;
  owner_id?: number;
  subscription_id?: number;
  updates?: { private?: string; authorized?: string };
};

function sportTag(sport: string): string | null | undefined {
  if (["Ride", "MountainBikeRide", "GravelRide", "VirtualRide", "EBikeRide"].includes(sport)) return "";
  if (["Run", "TrailRun", "VirtualRun"].includes(sport)) return "[course]";
  if (["Walk", "Hike", "Snowshoe"].includes(sport)) return "[marche]";
  return null;
}

async function getFreshToken(connection: Record<string, unknown>) {
  const expiresAt = Number(connection.expires_at);
  if (expiresAt > Math.floor(Date.now() / 1000) + 60) return String(connection.access_token);

  const refresh = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: connection.refresh_token,
      grant_type: "refresh_token",
    }),
  });
  if (!refresh.ok) throw new Error("Impossible de renouveler l’autorisation Strava");
  const tokens = await refresh.json();
  const { error } = await admin.from("strava_connections").update({
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    updated_at: new Date().toISOString(),
  }).eq("user_id", connection.user_id);
  if (error) throw error;
  return String(tokens.access_token);
}

async function handleEvent(event: StravaEvent) {
  if (event.object_type === "athlete" && event.updates?.authorized === "false") {
    await admin.from("strava_connections").delete().eq("athlete_id", event.owner_id);
    return;
  }
  if (event.object_type !== "activity" || !event.object_id || !event.owner_id) return;

  const { data: connection } = await admin
    .from("strava_connections")
    .select("user_id, athlete_id, access_token, refresh_token, expires_at")
    .eq("athlete_id", event.owner_id)
    .maybeSingle();
  if (!connection) return;

  const prior = await admin.from("activities").select("id").eq("strava_activity_id", event.object_id).maybeSingle();
  if (event.aspect_type === "delete" || event.updates?.private === "true") {
    if (prior.data?.id) await admin.from("activities").delete().eq("strava_activity_id", event.object_id);
    return;
  }
  if (event.aspect_type !== "create" && event.aspect_type !== "update") return;

  const token = await getFreshToken(connection as unknown as Record<string, unknown>);
  const activityResponse = await fetch(`https://www.strava.com/api/v3/activities/${event.object_id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!activityResponse.ok) return;
  const activity = await activityResponse.json();
  if (Number(activity.athlete?.id) !== Number(connection.athlete_id)) return;
  const note = sportTag(activity.sport_type ?? activity.type);
  if (note === undefined || note === null) {
    if (prior.data?.id) await admin.from("activities").delete().eq("strava_activity_id", event.object_id);
    return;
  }
  const { error } = await admin.from("activities").upsert({
    user_id: connection.user_id,
    ride_date: String(activity.start_date_local).slice(0, 10),
    km: Number(activity.distance) / 1000,
    elevation_m: Math.round(Number(activity.total_elevation_gain ?? 0)),
    strava_link: `https://www.strava.com/activities/${event.object_id}`,
    strava_activity_id: event.object_id,
    source: "strava",
    status: "approved",
    note: note || null,
  }, { onConflict: "strava_activity_id" });
  if (error) throw error;
}

Deno.serve(async (request) => {
  if (request.method === "GET") {
    const url = new URL(request.url);
    if (
      !verifyToken ||
      url.searchParams.get("hub.mode") !== "subscribe" ||
      url.searchParams.get("hub.verify_token") !== verifyToken
    ) return new Response("Forbidden", { status: 403 });
    return Response.json({ "hub.challenge": url.searchParams.get("hub.challenge") });
  }

  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  let event: StravaEvent;
  try {
    event = await request.json();
  } catch {
    return new Response("Bad request", { status: 400 });
  }
  if (
    !expectedSubscriptionId ||
    Number(event.subscription_id) !== Number(expectedSubscriptionId) ||
    !event.object_type || !event.aspect_type
  ) return new Response("Unauthorized", { status: 401 });

  // Strava expects an acknowledgement within two seconds; process data asynchronously.
  EdgeRuntime.waitUntil(handleEvent(event).catch((error) => console.error("Strava webhook:", error)));
  return new Response("ok", { status: 200 });
});
