import { useCallback, useEffect, useState } from "react";
import { Info, Loader2 } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as supabaseClient } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { correctionMessage, type ActivityCorrection } from "@/lib/corrections";

const supabase = supabaseClient as unknown as SupabaseClient;

/** Message sur « Mes km » quand le staff a corrigé, refusé ou supprimé une sortie du scout. */
export function CorrectionNotice({ userId, onSeen }: { userId?: string; onSeen?: () => void }) {
  const [items, setItems] = useState<ActivityCorrection[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from("activity_corrections")
      .select("*")
      .eq("user_id", userId)
      .is("seen_at", null)
      .order("created_at", { ascending: false })
      .limit(10);
    setItems((data as ActivityCorrection[] | null) ?? []);
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  if (items.length === 0) return null;

  const dismiss = async () => {
    setBusy(true);
    await supabase.rpc("mark_corrections_seen");
    setBusy(false);
    setItems([]);
    onSeen?.();
  };

  return (
    <div
      role="status"
      className="rounded-2xl border border-sky-500/30 bg-sky-500/10 p-4 text-sm text-foreground shadow-sm"
    >
      <div className="flex items-start gap-3">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-sky-600 dark:text-sky-400" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <p className="font-bold">
            {items.length > 1
              ? "Le staff a revu certaines de tes sorties"
              : "Le staff a revu une de tes sorties"}
          </p>
          <ul className="space-y-1">
            {items.map((c) => (
              <li key={c.id}>{correctionMessage(c)}</li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Les km doivent correspondre à ta preuve (Strava ou photo). Une question ? Parles-en à un
            chef.
          </p>
          <Button size="sm" variant="outline" onClick={dismiss} disabled={busy} className="mt-1">
            {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
            J&apos;ai compris
          </Button>
        </div>
      </div>
    </div>
  );
}
