import { useState, useEffect } from 'react';
import { supabase } from '../supabase';

const FALLBACK = [
  'GLP1','CRISPR','CryoEM','OpenScience','DigitalHealth',
  'MedicalAffairs','RWE','Oncology','Neuroscience','Cardiology',
  'Immunology','ClinicalTrials','DrugDiscovery','WomensHealth',
  'Microbiome','Proteomics','MedTech','Biostatistics',
];

/**
 * Fetches the most frequently used tags across all posts.
 * Returns top N tags sorted by frequency, excluding any already selected.
 * Falls back to a hardcoded list if the RPC is unavailable.
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
        setSuggested(FALLBACK.filter(t => !currentInterests.includes(t)));
        setLoading(false);
        return;
      }

      const tags = data
        .map(row => row.tag)
        .filter(t => t && t.length > 1 && !currentInterests.includes(t));

      // If DB returned nothing yet, show fallback minus selected
      setSuggested(tags.length ? tags : FALLBACK.filter(t => !currentInterests.includes(t)));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [interestsKey, limit]); // eslint-disable-line

  return { suggested, loading };
}
