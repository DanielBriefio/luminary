import { T } from '../lib/constants';
import { formatBytes } from '../lib/storageQuota';

// Visual progress bar for the per-user storage quota.
// Color thresholds: green <80%, amber 80-99%, rose >=100%.
//
// `compact` shrinks the bar + hides the textual label below; suitable
// for the Settings StoragePanel where space is tight.
export default function StorageQuotaBar({ usedBytes, quotaBytes, compact = false }) {
  if (!quotaBytes || quotaBytes <= 0) return null;
  const percent     = Math.min(100, Math.round((usedBytes / quotaBytes) * 100));
  const overage     = usedBytes > quotaBytes;
  const color = overage           ? T.ro
              : percent >= 80     ? T.am
              : T.gr;
  const trackColor = overage ? T.ro2 : percent >= 80 ? T.am2 : T.gr2;

  return (
    <div>
      <div style={{
        display:'flex', alignItems:'baseline', justifyContent:'space-between',
        marginBottom: compact ? 4 : 6,
      }}>
        <div style={{
          fontSize: compact ? 11 : 12, fontWeight:700,
          color: overage ? T.ro : T.mu,
          letterSpacing:.3, textTransform:'uppercase',
        }}>
          {overage ? 'Over quota' : `${percent}% of quota used`}
        </div>
        <div style={{ fontSize: compact ? 11 : 12, color:T.mu, fontVariantNumeric:'tabular-nums' }}>
          {formatBytes(usedBytes)} / {formatBytes(quotaBytes)}
        </div>
      </div>
      <div style={{
        width:'100%', height: compact ? 6 : 8, borderRadius:99,
        background: trackColor, overflow:'hidden',
      }}>
        <div style={{
          width: `${percent}%`, height:'100%',
          background: color,
          transition: 'width .3s, background .3s',
        }}/>
      </div>
      {!compact && overage && (
        <div style={{ marginTop:8, fontSize:12, color:T.ro }}>
          You're over your storage quota — uploads will be blocked until you delete files below.
        </div>
      )}
    </div>
  );
}
