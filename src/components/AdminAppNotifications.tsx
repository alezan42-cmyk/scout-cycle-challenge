import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Bell, Send, Trash2, Users } from "lucide-react";
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
};
const displayName = (scout?: Scout) => scout?.totem || scout?.full_name || "Scout";

export function AdminAppNotifications() {
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [notifications, setNotifications] = useState<AdminNotification[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(false);
  const scoutById = useMemo(() => new Map(scouts.map((scout) => [scout.id, scout])), [scouts]);

  const load = useCallback(async () => {
    const [profileResult, notificationResult] = await Promise.all([
      supabase.from("profiles_public").select("id,full_name,totem").order("full_name"),
      supabase
        .from("app_notifications")
        .select("id,user_id,title,body,created_at")
        .eq("kind", "manual")
        .order("created_at", { ascending: false })
        .limit(100),
    ]);
    if (profileResult.error) toast.error("Impossible de charger les scouts.");
    if (notificationResult.error) toast.error("Impossible de charger les notifications.");
    setScouts((profileResult.data ?? []).filter((scout) => scout.id) as Scout[]);
    setNotifications((notificationResult.data ?? []) as AdminNotification[]);
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
          <h2 className="font-display text-lg font-bold">Notifications manuelles récentes</h2>
          <p className="text-sm text-muted-foreground">
            Supprimer une notification l’enlève du centre de l’application. Une notification push
            déjà reçue ne peut pas être retirée de l’écran du téléphone.
          </p>
        </div>
        {notifications.length ? (
          notifications.map((item) => (
            <article key={item.id} className="flex items-start gap-3 rounded-xl border bg-card p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold">
                  {item.title}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    → {displayName(scoutById.get(item.user_id))}
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
            Aucune notification manuelle.
          </p>
        )}
      </section>
    </div>
  );
}
