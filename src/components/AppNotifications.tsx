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
  const [items, setItems] = useState<AppNotification[]>([]);
  const [pushEnabled, setPushEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const unread = items.filter((item) => !item.read_at).length;

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
        if (subscription) {
          await supabase.functions.invoke("app-notifications", {
            body: { action: "subscribe", subscription: subscription.toJSON() },
          });
        }
      })
      .catch(() => setPushEnabled(false));
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
      setMessage("Les notifications sont activées sur cet appareil.");
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
      setMessage("Les notifications sont désactivées sur cet appareil.");
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
      <Button
        type="button"
        size="icon"
        variant="secondary"
        aria-label={`Notifications${unread ? `, ${unread} non lue(s)` : ""}`}
        className="fixed right-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[60] h-11 w-11 rounded-full border bg-card shadow-lg"
        onClick={() => {
          setOpen(true);
          setMessage("");
        }}
      >
        {unread ? <BellRing className="h-5 w-5" /> : <Bell className="h-5 w-5" />}
        {unread > 0 && (
          <Badge className="absolute -right-1 -top-1 h-5 min-w-5 justify-center rounded-full px-1 text-[10px]">
            {unread > 9 ? "9+" : unread}
          </Badge>
        )}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-hidden p-0 sm:max-w-lg">
          <DialogHeader className="border-b p-5 pr-12 text-left">
            <div className="flex items-center justify-between gap-3">
              <DialogTitle className="font-display text-xl font-black">Notifications</DialogTitle>
              {unread > 0 && (
                <Button type="button" variant="ghost" size="sm" onClick={() => void markAllRead()}>
                  <CheckCheck className="h-4 w-4" /> Tout lire
                </Button>
              )}
            </div>
            <DialogDescription>
              Rappels hebdomadaires, paliers de kilomètres et messages du staff.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 overflow-y-auto px-4 pb-5">
            <div className="rounded-2xl border bg-muted/40 p-4">
              <div className="flex items-center gap-2 font-semibold">
                <BellRing className="h-4 w-4 text-primary" /> Notifications push
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                Reçois les rappels et les nouveautés même lorsque l’application est fermée.
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
                    className={`w-full rounded-2xl border p-4 text-left transition-colors hover:bg-muted/50 ${item.read_at ? "bg-card" : "border-primary/30 bg-primary/5"}`}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${item.read_at ? "bg-muted-foreground/30" : "bg-primary"}`}
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
