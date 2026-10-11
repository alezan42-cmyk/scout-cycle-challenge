import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { useAuth } from '../lib/useAuth';

export function AlezanNamePoll() {
  const { user } = useAuth();
  const [suggestions, setSuggestions] = useState<any[]>([]);
  const [newSuggestion, setNewSuggestion] = useState('');
  const [hasVoted, setHasVoted] = useState(false);

  useEffect(() => {
    fetchSuggestions();
    checkIfVoted();
  }, [user]);

  const fetchSuggestions = async () => {
    const { data } = await supabase.from('alezan_name_suggestions').select('*, alezan_name_votes(count)');
    if (data) setSuggestions(data.sort((a, b) => b.alezan_name_votes[0].count - a.alezan_name_votes[0].count));
  };

  const checkIfVoted = async () => {
    if (!user) return;
    const { data } = await supabase.from('alezan_name_votes').select('id').eq('user_id', user.id);
    if (data && data.length > 0) setHasVoted(true);
  };

  const handleVote = async (suggestionId: string) => {
    if (!user || hasVoted) return;
    await supabase.from('alezan_name_votes').insert({ suggestion_id: suggestionId, user_id: user.id });
    setHasVoted(true);
    fetchSuggestions();
  };

  const handleSuggest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !newSuggestion.trim()) return;
    await supabase.from('alezan_name_suggestions').insert({ name: newSuggestion.trim(), submitted_by: user.id });
    setNewSuggestion('');
    fetchSuggestions();
  };

  return (
    <div className="p-4 bg-orange-50 rounded-xl shadow-sm border border-orange-200 mt-6">
      <h3 className="font-bold text-lg mb-2 text-orange-800">🐴 Comment devrions-nous l'appeler ?</h3>
      <p className="text-sm text-gray-600 mb-4">Votez pour le nom de notre mascotte ou proposez le vôtre !</p>
      
      <div className="space-y-2 mb-4">
        {suggestions.map((s) => (
          <div key={s.id} className="flex justify-between items-center bg-white p-2 rounded border">
            <span>{s.name} <span className="text-gray-400 text-xs">({s.alezan_name_votes[0].count} votes)</span></span>
            {!hasVoted && (
              <Button size="sm" variant="outline" onClick={() => handleVote(s.id)}>Voter</Button>
            )}
          </div>
        ))}
      </div>

      {!hasVoted && (
        <form onSubmit={handleSuggest} className="flex gap-2 mt-4">
          <Input value={newSuggestion} onChange={(e) => setNewSuggestion(e.target.value)} placeholder="Proposer un nom..." />
          <Button type="submit">Proposer</Button>
        </form>
      )}
      {hasVoted && <p className="text-sm text-green-600 font-medium">Merci pour votre vote !</p>}
    </div>
  );
}