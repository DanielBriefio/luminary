import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { ALL_TIER2 } from './constants';

/**
 * Fetches the most frequently used tags across all posts.
 * Returns top N tags sorted by frequency, excluding any already selected.
 * Falls back to ALL_TIER2 taxonomy specialities if the DB returns nothing.
 */
export function useSuggestedTopics(currentInterests = [], limit = 30) {
  const [suggested, setSuggested] = useState([]);
  const [loading,   setLoading]   = useState(true);

  const interestsKey = currentInterests.join(',');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_top_tags', { tag_limit: limit });

      if (cancelled) return;

      if (error || !data) {
        setSuggested(ALL_TIER2.filter(t => !currentInterests.includes(t)));
        setLoading(false);
        return;
      }

      const tags = data
        .map(row => row.tag)
        .filter(t => t && t.length > 1 && !currentInterests.includes(t));

      // If DB returned nothing yet, show all Tier 2 taxonomy specialities
      setSuggested(tags.length ? tags : ALL_TIER2.filter(t => !currentInterests.includes(t)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [interestsKey, limit]); // eslint-disable-line

  return { suggested, loading };
}
