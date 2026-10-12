import { useCallback, useEffect, useState } from "react";
import { Award, Send, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

type Scout = { id: string; full_name: string | null; totem: string | null };
type Challenge = { id: string; title: string; description: string | null; proposed_points: number; awarded_points: number | null; status: string; challenger_id: string; challenged_id: string };
type Rank = { user_id: string; display_name: string; patrol_name: string | null; points: number; challenges_won: number };
const statusText: Record<string, string> = { open: "À réaliser", submitted: "À valider par le staff", approved: "Validé", rejected: "Refusé" };

export function ChallengesPanel() {
  const { user } = useAuth();
  const [scouts, setScouts] = useState<Scout[]>([]);
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [ranking, setRanking] = useState<Rank[]>([]);
  const [target, setTarget] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [points, setPoints] = useState("5");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const [{ data: profiles }, { data: mine }, { data: ranks }] = await Promise.all([
      supabase.from("profiles_public").select("id,full_name,totem").order("full_name"),
      user ? (supabase as any).from("scout_challenges").select("*").or(`challenger_id.eq.${user.id},challenged_id.eq.${user.id}`).order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
      (supabase as any).rpc("scout_challenge_leaderboard"),
    ]);
    setScouts((profiles || []).filter((p): p is Scout => !!p.id));
    setChallenges((mine || []) as Challenge[]);
    setRanking((ranks || []) as Rank[]);
  }, [user]);
  const scoutName = (id: string) => { const scout = scouts.find((s) => s.id === id); return scout?.totem || scout?.full_name || "Scout"; };
  useEffect(() => { void load(); }, [load]);
  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !target || !title.trim()) return;
    const n = Number(points);
    if (!Number.isInteger(n) || n < 1 || n > 1000) { toast.error("Les points doivent être entre 1 et 1000."); return; }
    setBusy(true);
    const { error } = await (supabase as any).from("scout_challenges").insert({ challenger_id: user.id, challenged_id: target, title: title.trim(), description: description.trim() || null, proposed_points: n });
    setBusy(false);
    if (error) { toast.error("Impossible de lancer ce défi."); return; }
    toast.success("Défi lancé !"); setTitle(""); setDescription(""); setPoints("5"); setTarget(""); await load();
  };
  return <div className="grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
    <Card><CardHeader><CardTitle className="flex items-center gap-2"><Trophy className="h-5 w-5 text-amber-500"/>Classement des défis</CardTitle></CardHeader><CardContent className="space-y-2">
      {!ranking.length && <p className="text-sm text-muted-foreground">Les points apparaîtront après validation des premiers défis.</p>}
      {ranking.map((r,i)=><div key={r.user_id} className="flex items-center justify-between rounded-xl border p-3"><span className="font-semibold">{i+1}. {r.display_name}<span className="ml-2 text-xs text-muted-foreground">{r.patrol_name}</span></span><span className="font-bold text-amber-600">{r.points} pts</span></div>)}
      {user && <div className="mt-6 border-t pt-4"><h3 className="mb-3 font-bold">Mes défis</h3>{challenges.length ? challenges.map(c=><div key={c.id} className="mb-2 rounded-xl bg-muted/50 p-3"><div className="font-semibold">{c.title} <span className="text-xs text-muted-foreground">· {statusText[c.status] || c.status}</span></div><p className="text-xs text-muted-foreground">{c.challenger_id === user.id ? `Lancé à ${scoutName(c.challenged_id)}` : `Lancé par ${scoutName(c.challenger_id)}`}</p><p className="text-sm text-muted-foreground">{c.proposed_points} pts proposés{c.awarded_points !== null ? ` · ${c.awarded_points} pts attribués` : ""}</p>{c.description && <p className="text-sm">{c.description}</p>}</div>):<p className="text-sm text-muted-foreground">Aucun défi pour le moment.</p>}</div>}
    </CardContent></Card>
    {user && <Card><CardHeader><CardTitle className="flex items-center gap-2"><Send className="h-5 w-5"/>Lancer un défi</CardTitle></CardHeader><CardContent><form className="space-y-4" onSubmit={create}>
      <div className="space-y-2"><Label>À quel scout ?</Label><Select value={target} onValueChange={setTarget}><SelectTrigger><SelectValue placeholder="Choisir un scout"/></SelectTrigger><SelectContent>{scouts.filter(s=>s.id!==user.id).map(s=><SelectItem key={s.id} value={s.id}>{s.totem || s.full_name || "Scout"}</SelectItem>)}</SelectContent></Select></div>
      <div className="space-y-2"><Label>Défi</Label><Input value={title} onChange={e=>setTitle(e.target.value)} maxLength={120} placeholder="Ex. Rouler 20 km avec 300 m D+" required/></div>
      <div className="space-y-2"><Label>Détails (facultatif)</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} rows={3}/></div>
      <div className="space-y-2"><Label>Points proposés</Label><Input type="number" min={1} max={1000} step={1} value={points} onChange={e=>setPoints(e.target.value)} required/></div>
      <Button type="submit" disabled={!target || !title.trim() || busy} className="w-full"><Award className="mr-2 h-4 w-4"/>Lancer le défi</Button>
    </form></CardContent></Card>}
  </div>;
}
