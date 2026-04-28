import { useEffect, useState } from 'react';
import { T, WORK_MODE_MAP } from '../../lib/constants';
import Av from '../../components/Av';
import Spinner from '../../components/Spinner';
import SectionCard from './components/SectionCard';
import TierBar from './components/TierBar';
import EmptyState from './components/EmptyState';

const WORK_MODE_LABELS = {
  researcher:          'Researcher',
  clinician:           'Clinician',
  industry:            'Industry',
  clinician_scientist: 'Research & Patient Care',
};

function formatNum(n, decimals = 1) {
  if (n == null) return '—';
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(decimals);
}

export default function GrowthTab({ supabase, days }) {
  const [loading, setLoading] = useState(true);
  const [signupMethod, setSignupMethod] = useState([]);
  const [workMode, setWorkMode]         = useState([]);
  const [tiers, setTiers]               = useState([]);
  const [inviters, setInviters]         = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [sm, wm, td, ti] = await Promise.all([
        supabase.rpc('get_signup_method_breakdown', { p_days: days }),
        supabase.rpc('get_work_mode_stats',          { p_days: days }),
        supabase.rpc('get_tier_distribution'),
        supabase.rpc('get_top_inviters',             { p_limit: 20 }),
      ]);
      setSignupMethod(sm.data || []);
      setWorkMode(wm.data || []);
      setTiers(td.data || []);
      setInviters(ti.data || []);
      setLoading(false);
    })();
  }, [supabase, days]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner/></div>;

  return (
    <div>
      {/* Signup method */}
      <SectionCard
        title="Signup method"
        subtitle="ORCID OAuth vs email + invite code path"
      >
        {signupMethod.length === 0 ? (
          <EmptyState message="No signups in the selected window."/>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: T.mu, fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 0', fontWeight: 600 }}>Method</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Users</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Avg posts</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Avg comments</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Avg lumens</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>% activated</th>
              </tr>
            </thead>
            <tbody>
              {signupMethod.map(r => (
                <tr key={r.method} style={{ borderTop: `1px solid ${T.bdr}` }}>
                  <td style={{ padding: '10px 0', fontWeight: 600, color: T.text }}>
                    {r.method === 'orcid' ? '🟢 ORCID' : '✉️ Email + invite'}
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.users}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNum(r.avg_posts, 2)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNum(r.avg_comments, 2)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNum(r.avg_lumens, 1)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.pct_activated == null ? '—' : `${r.pct_activated}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Work mode */}
      <SectionCard
        title="Behaviour by work mode"
        subtitle="How segments differ in activity"
      >
        {workMode.length === 0 ? (
          <EmptyState message="No users in the selected window."/>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: T.mu, fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 0', fontWeight: 600 }}>Segment</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Users</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Avg posts</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Avg comments</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Avg lumens</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Avg groups</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>% w/ pub</th>
              </tr>
            </thead>
            <tbody>
              {workMode.map(r => (
                <tr key={r.work_mode} style={{ borderTop: `1px solid ${T.bdr}` }}>
                  <td style={{ padding: '10px 0', fontWeight: 600, color: T.text }}>
                    {WORK_MODE_LABELS[r.work_mode] || r.work_mode}
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.users}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNum(r.avg_posts, 2)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNum(r.avg_comments, 2)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNum(r.avg_lumens, 1)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNum(r.avg_groups, 2)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.pct_with_publication == null ? '—' : `${r.pct_with_publication}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Tier distribution */}
      <SectionCard
        title="Lumen tier distribution"
        subtitle="How users are spread across the four tiers (current period)"
      >
        {tiers.length === 0 ? (
          <EmptyState message="No tier data yet."/>
        ) : (
          <TierBar rows={tiers}/>
        )}
      </SectionCard>

      {/* Top inviters */}
      <SectionCard
        title="Top inviters"
        subtitle="Users bringing in active members"
      >
        {inviters.length === 0 ? (
          <EmptyState message="No invite-driven signups yet."/>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: T.mu, fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 0', fontWeight: 600 }}>User</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Codes created</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Claimed</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Active</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Conversion</th>
              </tr>
            </thead>
            <tbody>
              {inviters.map(r => (
                <tr key={r.user_id} style={{ borderTop: `1px solid ${T.bdr}` }}>
                  <td style={{ padding: '10px 0' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Av size={28} name={r.name} color={r.avatar_color} url={r.avatar_url || ''}/>
                      <span style={{ fontWeight: 600, color: T.text }}>{r.name || 'Unnamed'}</span>
                    </div>
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.codes_created}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.codes_claimed}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontWeight: 700, color: T.gr }}>
                    {r.active_invitees}
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.conversion_pct}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>
    </div>
  );
}
