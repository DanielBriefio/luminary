import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { ALL_TIER2, getTier2 } from './constants';

/**
 * Fetches the most frequently used tags across all posts.
 * Returns top N tags sorted by frequency, excluding any already selected.
 *
 * Cold-start fallback (RPC errors OR returns no data, e.g. fresh DB
 * with no tagged posts yet): show specialities from the user's tier1
 * discipline only — that's <=12 highly relevant chips instead of the
 * full ~150-entry ALL_TIER2 list. Caller can pass `wide=true` to opt
 * into the full taxonomy list (used by the "see all topics" button
 * in the picker). When no tier1 is known, fallback is always wide.
 *
 * `narrowed` in the return tells the caller whether the current
 * fallback is narrowed by tier1 — i.e. whether offering "see all"
 * would actually reveal more options.
 */
export function useSuggestedTopics(currentInterests = [], tier1 = '', wide = false, limit = 30) {
  const [suggested, setSuggested] = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [narrowed,  setNarrowed]  = useState(false);

  const interestsKey = currentInterests.join(',');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('get_top_tags', { tag_limit: limit });

      if (cancelled) return;

      const liveTags = (!error && data)
        ? data
            .map(row => row.tag)
            .filter(t => t && t.length > 1 && !currentInterests.includes(t))
        : [];

      if (liveTags.length > 0) {
        setSuggested(liveTags);
        setNarrowed(false);
      } else {
        // Cold-start fallback. Narrow to tier1 specialities when known
        // and the caller hasn't asked for the wide list.
        const useNarrow = !!tier1 && !wide;
        const pool = useNarrow ? getTier2(tier1) : ALL_TIER2;
        setSuggested(pool.filter(t => !currentInterests.includes(t)));
        setNarrowed(useNarrow);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [interestsKey, tier1, wide, limit]); // eslint-disable-line

  return { suggested, loading, narrowed };
}
