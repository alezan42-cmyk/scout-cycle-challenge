import { useEffect, useState } from "react";
import { Download, Share, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    setInstalled(standalone);

    const capturePrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const markInstalled = () => setInstalled(true);
    window.addEventListener("beforeinstallprompt", capturePrompt);
    window.addEventListener("appinstalled", markInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", capturePrompt);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const install = async () => {
    if (!installPrompt) {
      setHelpOpen(true);
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  };

  if (installed) return null;

  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        onClick={() => void install()}
        title="Installer ALEZAN 42 sur ce téléphone"
        aria-label="Installer ALEZAN 42 sur ce téléphone"
        className="h-9 gap-1.5 rounded-lg px-2.5 text-white/90 hover:bg-white/15 hover:text-white"
      >
        <Download className="h-4 w-4" />
        <span className="hidden sm:inline">Installer</span>
      </Button>

      <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Smartphone className="h-5 w-5 text-primary" /> Ajouter ALEZAN 42 au téléphone
            </DialogTitle>
            <DialogDescription>
              L’application utilise le même compte et les mêmes données que le site.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 text-sm">
            <section className="rounded-xl border p-3">
              <h3 className="font-bold">iPhone ou iPad</h3>
              <p className="mt-1 text-muted-foreground">
                Ouvre ce site dans Safari, touche{" "}
                <Share className="inline h-4 w-4 align-text-bottom" /> Partager, puis « Sur l’écran
                d’accueil ». Active « Ouvrir comme app web » si l’option apparaît, puis touche «
                Ajouter ».
              </p>
            </section>
            <section className="rounded-xl border p-3">
              <h3 className="font-bold">Android</h3>
              <p className="mt-1 text-muted-foreground">
                Dans Chrome, touche le menu ⋮ puis « Installer l’application » (ou « Installer et
                créer un raccourci »), puis confirme.
              </p>
            </section>
            <p className="text-xs text-muted-foreground">
              Une connexion Internet reste nécessaire pour les comptes, les sorties et les
              classements.
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
