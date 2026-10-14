import { useCallback, useEffect, useState } from "react";
import { BellRing, ChevronDown, Loader2, Send, X } from "lucide-react";
import { toast } from "sonner";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

const supabase = supabaseClient as unknown as SupabaseClient;

type Settings = {
  enabled: boolean;
  threshold: number;
  emails: string[];
  cooldown_hours: number;
  last_sent_at: string | null;
  last_count: number | null;
};

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const COOLDOWNS = [
  { h: 6, label: "6 h" },
  { h: 12, label: "12 h" },
  { h: 24, label: "1 jour" },
  { h: 72, label: "3 jours" },
];

/** Réglage de l'alerte e-mail « trop de sorties en attente » (onglet Sorties). */
export function PendingAlertAdmin() {
  const [s, setS] = useState<Settings | null>(null);
  const [open, setOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [dirty, setDirty] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase.from("alert_settings").select("*").eq("id", true).maybeSingle();
    if (data) setS(data as Settings);
  }, []);
  useEffect(() => {
    void load();
  }, [load]);

  if (!s) return null;

  const change = (patch: Partial<Settings>) => {
    setS({ ...s, ...patch });
    setDirty(true);
  };

  const addEmail = () => {
    const e = newEmail.trim().toLowerCase();
    if (!e) return;
    if (!EMAIL_RE.test(e)) return toast.error("Adresse e-mail invalide");
    if (s.emails.includes(e)) return setNewEmail("");
    if (s.emails.length >= 10) return toast.error("10 adresses maximum");
    change({ emails: [...s.emails, e] });
    setNewEmail("");
  };

  const save = async () => {
    if (s.enabled && s.emails.length === 0) {
      toast.error("Ajoute au moins une adresse e-mail");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("alert_settings")
      .update({
        enabled: s.enabled,
        threshold: s.threshold,
        emails: s.emails,
        cooldown_hours: s.cooldown_hours,
        updated_at: new Date().toISOString(),
      })
      .eq("id", true);
    setSaving(false);
    if (error) {
      toast.error("Erreur : " + error.message);
      return;
    }
    setDirty(false);
    toast.success(s.enabled ? "Alerte e-mail enregistrée" : "Alerte e-mail désactivée");
  };

  const sendTest = async () => {
    if (dirty) await save();
    setTesting(true);
    try {
      const { data, error } = await supabase.functions.invoke("alerte-attente", {
        body: { test: true },
      });
      if (error) throw error;
      const r = data as {
        envoye?: boolean;
        erreur?: string;
        raison?: string;
        destinataires?: number;
      };
      if (r.envoye) toast.success(`E-mail de test envoyé à ${r.destinataires} adresse(s)`);
      else toast.error(r.erreur ?? r.raison ?? "Envoi impossible");
    } catch (e) {
      toast.error("Envoi impossible : " + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="rounded-2xl border border-border/80 bg-card shadow-sm">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between gap-3 p-4 text-left"
        aria-expanded={open}
      >
        <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <BellRing
            className={cn("h-4 w-4", s.enabled ? "text-primary" : "text-muted-foreground")}
          />
          <span className="whitespace-nowrap text-sm font-bold text-foreground">Alerte e-mail</span>
          <span className="text-xs text-muted-foreground">
            {s.enabled
              ? `plus de ${s.threshold} en attente → ${s.emails.length} destinataire${s.emails.length > 1 ? "s" : ""}`
              : "désactivée"}
          </span>
        </span>
        <ChevronDown className={cn("h-4 w-4 transition-transform", open && "rotate-180")} />
      </button>

      {open && (
        <div className="space-y-4 border-t p-4">
          <label className="flex items-center justify-between gap-3">
            <span className="text-sm font-semibold text-foreground">Activer l&apos;alerte</span>
            <Switch checked={s.enabled} onCheckedChange={(v) => change({ enabled: v })} />
          </label>

          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span>Prévenir quand plus de</span>
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              value={s.threshold}
              onChange={(e) =>
                change({ threshold: Math.max(1, Math.min(500, Number(e.target.value) || 1)) })
              }
              className="h-9 w-20 text-center"
              aria-label="Seuil de sorties en attente"
            />
            <span>sorties attendent une validation.</span>
          </div>

          <div className="space-y-2">
            <span className="text-sm font-semibold text-foreground">Destinataires</span>
            {s.emails.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {s.emails.map((e) => (
                  <span
                    key={e}
                    className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-primary"
                  >
                    {e}
                    <button
                      type="button"
                      aria-label={`Retirer ${e}`}
                      onClick={() => change({ emails: s.emails.filter((x) => x !== e) })}
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            )}
            <form
              className="flex gap-2"
              onSubmit={(ev) => {
                ev.preventDefault();
                addEmail();
              }}
            >
              <Input
                type="email"
                placeholder="chef@exemple.be"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="h-10 flex-1 sm:h-9"
              />
              <Button type="submit" variant="outline" className="h-10 sm:h-9">
                Ajouter
              </Button>
            </form>
          </div>

          <div className="flex flex-wrap items-center gap-2 text-sm text-foreground">
            <span>Pas plus d&apos;un e-mail toutes les</span>
            <div className="flex rounded-lg border bg-muted/40 p-0.5 text-xs">
              {COOLDOWNS.map((c) => (
                <button
                  key={c.h}
                  type="button"
                  onClick={() => change({ cooldown_hours: c.h })}
                  className={cn(
                    "rounded-md px-2.5 py-1 font-semibold",
                    s.cooldown_hours === c.h
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {s.last_sent_at && (
            <p className="text-xs text-muted-foreground">
              Dernière alerte :{" "}
              {new Date(s.last_sent_at).toLocaleString("fr-BE", {
                dateStyle: "short",
                timeStyle: "short",
              })}
              {s.last_count ? ` (${s.last_count} sorties en attente)` : ""}
            </p>
          )}

          <div className="grid grid-cols-2 gap-2 sm:flex">
            <Button onClick={save} disabled={saving || !dirty}>
              {saving && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Enregistrer
            </Button>
            <Button
              variant="outline"
              onClick={sendTest}
              disabled={testing || s.emails.length === 0}
            >
              {testing ? (
                <Loader2 className="mr-1 h-4 w-4 animate-spin" />
              ) : (
                <Send className="mr-1 h-4 w-4" />
              )}
              E-mail de test
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
