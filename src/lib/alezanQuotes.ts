export const getAlezanQuote = (
  context: 'general' | 'post_ride' | 'leader' | 'chasing',
  data?: { distanceToYellow?: number; pursuerName?: string; pursuerDistance?: number }
) => {
  const generalQuotes = [
    "Hennissement de motivation ! Continue comme ça !",
    "N'oublie pas de t'hydrater pendant tes sorties !",
    "Chaque kilomètre compte, au trot ou au galop !",
    "Prêt pour une nouvelle aventure à vélo ?"
  ];

  const postRideQuotes = [
    "Superbe sortie ! L'avoine est bien méritée aujourd'hui !",
    "Bravo ! Tu as fait chauffer les cuissots !",
    "Excellente contribution ! L'équipe te remercie !"
  ];

  if (context === 'post_ride') return postRideQuotes[Math.floor(Math.random() * postRideQuotes.length)];
  
  if (context === 'leader' && data?.pursuerName) {
    return `Tu es maillot jaune ! Mais attention, ${data.pursuerName} n'est qu'à ${data.pursuerDistance} km de te dépasser !`;
  }
  
  if (context === 'chasing' && data?.distanceToYellow) {
    return `Allez ! Tu n'es plus qu'à ${data.distanceToYellow} km du maillot jaune ! En danseuse !`;
  }

  return generalQuotes[Math.floor(Math.random() * generalQuotes.length)];
};