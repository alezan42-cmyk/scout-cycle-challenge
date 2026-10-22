import { useCallback, useEffect, useState } from "react";
import { Bell, BellRing, CheckCheck, ExternalLink, LoaderCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type AppNotification = {
  id: string;
  title: string;
  body: string;
  href: string;
  created_at: string;
  read_at: string | null;
};

function announcePushStatus(enabled: boolean) {
  window.dispatchEvent(new CustomEvent("alezan:push-status", { detail: { enabled } }));
}

function base64UrlToBytes(value: string) {
  const padded = (value + "===".slice((value.length + 3) % 4))
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const raw = atob(padded);
  return Uint8Array.from(raw, (char) => char.charCodeAt(0));
}

export function AppNotifications() {
  const { user } = useAuth();
  const [standalone, setStandalone] = useState(false);
  const [open, setOpen] = useState(false);
  const [optInOpen, setOptInOpen] = useState(false);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const unread = items.filter((item) => !item.read_at).length;
  const snoozeOptIn = () => {
    if (user?.id) {
      try {
        localStorage.setItem(`app-push-opt-in-dismissed:${user.id}`, String(Date.now()));
      } catch {
        // L’invitation pourra réapparaître si le stockage local est indisponible.
      }
    }
    setOptInOpen(false);
  };

  const load = useCallback(async () => {
    if (!user?.id) {
      setItems([]);
      return;
    }
    const { data } = await supabase
      .from("app_notifications")
      .select("id,title,body,href,created_at,read_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setItems((data ?? []) as AppNotification[]);
  }, [user?.id]);

  useEffect(() => {
    const isApp =
      window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setStandalone(isApp);
  }, []);

  useEffect(() => {
    const openNotifications = () => {
      setOpen(true);
      setMessage("");
    };
    window.addEventListener("alezan:open-app-notifications", openNotifications);
    return () => window.removeEventListener("alezan:open-app-notifications", openNotifications);
  }, []);

  useEffect(() => {
    if (!standalone || !user?.id) return;
    let installationId = "";
    try {
      installationId = localStorage.getItem("alezan-app-installation-id") ?? "";
      if (!installationId) {
        installationId = crypto.randomUUID();
        localStorage.setItem("alezan-app-installation-id", installationId);
      }
    } catch {
      installationId = crypto.randomUUID();
    }
    const ua = navigator.userAgent.toLowerCase();
    const platform = /iphone|ipad|ipod/.test(ua)
      ? "ios"
      : /android/.test(ua)
        ? "android"
        : /macintosh|windows|linux/.test(ua)
          ? "desktop"
          : "other";
    void supabase.functions.invoke("app-notifications", {
      body: { action: "register-installation", installationId, platform },
    });
  }, [standalone, user?.id]);

  useEffect(() => {
    if (!standalone || !user?.id || !("Notification" in window) || !("serviceWorker" in navigator))
      return;
    if (Notification.permission === "denied") return;
    const dismissedKey = `app-push-opt-in-dismissed:${user.id}`;
    try {
      const dismissedAt = Number(localStorage.getItem(dismissedKey) ?? 0);
      if (dismissedAt && Date.now() - dismissedAt < 30 * 24 * 60 * 60 * 1000) return;
    } catch {
      // Le choix reste facultatif si le stockage local est indisponible.
    }
    let active = true;
    void navigator.serviceWorker.ready
      .then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        if (active && !subscription && !pushEnabled) setOptInOpen(true);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [pushEnabled, standalone, user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void load();
    const channel = supabase
      .channel(`app-notifications-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "app_notifications",
          filter: `user_id=eq.${user.id}`,
        },
        () => void load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [load, user?.id]);

  useEffect(() => {
    if (!standalone || !user?.id || !("serviceWorker" in navigator)) return;
    void navigator.serviceWorker.ready
      .then(async (registration) => {
        const subscription = await registration.pushManager.getSubscription();
        setPushEnabled(!!subscription);
        announcePushStatus(!!subscription);
        if (subscription) {
          await supabase.functions.invoke("app-notifications", {
            body: { action: "subscribe", subscription: subscription.toJSON() },
          });
        }
      })
      .catch(() => {
        setPushEnabled(false);
        announcePushStatus(false);
      });
  }, [standalone, user?.id]);

  const enablePush = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (!("Notification" in window) || !("serviceWorker" in navigator))
        throw new Error("Les notifications ne sont pas disponibles sur cet appareil.");
      const permission =
        Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
      if (permission !== "granted")
        throw new Error("Autorise les notifications dans les réglages de ton appareil.");
      const { data: keyResult, error: keyError } = await supabase.functions.invoke(
        "app-notifications",
        { body: { action: "public-key" } },
      );
      if (keyError || !keyResult?.publicKey)
        throw new Error("Le service de notifications n’est pas encore configuré.");
      const registration = await navigator.serviceWorker.ready;
      if (!registration.pushManager)
        throw new Error("Les notifications push ne sont pas prises en charge par cet appareil.");
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: base64UrlToBytes(keyResult.publicKey),
      });
      const { error } = await supabase.functions.invoke("app-notifications", {
        body: { action: "subscribe", subscription: subscription.toJSON() },
      });
      if (error) throw new Error("Impossible d’activer les notifications. Réessaie plus tard.");
      setPushEnabled(true);
      announcePushStatus(true);
      setMessage("Les notifications sont activées sur cet appareil.");
      setOptInOpen(false);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Activation impossible.");
    } finally {
      setBusy(false);
    }
  };

  const disablePush = async () => {
    setBusy(true);
    setMessage("");
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await supabase.functions.invoke("app-notifications", {
          body: { action: "unsubscribe", endpoint: subscription.endpoint },
        });
        await subscription.unsubscribe();
      }
      setPushEnabled(false);
      announcePushStatus(false);
      setMessage("Les notifications sont désactivées sur cet appareil.");
      snoozeOptIn();
    } finally {
      setBusy(false);
    }
  };

  const markRead = async (item: AppNotification) => {
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      await supabase.from("app_notifications").update({ read_at: readAt }).eq("id", item.id);
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? { ...entry, read_at: readAt } : entry)),
      );
    }
    setOpen(false);
    const safePath =
      item.href.startsWith("/") && !item.href.startsWith("//") && !item.href.includes("\\")
        ? item.href
        : "/";
    window.location.assign(safePath);
  };

  const markAllRead = async () => {
    if (!user?.id || !unread) return;
    const readAt = new Date().toISOString();
    await supabase
      .from("app_notifications")
      .update({ read_at: readAt })
      .eq("user_id", user.id)
      .is("read_at", null);
    setItems((current) => current.map((item) => ({ ...item, read_at: item.read_at ?? readAt })));
  };

  if (!standalone || !user) return null;
  return (
    <>
      <Dialog
        open={optInOpen}
        onOpenChange={(nextOpen) => (nextOpen ? setOptInOpen(true) : snoozeOptIn())}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-xl font-black">
              Des nouvelles de la troupe, sans spam
            </DialogTitle>
            <DialogDescription>
              Reçois seulement les nouvelles utiles : sorties, défis, paliers de kilomètres et
              encouragements. Pas de messages en série ni d’alertes quotidiennes ; le rappel du
              dimanche peut aussi être désactivé par l’équipe.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button type="button" variant="outline" onClick={snoozeOptIn}>
              Plus tard
            </Button>
            <Button type="button" disabled={busy} onClick={() => void enablePush()}>
              {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
              Activer les notifications
            </Button>
          </div>
          {message && (
            <p role="status" className="text-sm text-muted-foreground">
              {message}
            </p>
          )}
        </DialogContent>
      </Dialog>
      <Button
        type="button"
        size="icon"
        variant="secondary"
        aria-label={`Notifications${unread ? `, ${unread} non lue(s)` : ""}`}
        className="fixed right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] h-11 w-11 rounded-full border border-white/30 text-white shadow-lg"
        style={{ backgroundColor: "var(--header)" }}
        onClick={() => {
          setOpen(true);
          setMessage("");
        }}
      >
        {unread ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {unread > 0 && (
          <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full border border-white/70 bg-white px-1 text-[10px] text-[var(--header)]">
            {unread > 9 ? "9+" : unread}
          </Badge>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-h-[85dvh] overflow-hidden p-0 sm:max-w-lg"
          style={{ borderColor: "var(--header)" }}
        >
          <DialogHeader
            className="border-b p-5 pr-12 text-left text-white"
            style={{ backgroundColor: "var(--header)" }}
          >
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="font-display text-xl font-black">Notifications</DialogTitle>
              {unread > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-white hover:bg-white/10 hover:text-white"
                  onClick={() => void markAllRead()}
                >
                  <CheckCheck className="h-4 w-4" /> Tout lire
                </Button>
              )}
            </div>
            <DialogDescription className="text-white/80">
              Rappels du dimanche (si activés), paliers de kilomètres franchis et messages du staff.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-5">
            <div className="rounded-2xl border bg-muted/40 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <BellRing className="h-4 w-4 text-primary" /> Notifications push
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Quelques nouvelles utiles de la troupe, même lorsque l’application est fermée. Pas
                de spam ni d’alertes quotidiennes.
              </p>
              <Button
                type="button"
                variant={pushEnabled ? "outline" : "default"}
                size="sm"
                className="mt-3"
                disabled={busy}
                onClick={() => void (pushEnabled ? disablePush() : enablePush())}
              >
                {busy && <LoaderCircle className="h-4 w-4 animate-spin" />}
                {pushEnabled ? "Désactiver sur cet appareil" : "Activer les notifications"}
              </Button>
              {message && (
                <p role="status" className="mt-2 text-xs text-muted-foreground">
                  {message}
                </p>
              )}
            </div>
            <div className="space-y-2">
              {items.length ? (
                items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => void markRead(item)}
                    className="w-full rounded-2xl border p-4 text-left transition-colors hover:brightness-[0.98]"
                    style={{
                      borderColor: item.read_at ? undefined : "var(--header)",
                      backgroundColor: item.read_at
                        ? undefined
                        : "color-mix(in srgb, var(--header) 9%, var(--card))",
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-muted-foreground/30" : ""}`}
                        style={item.read_at ? undefined : { backgroundColor: "var(--header)" }}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{item.title}</span>
                        <span className="mt-1 block text-sm text-muted-foreground">
                          {item.body}
                        </span>
                        <span className="mt-2 block text-xs text-muted-foreground">
                          {new Date(item.created_at).toLocaleString("fr-BE", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </span>
                      </span>
                      <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </button>
                ))
              ) : (
                <p className="rounded-2xl border p-5 text-center text-sm text-muted-foreground">
                  Aucune notification pour le moment.
                </p>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
