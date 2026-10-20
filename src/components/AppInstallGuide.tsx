import { useEffect, useState } from "react";
import { Download, Smartphone, X } from "lucide-react";
import { useAuth } from "@/lib/useAuth";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function AppInstallGuide() {
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [open, setOpen] = useState(false);
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const isStandalone =
    typeof window !== "undefined" &&
    (window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true);

  useEffect(() => {
    const handlePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handlePrompt);
    return () => window.removeEventListener("beforeinstallprompt", handlePrompt);
  }, []);

  useEffect(() => {
    if (!user?.id || isStandalone) {
      setVisible(false);
      return;
    }
    try {
      const dismissed = Number(localStorage.getItem(`app-install-guide-dismissed:${user.id}`) ?? 0);
      setVisible(!dismissed || Date.now() - dismissed > 30 * 24 * 60 * 60 * 1000);
    } catch {
      setVisible(true);
    }
  }, [isStandalone, user?.id]);

  const dismiss = () => {
    if (user?.id) {
      try {
        localStorage.setItem(`app-install-guide-dismissed:${user.id}`, String(Date.now()));
      } catch {
        // L’invitation reste masquée jusqu’au prochain chargement.
      }
    }
    setVisible(false);
    setOpen(false);
  };

  const install = async () => {
    if (!installPrompt) {
      setOpen(true);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") dismiss();
  };

  if (!visible || !user) return null;
  return (
    <>
      <aside className="fixed bottom-4 left-4 z-40 w-[min(22rem,calc(100vw-2rem))] rounded-2xl border bg-card p-4 shadow-xl sm:bottom-6 sm:left-6">
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Smartphone className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <p className="font-semibold">Emporte Alezan 42 avec toi</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Ajoute l’application à ton écran d’accueil pour la retrouver facilement.
            </p>
          </div>
          <button
            type="button"
            aria-label="Fermer"
            onClick={dismiss}
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <Button className="mt-3 w-full" onClick={() => void install()}>
          <Download className="h-4 w-4" />
          Installer / voir le guide
        </Button>
      </aside>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader className="text-left">
            <DialogTitle className="font-display text-xl font-black">
              Installer l’application Alezan 42
            </DialogTitle>
            <DialogDescription>
              Gratuite, sans passer par l’App Store ou le Play Store. Connecte-toi avec le même
              compte : tes données restent synchronisées avec le site.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <section className="rounded-xl border p-4">
              <h3 className="font-semibold">iPhone ou iPad</h3>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                <li>Ouvre le site dans Safari.</li>
                <li>Appuie sur le bouton Partager.</li>
                <li>Choisis « Sur l’écran d’accueil », puis « Ajouter ».</li>
                <li>Ouvre l’icône Alezan 42 et connecte-toi.</li>
              </ol>
              <p className="mt-2 text-xs text-muted-foreground">
                Pour les notifications push sur iPhone, ouvre ensuite l’application installée et
                active-les depuis son bouton Notifications.
              </p>
            </section>
            <section className="rounded-xl border p-4">
              <h3 className="font-semibold">Android</h3>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                <li>Ouvre le site dans Chrome.</li>
                <li>
                  Appuie sur « Installer l’application » ou sur ⋮ puis « Ajouter à l’écran d’accueil
                  ».
                </li>
                <li>Confirme, ouvre l’icône et connecte-toi.</li>
              </ol>
            </section>
            <section className="rounded-xl border p-4">
              <h3 className="font-semibold">Ordinateur</h3>
              <ol className="mt-2 list-inside list-decimal space-y-1 text-muted-foreground">
                <li>Ouvre le site dans Chrome ou Edge.</li>
                <li>
                  Utilise l’icône d’installation dans la barre d’adresse, ou le menu du navigateur
                  puis « Installer Alezan 42 ».
                </li>
              </ol>
            </section>
            <p className="text-xs text-muted-foreground">
              L’application est une version installable du site. Les mises à jour arrivent
              automatiquement.
            </p>
          </div>
          <div className="flex justify-end">
            <Button variant="outline" onClick={dismiss}>
              Compris
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
