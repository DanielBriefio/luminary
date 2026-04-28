import { T, WORK_MODE_MAP, TIER_CONFIG } from '../../../lib/constants';
import Av from '../../../components/Av';

const WORK_MODE_BADGE_BG = {
  researcher:          T.v2,
  clinician:           T.gr2,
  industry:            T.am2,
  clinician_scientist: T.bl2,
};
const WORK_MODE_BADGE_FG = {
  researcher:          T.v3,
  clinician:           T.gr,
  industry:            T.am,
  clinician_scientist: T.bl,
};

export default function UserRow({ user, primary, secondary, action }) {
  const wm = user.work_mode || 'researcher';
  const wmInfo = WORK_MODE_MAP[wm] || WORK_MODE_MAP.researcher;
  const tier   = user.tier;
  const tierInfo = tier && TIER_CONFIG[tier];

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: 'auto 1fr auto auto',
      alignItems: 'center', gap: 12,
      padding: '10px 14px',
      borderBottom: `1px solid ${T.bdr}`,
    }}>
      <Av size={32} tier={tier} name={user.name} color={user.avatar_color} url={user.avatar_url || ''}/>
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: 13.5, fontWeight: 600, color: T.text,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {user.name || 'Unnamed user'}
        </div>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 2 }}>
          <span style={{
            fontSize: 10.5, fontWeight: 700,
            background: WORK_MODE_BADGE_BG[wm] || T.v2,
            color: WORK_MODE_BADGE_FG[wm] || T.v3,
            padding: '2px 7px', borderRadius: 20,
            textTransform: 'uppercase', letterSpacing: 0.3,
          }}>
            {wmInfo.label}
          </span>
          {tierInfo && (
            <span style={{
              fontSize: 10.5, fontWeight: 700,
              background: tierInfo.bg, color: tierInfo.color,
              padding: '2px 7px', borderRadius: 20,
              textTransform: 'uppercase', letterSpacing: 0.3,
            }}>
              {tierInfo.name}
            </span>
          )}
        </div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: 13.5, fontWeight: 700, color: T.text, fontVariantNumeric: 'tabular-nums' }}>
          {primary?.value}
        </div>
        {primary?.label && (
          <div style={{ fontSize: 11, color: T.mu }}>{primary.label}</div>
        )}
        {secondary && (
          <div style={{ fontSize: 11, color: T.mu, marginTop: 2 }}>
            {secondary}
          </div>
        )}
      </div>
      <div>
        {action}
      </div>
    </div>
  );
}
