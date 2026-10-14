/** Application installée (PWA en mode « standalone »), sur téléphone comme sur ordinateur. */

/** Largeur au-delà de laquelle on affiche le site (même valeur que le point « md » du site). */
export const APP_MAX_WIDTH = 767;

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Mode « app » : l'app est installée, quelle que soit la taille de l'écran. */
export function isAppMode(): boolean {
  return isStandalone();
}

/** Page du site qui correspond à un écran de l'app (quand on est sur ordinateur). */
export function websitePathFor(appPath: string): string {
  if (appPath.startsWith("/app/mes-kms") || appPath.startsWith("/app/enregistrer"))
    return "/mes-km";
  if (appPath.startsWith("/app/trophees")) return "/mes-km";
  return "/";
}

/**
 * Exécuté avant l'affichage. Dans l'app installée, marque <html> comme « app »
 * et envoie « / » vers « /app », sur téléphone comme sur ordinateur.
 */
export const APP_BOOT_SCRIPT = `(function(){try{var s=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;if(!s)return;document.documentElement.classList.add('app-standalone');if(location.pathname==='/'){location.replace('/app'+location.search+location.hash);}}catch(e){}})();`;
