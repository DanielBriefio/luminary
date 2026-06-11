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
// per-row Copy button. Branches on pub_type: journal articles use
// the standard "Authors. Title. Journal. Year. doi: ..." form;
// conference / poster / lecture entries use the "Presented at:
// Venue; Date; Location." form which is what CVs and grants expect
// for talks. Falls back to pub.citation when fields are missing.
export function formatVancouver(pub) {
  const segs = [];
  const authors = formatAuthorsVancouver(pub.authors);
  if (authors) segs.push(authors + '.');
  if (pub.title) segs.push(pub.title.replace(/[.\s]+$/, '') + '.');

  const isEvent  = ['conference','poster','lecture'].includes(pub.pub_type);
  const isPatent = pub.pub_type === 'patent';
  if (isPatent) {
    // Patents overload columns: journal = patent number,
    // event_date = filing date, event_location = jurisdiction/assignee.
    // Format: "Inventors. Title. Patent number. Filed: date; jurisdiction."
    if (pub.journal) segs.push(pub.journal + '.');
    const tail = [];
    if (pub.event_date)     tail.push('Filed: ' + pub.event_date);
    else if (pub.year)      tail.push(pub.year);
    if (pub.event_location) tail.push(pub.event_location);
    if (tail.length) segs.push(tail.join('; ') + '.');
  } else if (isEvent) {
    const venue = pub.venue || pub.journal;
    const parts = [];
    if (venue)             parts.push(venue);
    if (pub.event_date)    parts.push(pub.event_date);
    else if (pub.year)     parts.push(pub.year);
    if (pub.event_location) parts.push(pub.event_location);
    if (parts.length) segs.push('Presented at: ' + parts.join('; ') + '.');
  } else {
    const venue = pub.journal || pub.venue;
    if (venue) segs.push(venue + '.');
    if (pub.year) segs.push(pub.year + '.');
  }

  const extras = [];
  if (pub.doi) {
    const url = pub.doi.startsWith('http') ? pub.doi : `https://doi.org/${pub.doi}`;
    extras.push(isPatent ? `Available at: ${url}` : `doi: ${url}`);
  }
  if (pub.pmid) extras.push(`PubMed PMID: ${pub.pmid}`);
  if (extras.length) segs.push(extras.join('; ') + '.');
  return segs.join(' ');
}
