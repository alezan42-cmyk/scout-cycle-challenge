const CACHE_NAME = "alezan-app-shell-v4";
const APP_SHELL = [
  "/",
  "/manifest.webmanifest",
  "/icon-192.png",
  "/icon-512.png",
  "/apple-touch-icon.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(APP_SHELL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((key) => key.startsWith("alezan-app-shell-") && key !== CACHE_NAME).map((key) => caches.delete(key)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data?.json() ?? {};
  } catch {
    payload = { body: event.data?.text() ?? "" };
  }
  const title = typeof payload.title === "string" ? payload.title : "ALEZAN 42";
  const body = typeof payload.body === "string" ? payload.body : "Tu as une nouvelle notification.";
  const requestedTarget =
    typeof payload.url === "string" ? new URL(payload.url, self.location.origin) : new URL("/app", self.location.origin);
  const target =
    requestedTarget.origin === self.location.origin
      ? requestedTarget.href
      : new URL("/app", self.location.origin).href;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: { url: target },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || "/app", self.location.origin);
  const target =
    targetUrl.origin === self.location.origin ? targetUrl.href : new URL("/app", self.location.origin).href;
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (windows) => {
      const appWindow = windows.find((client) => new URL(client.url).origin === self.location.origin);
      if (appWindow) {
        await appWindow.navigate(target);
        return appWindow.focus();
      }
      return clients.openWindow(target);
    }),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // Cache uniquement le shell public de l’application. Les données de compte,
  // les appels Supabase, les cartes et les fichiers de preuve restent réseau.
  // Écrans de l’app installée (/app…) : même page de départ que « / » hors connexion.
  const isAppShell =
    request.mode === "navigate" && (url.pathname === "/" || url.pathname.startsWith("/app"));
  const isStaticAsset = /\.(?:css|js|png|jpe?g|svg|ico|woff2?)$/i.test(url.pathname);
  if (!isAppShell && !isStaticAsset) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(async () => {
        const cached = await caches.match(request);
        if (cached) return cached;
        if (isAppShell) return (await caches.match("/")) || Response.error();
        return Response.error();
      }),
  );
});
