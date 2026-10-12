import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const clientId = Deno.env.get("STRAVA_CLIENT_ID");
const clientSecret = Deno.env.get("STRAVA_CLIENT_SECRET");
const redirectUri = Deno.env.get("STRAVA_REDIRECT_URI") ?? `${supabaseUrl}/functions/v1/strava-oauth`;
const siteUrl = Deno.env.get("SITE_URL") ?? "https://alezan42-cycling.pages.dev";
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS, GET",
};
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function hashState(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: cors });
  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  if (request.method === "POST") {
    if (!clientId || !clientSecret) return json({ error: "Intégration Strava pas encore configurée" }, 503);
    const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
    const { data, error } = await admin.auth.getUser(token);
    if (error || !data.user) return json({ error: "Connexion requise" }, 401);

    const state = crypto.randomUUID() + crypto.randomUUID();
    const stateHash = await hashState(state);
    await admin.from("strava_oauth_states").delete().lt("expires_at", new Date().toISOString());
    const { error: stateError } = await admin.from("strava_oauth_states").insert({
      state_hash: stateHash,
      user_id: data.user.id,
      expires_at: new Date(Date.now() + 10 * 60_000).toISOString(),
    });
    if (stateError) return json({ error: "Impossible de démarrer la connexion Strava" }, 500);

    const authorizeUrl = new URL("https://www.strava.com/oauth/authorize");
    authorizeUrl.search = new URLSearchParams({
      client_id: clientId,
      response_type: "code",
      redirect_uri: redirectUri,
      approval_prompt: "auto",
      scope: "activity:read",
      state,
    }).toString();
    return json({ url: authorizeUrl.toString() });
  }

  if (request.method !== "GET") return json({ error: "Méthode non prise en charge" }, 405);
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const state = url.searchParams.get("state");
  const denied = url.searchParams.get("error");
  const finish = (result: string) => Response.redirect(`${siteUrl}/profil?strava=${result}`, 303);
  if (denied) return finish("refused");
  if (!code || !state || !clientId || !clientSecret) return finish("error");

  const { data: oauthState, error: stateError } = await admin
    .from("strava_oauth_states")
    .delete()
    .eq("state_hash", await hashState(state))
    .gt("expires_at", new Date().toISOString())
    .select("user_id")
    .maybeSingle();
  if (stateError || !oauthState) return finish("expired");

  const exchange = await fetch("https://www.strava.com/api/v3/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code, grant_type: "authorization_code" }),
  });
  if (!exchange.ok) return finish("error");
  const tokens = await exchange.json();
  const athleteId = Number(tokens.athlete?.id);
  if (!athleteId || !tokens.access_token || !tokens.refresh_token || !tokens.expires_at) return finish("error");

  const { error: saveError } = await admin.from("strava_connections").upsert({
    user_id: oauthState.user_id,
    athlete_id: athleteId,
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token,
    expires_at: tokens.expires_at,
    scope: tokens.token_type ? "activity:read" : "activity:read",
    updated_at: new Date().toISOString(),
  }, { onConflict: "user_id" });
  return finish(saveError ? "error" : "connected");
});
