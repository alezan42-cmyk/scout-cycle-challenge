import React, { useState, useEffect } from 'react';
import { getAlezanQuote } from '../lib/alezanQuotes';
import { useSeasonalTheme } from '../context/SeasonalThemeContext';

// Importez vos images ici (ajustez les chemins selon votre structure)
import alezanClassique from '../assets/Perso/Alezan_Classique.png';
import alezanHalloween from '../assets/Perso/Alezan_Halloween.png';
import alezanNoel from '../assets/Perso/Alezan_Noel.png';
import alezanStValentin from '../assets/Perso/Alezan_St_Valentin.png';

interface AlezanMascotProps {
  context?: 'general' | 'post_ride' | 'leader' | 'chasing';
  data?: any;
}

export function AlezanMascot({ context = 'general', data }: AlezanMascotProps) {
  const { currentTheme } = useSeasonalTheme(); // Utilise le contexte existant pour le thème
  const [quote, setQuote] = useState('');

  useEffect(() => {
    setQuote(getAlezanQuote(context, data));
  }, [context, data]);

  // Déterminer l'image en fonction du thème
  let currentImage = alezanClassique;
  if (currentTheme === 'halloween') currentImage = alezanHalloween;
  if (currentTheme === 'noel') currentImage = alezanNoel;
  if (currentTheme === 'valentin') currentImage = alezanStValentin;

  return (
    <div className="flex items-end space-x-4 p-4 my-4">
      <div className="relative w-24 h-24 flex-shrink-0">
        <img src={currentImage} alt="Mascotte Alezan" className="w-full h-full object-contain" />
      </div>
      <div className="bg-white border-2 border-orange-300 rounded-2xl rounded-bl-none p-3 shadow-md relative max-w-xs">
        <p className="text-sm font-medium text-gray-800">{quote}</p>
        {/* Petite flèche de la bulle */}
        <div className="absolute -left-2 bottom-0 w-4 h-4 bg-white border-b-2 border-l-2 border-orange-300 transform rotate-45 translate-y-1/2"></div>
      </div>
    </div>
  );
}
