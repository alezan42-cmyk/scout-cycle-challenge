/**
 * Application installée (PWA en mode « standalone »).
 * Les écrans « app » ne servent que sur téléphone : sur un ordinateur (ou une
 * tablette en grand écran), même installée, l'app affiche le site normal.
 */

/** Largeur au-delà de laquelle on affiche le site (même valeur que le point « md » du site). */
export const APP_MAX_WIDTH = 767;

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** Mode « app » : installée ET écran de téléphone. */
export function isAppMode(): boolean {
  if (!isStandalone()) return false;
  return window.matchMedia(`(max-width: ${APP_MAX_WIDTH}px)`).matches;
}

/** Page du site qui correspond à un écran de l'app (quand on est sur ordinateur). */
export function websitePathFor(appPath: string): string {
  if (appPath.startsWith("/app/mes-kms") || appPath.startsWith("/app/enregistrer"))
    return "/mes-km";
  if (appPath.startsWith("/app/trophees")) return "/mes-km";
  if (appPath.startsWith("/app/sorties-prevues")) return "/sorties-prevues";
  return "/";
}

/**
 * Exécuté avant l'affichage. Sur téléphone (app installée) : marque <html> comme
 * « app » et envoie « / » vers « /app ». Sur ordinateur : renvoie les écrans
 * « /app… » vers la page du site correspondante.
 */
export const APP_BOOT_SCRIPT = `(function(){try{var s=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;if(!s)return;var p=location.pathname;var phone=window.matchMedia('(max-width: ${APP_MAX_WIDTH}px)').matches;if(phone){document.documentElement.classList.add('app-standalone');if(p==='/'){location.replace('/app'+location.search+location.hash);}}else if(p==='/app'||p.indexOf('/app/')===0){var t=(p.indexOf('/app/mes-kms')===0||p.indexOf('/app/enregistrer')===0||p.indexOf('/app/trophees')===0)?'/mes-km':p.indexOf('/app/sorties-prevues')===0?'/sorties-prevues':'/';location.replace(t);}}catch(e){}})();`;
