import type { ReactNode } from "react";
import { Drawer as DrawerPrimitive } from "vaul";
import { cn } from "@/lib/utils";

/**
 * Fenêtre qui monte du bas de l'écran, pour l'app installée uniquement.
 * Elle suit le doigt : on la ferme en la glissant vers le bas (avec l'élan du geste),
 * elle résiste en douceur si on tire vers le haut, et le contenu défile à l'intérieur.
 * (Principes « direct manipulation », « momentum » et « rubber-banding » du skill apple-design.)
 */
export function AppSheet({
  open,
  onOpenChange,
  title,
  description,
  hideTitle = false,
  children,
  className,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Titre lu par les lecteurs d'écran (et affiché sauf si hideTitle) */
  title: ReactNode;
  description?: ReactNode;
  hideTitle?: boolean;
  children: ReactNode;
  className?: string;
}) {
  return (
    <DrawerPrimitive.Root open={open} onOpenChange={onOpenChange} shouldScaleBackground={false}>
      <DrawerPrimitive.Portal>
        <DrawerPrimitive.Overlay className="app-sheet-overlay fixed inset-0 z-50 bg-black/40" />
        <DrawerPrimitive.Content
          className={cn(
            "app-sheet fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-[28px] bg-background shadow-[0_-8px_40px_rgb(0_0_0/0.18)] outline-none",
            className,
          )}
        >
          {/* Poignée : indique qu'on peut glisser */}
          <div
            aria-hidden
            className="mx-auto mb-1 mt-2.5 h-1.5 w-10 shrink-0 rounded-full bg-muted-foreground/30"
          />
          <div className="overflow-y-auto overscroll-contain px-5 pb-[calc(1.5rem+env(safe-area-inset-bottom))] pt-2">
            <DrawerPrimitive.Title
              className={cn(
                "font-display text-[22px] font-black leading-tight text-foreground",
                hideTitle ? "sr-only" : "mb-4",
              )}
            >
              {title}
            </DrawerPrimitive.Title>
            {description ? (
              <DrawerPrimitive.Description className="sr-only">
                {description}
              </DrawerPrimitive.Description>
            ) : (
              <DrawerPrimitive.Description className="sr-only">
                Glisse vers le bas pour fermer
              </DrawerPrimitive.Description>
            )}
            {children}
          </div>
        </DrawerPrimitive.Content>
      </DrawerPrimitive.Portal>
    </DrawerPrimitive.Root>
  );
}
