import { T } from '../lib/constants';
import OrcidIcon from './OrcidIcon';

// Renders an ORCID iD badge that links to the user's public ORCID page.
//
// Per ORCID's display guidelines (orcid.org/trademark-and-id-display-guidelines):
// the iD icon may only be shown next to an authenticated iD — i.e. one
// the user proved ownership of by completing the OAuth flow. Self-asserted
// iDs (typed into the importer) must be shown without the icon.
//
// In Luminary that distinction is `profiles.orcid_verified === true` (set
// during the ORCID OAuth signup path in AuthScreen). The OrcidImporter
// flow does NOT set this flag.
export default function OrcidBadge({ orcid, verified, fontSize = 12.5 }) {
  if (!orcid) return null;
  const tooltip = verified
    ? `ORCID iD ${orcid} (authenticated via ORCID OAuth)`
    : `ORCID iD ${orcid} (self-asserted)`;
  return (
    <a
      href={`https://orcid.org/${orcid}`}
      target="_blank"
      rel="noopener noreferrer"
      title={tooltip}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 5,
        color: T.gr, textDecoration: 'none', fontWeight: 600,
        fontSize,
      }}
    >
      {verified && <OrcidIcon size={fontSize + 2}/>}
      <span>ORCID</span>
      <span style={{ fontSize: fontSize - 1.5, opacity: 0.7 }}>↗</span>
    </a>
  );
}
