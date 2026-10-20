import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, CalendarClock, Gauge, Send, Trash2, Users } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type Scout = { id: string; full_name: string | null; totem: string | null };
type AdminNotification = {
  id: string;
  user_id: string;
  title: string;
  body: string;
  created_at: string;
  kind: string;
};
type NotificationSettings = {
  distance_enabled: boolean;
  distance_interval_km: number;
  distance_title: string;
  distance_body: string;
  weekly_enabled: boolean;
  weekly_hour: number;
  weekly_title: string;
  weekly_body: string;
};
const DEFAULT_SETTINGS: NotificationSettings = {
  distance_enabled: true,
  distance_interval_km: 1000,
  distance_title: "Nouveau palier !",
  distance_body: "Tu viens de franchir le palier des {km} km cumulés. Bravo !",
  weekly_enabled: true,
  weekly_hour: 9,
  weekly_title: "Pense à tes kilomètres !",
  weekly_body: "Pense à enregistrer tes kms de la semaine.",
};
const displayName = (scout?: Scout) => scout?.totem || scout?.full_name || "Scout";
const notificationType: Record<string, string> = {
  manual: "Message du staff",
  distance_milestone: "Palier de kilomètres",
  weekly_reminder: "Rappel du dimanche",
  new_signup: "Nouvelle inscription",
};

