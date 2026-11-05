import React from 'react';
import { Profile } from '../types/scout';
import { isExcludedFromMaillotJaune } from '../utils/leaderboard';

interface LeaderboardProps {
  profiles: (Profile & { total_km: number })[];
  exclusionMonths: number;
}

export const LeaderboardMaillotJaune: React.FC<LeaderboardProps> = ({ profiles, exclusionMonths }) => {
  const eligibleProfiles = profiles.filter(
    (p) => !isExcludedFromMaillotJaune(p, exclusionMonths)
  );

  const excludedProfiles = profiles.filter((p) =>
    isExcludedFromMaillotJaune(p, exclusionMonths)
  );

  return (
    <div className="space-y-8">
      <div className="bg-white rounded-2xl shadow-lg p-6">
        <h2 className="text-2xl font-extrabold text-gray-900 mb-6 flex items-center gap-2">
          <span>🟡</span> Classement Maillot Jaune (Éligibles)
        </h2>

        <div className="space-y-3">
          {eligibleProfiles.map((scout, index) => (
            <div
              key={scout.id}
              className={`flex items-center justify-between p-4 rounded-xl border ${
                index === 0
                  ? 'bg-yellow-50 border-yellow-300 ring-2 ring-yellow-400'
                  : 'bg-gray-50 border-gray-200'
              }`}
            >
              <div className="flex items-center gap-4">
                <span className="font-bold text-lg text-gray-500 w-6">#{index + 1}</span>
                <div>
                  <div className="font-bold text-gray-900 flex items-center gap-2">
                    {scout.totem || 'Scout'}
                    {scout.is_scout_honneur && (
                      <span className="bg-purple-100 text-purple-700 text-xs px-2 py-0.5 rounded-full font-medium">
                        ⭐ Scout d'Honneur
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="font-extrabold text-yellow-600 text-lg">
                {scout.total_km.toFixed(1)} km
              </div>
            </div>
          ))}
        </div>
      </div>

      {excludedProfiles.length > 0 && (
        <div className="bg-amber-50/60 rounded-2xl p-6 border border-amber-200">
          <h3 className="text-lg font-bold text-amber-900 mb-3 flex items-center gap-2">
            🏆 Hall of Fame — Scouts Sportifs (En pause Maillot Jaune)
          </h3>
          <p className="text-sm text-amber-700 mb-4">
            Ces scouts ayant été honorés du titre de Scout Sportif sont temporairement retirés du classement Maillot Jaune.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {excludedProfiles.map((scout) => (
              <div key={scout.id} className="bg-white p-4 rounded-xl border border-amber-200 shadow-sm flex justify-between items-center">
                <div>
                  <div className="font-bold text-gray-900 flex items-center gap-1.5">
                    🏆 {scout.totem}
                    {scout.is_scout_honneur && <span>⭐</span>}
                  </div>
                  <div className="text-xs text-amber-600 font-medium mt-0.5">Scout Sportif du mois</div>
                </div>
                <div className="text-right">
                  <span className="text-sm font-semibold text-gray-600">{scout.total_km.toFixed(1)} km</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
