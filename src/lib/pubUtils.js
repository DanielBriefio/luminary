import { PUB_TYPES } from './constants';

export const typeIcon  = t => PUB_TYPES.find(p=>p.id===t)?.icon  || '📄';
export const typeLabel = t => PUB_TYPES.find(p=>p.id===t)?.label || 'Publication';

// PubMed/EuropePMC author-string format: "Smith J, Jones A, Brown B".
// Splits on commas/semicolons, preserving multi-word author names.
export function splitAuthors(str) {
  if (!str?.trim()) return [];
  return str.split(/\s*;\s*|\s*,\s*(?=[A-ZÀ-ɏ])/)
    .map(a => a.trim()).filter(Boolean);
}

// Vancouver convention: up to 6 authors verbatim, then "et al."
export function formatAuthorsVancouver(authorsStr) {
  const parts = splitAuthors(authorsStr);
  if (!parts.length) return '';
  if (parts.length <= 6) return parts.join(', ');
  return parts.slice(0, 6).join(', ') + ', et al.';
}

// Full Vancouver/NLM-style citation string. Used by the export +
// per-row Copy button. Falls back to pub.citation (the pre-built
// citation from EPMC/CrossRef) for fields it can't derive.
export function formatVancouver(pub) {
  const segs = [];
  const authors = formatAuthorsVancouver(pub.authors);
  if (authors) segs.push(authors + '.');
  if (pub.title) segs.push(pub.title.replace(/[.\s]+$/, '') + '.');
  const venue = pub.journal || pub.venue;
  if (venue) segs.push(venue + '.');
  if (pub.year)  segs.push(pub.year + '.');
  const extras = [];
  if (pub.doi) {
    const doi = pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`;
    extras.push(`doi: ${doi}`);
  }
  if (pub.pmid) extras.push(`PubMed PMID: ${pub.pmid}`);
  if (extras.length) segs.push(extras.join('; ') + '.');
  return segs.join(' ');
}
