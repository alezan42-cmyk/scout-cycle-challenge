import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, CalendarClock, Gauge, Send, Trash2, Users, Smartphone } from "lucide-react";
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
  individual_distance_enabled: boolean;
  individual_distance_interval_km: number;
  individual_distance_title: string;
  individual_distance_body: string;
  weekly_enabled: boolean;
  weekly_hour: number;
  weekly_title: string;
  weekly_body: string;
};
type AppStatus = Scout & {
  app_used: boolean;
  device_count: number;
  platforms: string[];
  last_seen_at: string | null;
  notifications_enabled: boolean;
  push_device_count: number;
};
const DEFAULT_SETTINGS: NotificationSettings = {
  distance_enabled: true,
  distance_interval_km: 1000,
  distance_title: "Nouveau palier !",
  distance_body: "Tu viens de franchir le palier des {km} km cumulés. Bravo !",
  individual_distance_enabled: true,
  individual_distance_interval_km: 100,
  individual_distance_title: "Beau palier !",
  individual_distance_body: "Tu as parcouru {km} km au total. Continue comme ça !",
  weekly_enabled: true,
  weekly_hour: 9,
  weekly_title: "Pense à tes kilomètres !",
  weekly_body: "Pense à enregistrer tes kms de la semaine.",
};
const displayName = (scout?: Scout) => scout?.totem || scout?.full_name || "Scout";
const notificationType: Record<string, string> = {
  manual: "Message du staff",
  distance_milestone: "Palier de kilomètres",
  individual_distance_milestone: "Palier individuel",
  troop_distance_milestone: "Palier de la troupe",
  aquila_distance_milestone: "Palier scout (Aquila)",
  activity_pending: "Sortie à valider (Aquila)",
  weekly_reminder: "Rappel du dimanche",
  new_signup: "Nouvelle inscription",
};

export function AdminAppNotifications() {
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [appStatus, setAppStatus] = useState<AppStatus[]>([]);
  const [statusLoading, setStatusLoading] = useState(true);
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
          "distance_enabled,distance_interval_km,distance_title,distance_body,individual_distance_enabled,individual_distance_interval_km,individual_distance_title,individual_distance_body,weekly_enabled,weekly_hour,weekly_title,weekly_body",
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
    const { data: statusData, error: statusError } = await supabase.functions.invoke(
      "app-notifications",
      { body: { action: "admin-status" } },
    );
    if (statusError || statusData?.error)
      toast.error("Impossible de charger l’état de l’application.");
    setAppStatus((statusData?.scouts ?? []) as AppStatus[]);
    setStatusLoading(false);
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
              Configure les paliers de la troupe et des scouts, puis le rappel du dimanche.
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
                <span>Palier collectif de la troupe</span>
              </label>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="notification-distance-interval">
                    Notifier la troupe tous les … km
                  </Label>
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

            <div className="rounded-2xl border bg-muted/20 p-5 sm:p-6">
              <div className="mb-4">
                <h3 className="font-semibold">Palier individuel</h3>
                <p className="text-sm text-muted-foreground">
                  Chaque scout reçoit une notification quand il franchit son prochain total
                  personnel.
                </p>
              </div>
              <label className="flex cursor-pointer items-center gap-3 font-semibold">
                <input
                  type="checkbox"
                  checked={settings.individual_distance_enabled}
                  onChange={(event) =>
                    setSettings({ ...settings, individual_distance_enabled: event.target.checked })
                  }
                />
                <span>Activer les paliers individuels</span>
              </label>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="notification-individual-interval">
                    Notifier tous les … km par scout
                  </Label>
                  <Input
                    id="notification-individual-interval"
                    type="number"
                    min={1}
                    max={100000}
                    required
                    value={settings.individual_distance_interval_km}
                    onChange={(event) =>
                      setSettings({
                        ...settings,
                        individual_distance_interval_km: Number(event.target.value),
                      })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notification-individual-title">Titre</Label>
                  <Input
                    id="notification-individual-title"
                    maxLength={100}
                    required
                    value={settings.individual_distance_title}
                    onChange={(event) =>
                      setSettings({ ...settings, individual_distance_title: event.target.value })
                    }
                  />
                </div>
                <div className="space-y-2 sm:col-span-2">
                  <Label htmlFor="notification-individual-body">Message</Label>
                  <Textarea
                    id="notification-individual-body"
                    maxLength={300}
                    required
                    value={settings.individual_distance_body}
                    onChange={(event) =>
                      setSettings({ ...settings, individual_distance_body: event.target.value })
                    }
                  />
                  <p className="text-xs text-muted-foreground">
                    Utilise <code>{"{km}"}</code> pour afficher le palier atteint.
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

      <section className="rounded-2xl border bg-card p-5 sm:p-7">
        <div className="mb-5 flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </span>
          <div>
            <h2 className="font-display text-lg font-bold">
              Application et notifications des scouts
            </h2>
            <p className="text-sm text-muted-foreground">
              L’application est comptée après une première ouverture installée. Les notifications
              sont indiquées par appareil.
            </p>
          </div>
        </div>
        {statusLoading ? (
          <p className="text-sm text-muted-foreground">Chargement…</p>
        ) : (
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full min-w-[640px] text-left text-sm">
              <thead className="bg-muted/50 text-muted-foreground">
                <tr>
                  <th className="p-3 font-medium">Scout</th>
                  <th className="p-3 font-medium">Application</th>
                  <th className="p-3 font-medium">Notifications</th>
                  <th className="p-3 font-medium">Dernière ouverture</th>
                </tr>
              </thead>
              <tbody>
                {appStatus.map((scout) => (
                  <tr key={scout.id} className="border-t">
                    <td className="p-3 font-medium">{displayName(scout)}</td>
                    <td className="p-3">
                      {scout.app_used
                        ? `Utilisée · ${scout.device_count} appareil${scout.device_count > 1 ? "s" : ""}`
                        : "Pas encore détectée"}
                    </td>
                    <td className="p-3">
                      {scout.notifications_enabled
                        ? `Activées · ${scout.push_device_count} appareil${scout.push_device_count > 1 ? "s" : ""}`
                        : "Désactivées"}
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {scout.last_seen_at
                        ? new Date(scout.last_seen_at).toLocaleDateString("fr-BE")
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
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
