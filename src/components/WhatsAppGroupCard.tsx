import { useState } from "react";
import { MessageCircle, Pencil } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  isWhatsappInvite,
  useSaveWhatsappGroupLink,
  useWhatsappGroupLink,
} from "@/lib/plannedRides";
import { cn } from "@/lib/utils";

/**
 * « Rejoindre le groupe WhatsApp des sorties » : bouton pour les membres connectés,
 * champ de modification pour les admins. Le lien n'est jamais visible sans compte.
 */
export function WhatsAppGroupCard({
  userId,
  isAdmin,
  variant = "site",
}: {
  userId: string | undefined;
  isAdmin: boolean;
  variant?: "site" | "app";
}) {
  const app = variant === "app";
  const { data: url, isLoading } = useWhatsappGroupLink(!!userId);
  const save = useSaveWhatsappGroupLink(userId);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  if (isLoading) return null;
  if (!url && !isAdmin) return null;

  const startEdit = () => {
    setDraft(url ?? "");
    setEditing(true);
  };
  const submit = () => {
    const v = draft.trim();
    if (v && !isWhatsappInvite(v)) {
      toast.error("Colle le lien d'invitation WhatsApp (https://chat.whatsapp.com/…).");
      return;
    }
    save.mutate(v || null, {
      onSuccess: () => {
        toast.success(v ? "Lien du groupe enregistré" : "Lien du groupe retiré");
        setEditing(false);
      },
      onError: () => toast.error("Impossible d'enregistrer le lien."),
    });
  };

  return (
    <div
      className={cn(
        "border border-[#25D366]/40 bg-[#25D366]/10",
        app ? "rounded-3xl p-4" : "rounded-2xl p-4",
      )}
    >
      <div className={cn("flex gap-3", app ? "flex-col" : "flex-col sm:flex-row sm:items-center")}>
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#25D366] text-white shadow-sm">
            <MessageCircle className="h-6 w-6" />
          </span>
          <div className="min-w-0">
            <p className={cn("font-bold text-foreground", app ? "text-[16px]" : "text-sm")}>
              Groupe WhatsApp des sorties
            </p>
            <p className={cn("text-muted-foreground", app ? "text-[14px]" : "text-xs")}>
              {url
                ? "Pour papoter, s'organiser et être prévenu des sorties de dernière minute."
                : "Aucun lien pour l'instant. Colle le lien d'invitation du groupe pour l'afficher aux membres."}
            </p>
          </div>
        </div>
        {!editing && (
          <div className={cn("flex items-center gap-2", app && "w-full")}>
            {url && (
              <Button
                asChild
                className={cn(
                  "bg-[#1fa855] font-bold text-white hover:bg-[#1a9049]",
                  app && "h-12 flex-1 rounded-2xl text-[16px]",
                )}
              >
                <a href={url} target="_blank" rel="noopener noreferrer">
                  Rejoindre le groupe
                </a>
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                size={app ? "default" : "sm"}
                onClick={startEdit}
                className={cn(app && "h-12 rounded-2xl")}
                aria-label="Modifier le lien du groupe WhatsApp"
              >
                <Pencil className="h-4 w-4" />
                {!url && <span className="ml-1.5">Ajouter le lien</span>}
              </Button>
            )}
          </div>
        )}
      </div>

      {editing && (
        <div className="mt-3 space-y-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            placeholder="https://chat.whatsapp.com/…"
            aria-label="Lien d'invitation du groupe WhatsApp"
            inputMode="url"
            className={cn(app && "h-12 rounded-2xl text-[16px]")}
          />
          <p className="text-xs text-muted-foreground">
            Dans WhatsApp : infos du groupe → « Inviter via un lien » → Copier. Visible uniquement
            par les membres connectés. Laisse vide pour retirer le bouton.
          </p>
          <div className="flex gap-2">
            <Button onClick={submit} disabled={save.isPending} className="font-bold">
              Enregistrer
            </Button>
            <Button variant="ghost" onClick={() => setEditing(false)} disabled={save.isPending}>
              Annuler
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
