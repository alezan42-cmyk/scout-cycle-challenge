import React, { useState, useEffect } from 'react';
import { supabase } from '../../lib/supabase';
import { Profile } from '../../types/scout';
import { getRemainingExclusionDays } from '../../utils/leaderboard';

export const AdminScoutSportif: React.FC = () => {
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [exclusionMonths, setExclusionMonths] = useState<number>(3);
  const [loading, setLoading] = useState<boolean>(true);
  const [savingMonths, setSavingMonths] = useState<boolean>(false);

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: profs, error: profsError } = await supabase
        .from('profiles')
        .select('*')
        .order('totem', { ascending: true });

      if (profsError) throw profsError;
      setProfiles(profs || []);

      const { data: setting, error: settingError } = await supabase
        .from('app_settings')
        .select('value')
        .eq('key', 'scout_sportif_exclusion_months')
        .single();

      if (!settingError && setting) {
        setExclusionMonths(Number(setting.value) || 3);
      }
    } catch (err) {
      console.error('Erreur lors du chargement des données:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExclusionMonths = async () => {
    setSavingMonths(true);
    try {
      const { error } = await supabase
        .from('app_settings')
        .upsert({
          key: 'scout_sportif_exclusion_months',
          value: exclusionMonths,
          updated_at: new Date().toISOString()
        });

      if (error) throw error;
      alert('Période d\'exclusion mise à jour avec succès !');
    } catch (err) {
      console.error('Erreur lors de la sauvegarde:', err);
      alert('Erreur lors de la mise à jour de la période.');
    } finally {
      setSavingMonths(false);
    }
  };

  const toggleScoutSportif = async (profile: Profile) => {
    const isNowSportif = !profile.is_scout_sportif;
    const electedAt = isNowSportif ? new Date().toISOString() : null;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          is_scout_sportif: isNowSportif,
          scout_sportif_elected_at: electedAt
        })
        .eq('id', profile.id);

      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Erreur lors du changement de statut Scout Sportif:', err);
    }
  };

  const toggleScoutHonneur = async (profile: Profile) => {
    const isNowHonneur = !profile.is_scout_honneur;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ is_scout_honneur: isNowHonneur })
        .eq('id', profile.id);

      if (error) throw error;
      fetchData();
    } catch (err) {
      console.error('Erreur lors du changement de statut Scout d\'Honneur:', err);
    }
  };

  if (loading) return <div>Chargement...</div>;

  return (
    <div className="p-6 bg-white rounded-xl shadow-md space-y-6">
      <h2 className="text-2xl font-bold text-gray-800">Gestion Scout Sportif & Scout d'Honneur</h2>

      <div className="bg-amber-50 p-4 rounded-lg border border-amber-200">
        <h3 className="font-semibold text-amber-900 mb-2">Durée d'exclusion du Maillot Jaune</h3>
        <p className="text-sm text-amber-700 mb-4">
          Un scout élu "Scout Sportif" sera retiré du classement Maillot Jaune pendant cette durée.
        </p>
        <div className="flex items-center gap-4">
          <label className="text-sm font-medium text-gray-700">Durée (en mois) :</label>
          <input
            type="number"
            min="1"
            max="24"
            value={exclusionMonths}
            onChange={(e) => setExclusionMonths(parseInt(e.target.value) || 1)}
            className="w-20 px-3 py-1.5 border border-gray-300 rounded-lg text-center"
          />
          <button
            onClick={handleSaveExclusionMonths}
            disabled={savingMonths}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-medium rounded-lg text-sm transition"
          >
            {savingMonths ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600">
          <thead className="bg-gray-100 text-gray-700 uppercase text-xs">
            <tr>
              <th className="py-3 px-4">Scout (Totem)</th>
              <th className="py-3 px-4 text-center">Scout Sportif</th>
              <th className="py-3 px-4 text-center">Statut Maillot Jaune</th>
              <th className="py-3 px-4 text-center">Scout d'Honneur ⭐</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {profiles.map((p) => {
              const daysLeft = getRemainingExclusionDays(p, exclusionMonths);
              return (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="py-3 px-4 font-medium text-gray-900">
                    {p.totem || p.email} {p.qualificatif ? `(${p.qualificatif})` : ''}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => toggleScoutSportif(p)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        p.is_scout_sportif
                          ? 'bg-yellow-500 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {p.is_scout_sportif ? '🏆 Élu' : 'Désigné'}
                    </button>
                  </td>
                  <td className="py-3 px-4 text-center">
                    {daysLeft > 0 ? (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        Exclu ({daysLeft} j)
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        Éligible 🟡
                      </span>
                    )}
                  </td>
                  <td className="py-3 px-4 text-center">
                    <button
                      onClick={() => toggleScoutHonneur(p)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold ${
                        p.is_scout_honneur
                          ? 'bg-purple-600 text-white'
                          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                      }`}
                    >
                      {p.is_scout_honneur ? '⭐ Oui' : 'Non'}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
