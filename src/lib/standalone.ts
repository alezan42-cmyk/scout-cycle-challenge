/**
 * Application installée (PWA en mode « standalone »).
 * Tout ce qui est propre à l'app passe par ici : le site web n'est jamais concerné.
 */

export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * Exécuté avant l'affichage : marque <html> comme « app » et envoie l'accueil
 * du site (« / ») vers l'accueil de l'app (« /app »), sans flash du site.
 */
export const APP_BOOT_SCRIPT = `(function(){try{var s=window.matchMedia('(display-mode: standalone)').matches||window.navigator.standalone===true;if(!s)return;document.documentElement.classList.add('app-standalone');if(location.pathname==='/'){location.replace('/app'+location.search+location.hash);}}catch(e){}})();`;