export function AdminAppNotifications() {
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const scoutById = useMemo(() => new Map(scouts.map((scout) => [scout.id, scout])), [scouts]);

  const load = useCallback(async () => {
    const [profileResult, notificationResult, settingsResult] = await Promise.all([
      supabase.from("profiles_public").select("id,full_name,totem").order("full_name"),
      supabase
        .from("app_notifications")
        .select("id,user_id,title,body,created_at,kind")
        .order("created_at", { ascending: false })
        .limit(200),
      supabase
        .from("app_notification_settings")
        .select(
          "distance_enabled,distance_interval_km,distance_title,distance_body,weekly_enabled,weekly_hour,weekly_title,weekly_body",
        )
        .eq("singleton", true)
        .maybeSingle(),
    ]);
    if (profileResult.error) toast.error("Impossible de charger les scouts.");
    if (notificationResult.error) toast.error("Impossible de charger les notifications.");
    if (settingsResult.error) toast.error("Impossible de charger les réglages automatiques.");
    setScouts((profileResult.data ?? []).filter((scout) => scout.id) as Scout[]);
    setNotifications((notificationResult.data ?? []) as AdminNotification[]);
    if (settingsResult.data) setSettings(settingsResult.data as NotificationSettings);
    setSettingsLoading(false);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  const visibleScouts = scouts.filter((scout) =>
    displayName(scout).toLocaleLowerCase("fr").includes(search.toLocaleLowerCase("fr")),
  );
  const allSelected = scouts.length > 0 && selected.length === scouts.length;
  const toggleAll = () => setSelected(allSelected ? [] : scouts.map((scout) => scout.id));
  const toggleScout = (id: string) =>
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );

  const saveSettings = async (event: FormEvent) => {
    event.preventDefault();
    setSettingsSaving(true);
    const { error } = await supabase
      .from("app_notification_settings")
      .update({ ...settings, updated_at: new Date().toISOString() })
      .eq("singleton", true);
    setSettingsSaving(false);
    if (error) toast.error("Impossible d’enregistrer les réglages : " + error.message);
    else toast.success("Réglages des notifications enregistrés.");
  };

  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim() || !body.trim() || !selected.length) {
      toast.error("Choisis un titre, un message et au moins un destinataire.");
      return;
    }
    setLoading(true);
    const { error } = await supabase.from("app_notifications").insert(
      selected.map((user_id) => ({
        user_id,
        kind: "manual",
        title: title.trim(),
        body: body.trim(),
        href: "/",
      })),
    );
    setLoading(false);
    if (error) {
      toast.error("Impossible de créer la notification : " + error.message);
      return;
    }
    toast.success(
      `Notification envoyée à ${selected.length} scout${selected.length > 1 ? "s" : ""}. Le push arrivera dans les instants qui suivent.`,
    );
    setTitle("");
    setBody("");
    setSelected([]);
    await load();
  };

  const remove = async (item: AdminNotification) => {
    const { error } = await supabase.from("app_notifications").delete().eq("id", item.id);
    if (error) toast.error("Suppression impossible : " + error.message);
    else {
      toast.success("Notification supprimée de l’historique.");
      setNotifications((current) => current.filter((entry) => entry.id !== item.id));
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border bg-card p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Gauge className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">
              Réglages des notifications automatiques
            </h2>
            <p className="text-sm text-muted-foreground">
              Choisis les paliers, le contenu et l’horaire du rappel hebdomadaire.
            </p>
          </div>
        </div>
        {settingsLoading ? (
          <p className="text-sm text-muted-foreground">Chargement des réglages…</p>
        ) : (
          <form onSubmit={(event) => void saveSettings(event)} className="space-y-6">
            <div className="rounded-xl border p-4">
              <label className="flex cursor-pointer items-center gap-3 font-semibold">
                <input
                  type="checkbox"
                  checked={settings.distance_enabled}
                  onChange={(event) =>
                    setSettings({ ...settings, distance_enabled: event.target.checked })
                  }
                />
                <span>Paliers de kilomètres</span>
              </label>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="notification-distance-interval">Notifier tous les … km</Label>
                  <Input
                    id="notification-distance-interval"
                    type="number"
                    min={1}
                    max={100000}
                    required
                    value={settings.distance_interval_km}
                    onChange={(event) =>
                      setSettings({ ...settings, distance_interval_km: Number(event.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notification-distance-title">Titre</Label>
                  <Input
                    id="notification-distance-title"
                    maxLength={100}
                    required
                    value={settings.distance_title}
                    onChange={(event) =>
                      setSettings({ ...settings, distance_title: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="notification-distance-body">Message</Label>
                  <Textarea
                    id="notification-distance-body"
                    maxLength={300}
                    required
                    value={settings.distance_body}
                    onChange={(event) =>
                      setSettings({ ...settings, distance_body: event.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilise <code>{"{km}"}</code> pour insérer automatiquement le palier atteint.
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-xl border p-4">
              <label className="flex cursor-pointer items-center gap-3 font-semibold">
                <input
                  type="checkbox"
                  checked={settings.weekly_enabled}
                  onChange={(event) =>
                    setSettings({ ...settings, weekly_enabled: event.target.checked })
                  }
                />
                <CalendarClock className="h-4 w-4 text-primary" />
                <span>Rappel du dimanche</span>
              </label>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="notification-weekly-hour">Heure (Bruxelles)</Label>
                  <Input
                    id="notification-weekly-hour"
                    type="number"
                    min={0}
                    max={23}
                    required
                    value={settings.weekly_hour}
                    onChange={(event) =>
                      setSettings({ ...settings, weekly_hour: Number(event.target.value) })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notification-weekly-title">Titre</Label>
                  <Input
                    id="notification-weekly-title"
                    maxLength={100}
                    required
                    value={settings.weekly_title}
                    onChange={(event) =>
                      setSettings({ ...settings, weekly_title: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="notification-weekly-body">Message</Label>
                  <Textarea
                    id="notification-weekly-body"
                    maxLength={300}
                    required
                    value={settings.weekly_body}
                    onChange={(event) =>
                      setSettings({ ...settings, weekly_body: event.target.value })
                    }
                  />
                </div>
              </div>
            </div>
            <Button type="submit" disabled={settingsSaving}>
              {settingsSaving ? "Enregistrement…" : "Enregistrer les réglages"}
            </Button>
          </form>
        )}
      </section>

      <section className="rounded-2xl border bg-card p-4 sm:p-6">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary">
            <Bell className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">Envoyer une notification</h2>
            <p className="text-sm text-muted-foreground">
              Envoi immédiat dans l’application et en push sur les appareils activés.
            </p>
          </div>
        </div>
        <form onSubmit={(event) => void create(event)} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="app-notification-title">Titre</Label>
            <Input
              id="app-notification-title"
              value={title}
              maxLength={100}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Ex. Petit rappel"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="app-notification-body">Message</Label>
            <Textarea
              id="app-notification-body"
              value={body}
              maxLength={300}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Écris le message à envoyer…"
            />
          </div>
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>Destinataires ({selected.length})</Label>
              <Button type="button" variant="outline" size="sm" onClick={toggleAll}>
                <Users className="h-4 w-4" />
                {allSelected ? "Désélectionner tout" : "Sélectionner tout"}
              </Button>
            </div>
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher un scout"
              aria-label="Rechercher un scout"
            />
            <div className="grid max-h-56 gap-1 overflow-y-auto rounded-xl border p-2 sm:grid-cols-2">
              {visibleScouts.map((scout) => (
                <label
                  key={scout.id}
                  className="flex min-h-10 cursor-pointer items-center gap-2 rounded-lg px-2 text-sm hover:bg-muted"
                >
                  <input
                    type="checkbox"
                    checked={selected.includes(scout.id)}
                    onChange={() => toggleScout(scout.id)}
                  />
                  <span className="truncate">{displayName(scout)}</span>
                </label>
              ))}
              {!visibleScouts.length && (
                <p className="p-3 text-sm text-muted-foreground">Aucun scout trouvé.</p>
              )}
            </div>
          </div>
          <Button type="submit" disabled={loading || !selected.length}>
            <Send className="h-4 w-4" />
            {loading ? "Envoi…" : "Envoyer la notification"}
          </Button>
        </form>
      </section>
      <section className="space-y-3">
        <div>
          <h2 className="font-display text-lg font-bold">Historique des notifications récentes</h2>
          <p className="text-sm text-muted-foreground">
            Les rappels du dimanche, les paliers, les inscriptions et les messages envoyés par le
            staff. Supprimer une notification l’enlève du centre de l’application ; un push déjà
            reçu ne peut pas être retiré du téléphone.
          </p>
        </div>
        {notifications.length ? (
          notifications.map((item) => (
            <article key={item.id} className="flex items-start gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {item.title}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    · {notificationType[item.kind] ?? "Notification"} ·{" "}
                    {displayName(scoutById.get(item.user_id))}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">{item.body}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {new Date(item.created_at).toLocaleString("fr-BE", {
                    dateStyle: "short",
                    timeStyle: "short",
                  })}
                </p>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                aria-label="Supprimer cette notification"
                onClick={() => void remove(item)}
              >
                <Trash2 className="h-4 w-4 text-destructive" />
              </Button>
            </article>
          ))
        ) : (
          <p className="rounded-xl border p-4 text-sm text-muted-foreground">
            Aucune notification récente.
          </p>
        )}
      </section>
    </div>
  );
}
