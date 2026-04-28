import { useEffect, useState } from 'react';
import { T } from '../../lib/constants';
import Spinner from '../../components/Spinner';
import SectionCard from './components/SectionCard';
import PreferenceRow from './components/PreferenceRow';
import SimpleBarChart from './components/SimpleBarChart';
import PostHogLinks from './components/PostHogLinks';
import EmptyState from './components/EmptyState';

const FEATURE_LABELS = {
  posted:          'Posted',
  commented:       'Commented',
  joined_group:    'Joined a group',
  added_library:   'Added library item',
  created_project: 'Created a project',
  added_publication: 'Added publication',
  sent_dm:         'Sent a DM',
  followed:        'Followed someone',
};
const PROFILE_LABELS = {
  bio:           'Bio',
  avatar:        'Avatar',
  publication:   'Publication',
  orcid:         'ORCID iD',
  field_tags:    'Field tags',
  work_history:  'Work history',
};
const POST_TYPE_LABELS = {
  paper:     '📄 Paper',
  text:      '✍️ Text',
  deep_dive: '📰 Deep dive',
};

function formatNum(n, decimals = 1) {
  if (n == null) return '—';
  const num = Number(n);
  return Number.isInteger(num) ? String(num) : num.toFixed(decimals);
}

export default function ProductTab({ supabase, days }) {
  const [loading, setLoading] = useState(true);
  const [adoption, setAdoption]   = useState([]);
  const [perf, setPerf]           = useState([]);
  const [hist, setHist]           = useState([]);
  const [profile, setProfile]     = useState([]);
  const [consent, setConsent]     = useState(null);
  const [groupHealth, setGH]      = useState(null);
  const [hotPapers, setHotPapers] = useState([]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [adR, pfR, hsR, prR, csR, ghR, hpR] = await Promise.all([
        supabase.rpc('get_feature_adoption'),
        supabase.rpc('get_content_performance', { p_days: days }),
        supabase.rpc('get_lumens_histogram'),
        supabase.rpc('get_profile_completeness'),
        supabase.rpc('get_consent_rates'),
        supabase.rpc('get_content_health'),
        supabase.rpc('get_hot_papers', { p_limit: 20 }),
      ]);
      setAdoption(adR.data || []);
      setPerf(pfR.data || []);
      setHist(hsR.data || []);
      setProfile(prR.data || []);
      setConsent(csR.data || null);
      setGH(ghR.data || null);
      setHotPapers(hpR.data || []);
      setLoading(false);
    })();
  }, [supabase, days]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner/></div>;

  const groups = groupHealth?.groups || [];
  const ghCounts = {
    active: groups.filter(g => g.health === 'active').length,
    quiet:  groups.filter(g => g.health === 'quiet').length,
    dead:   groups.filter(g => g.health === 'dead').length,
  };

  return (
    <div>
      {/* Feature adoption */}
      <SectionCard
        title="Feature adoption"
        subtitle="% of users who have ever used each feature"
      >
        {adoption.length === 0 ? (
          <EmptyState message="No usage data yet."/>
        ) : (
          adoption.map(f => (
            <PreferenceRow
              key={f.feature}
              label={FEATURE_LABELS[f.feature] || f.feature}
              count={f.count}
              pct={f.pct}
              thresholds="feature"
            />
          ))
        )}
      </SectionCard>

      {/* Content performance */}
      <SectionCard
        title="Content performance"
        subtitle="What kinds of posts get engagement"
      >
        {perf.length === 0 ? (
          <EmptyState message="No posts in the selected window."/>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead>
              <tr style={{ textAlign: 'left', color: T.mu, fontSize: 11, textTransform: 'uppercase' }}>
                <th style={{ padding: '8px 0', fontWeight: 600 }}>Type</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Posts</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Avg likes</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>Avg comments</th>
                <th style={{ padding: '8px 0', fontWeight: 600, textAlign: 'right' }}>3+ commenters</th>
              </tr>
            </thead>
            <tbody>
              {perf.map(r => (
                <tr key={r.post_type} style={{ borderTop: `1px solid ${T.bdr}` }}>
                  <td style={{ padding: '10px 0', fontWeight: 600, color: T.text }}>
                    {POST_TYPE_LABELS[r.post_type] || r.post_type}
                  </td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{r.posts}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNum(r.avg_likes, 2)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{formatNum(r.avg_comments, 2)}</td>
                  <td style={{ padding: '10px 0', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                    {r.pct_with_3plus_commenters == null ? '—' : `${r.pct_with_3plus_commenters}%`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionCard>

      {/* Lumens histogram */}
      <SectionCard
        title="Lumens distribution"
        subtitle="Lifetime Lumens earned across users — flat = earning hooks not firing"
      >
        {hist.length === 0 || hist.every(h => h.count === 0) ? (
          <EmptyState
            message="No Lumens earned yet."
            hint={'Check LUMENS_ENABLED flag in constants.js'}
          />
        ) : (
          <SimpleBarChart
            data={hist}
            xKey="bucket"
            yKey="count"
            label="Users"
            height={200}
          />
        )}
      </SectionCard>

      {/* Profile completeness */}
      <SectionCard
        title="Profile completeness"
        subtitle="Which fields users actually fill in"
      >
        {profile.length === 0 ? (
          <EmptyState message="No profile data yet."/>
        ) : (
          profile.map(f => (
            <PreferenceRow
              key={f.field}
              label={PROFILE_LABELS[f.field] || f.field}
              count={f.count}
              pct={f.pct}
              thresholds="feature"
            />
          ))
        )}
      </SectionCard>

      {/* Consent rates */}
      <SectionCard
        title="User preferences & consent"
        subtitle="How many users opt in to each comms channel"
      >
        {!consent ? (
          <EmptyState message="No data yet."/>
        ) : (
          <>
            <PreferenceRow
              label="Email notifications on"
              count={consent.email_notifications?.count}
              pct={consent.email_notifications?.pct}
              thresholds="consent"
            />
            <PreferenceRow
              label="Email marketing opt-in"
              count={consent.email_marketing?.count}
              pct={consent.email_marketing?.pct}
              thresholds="consent"
            />
            <PreferenceRow
              label="Analytics consent"
              count={consent.analytics_consent?.count}
              pct={consent.analytics_consent?.pct}
              thresholds="consent"
            />
          </>
        )}
      </SectionCard>

      {/* Group health */}
      <SectionCard
        title="Group health"
        subtitle="Posting activity across all groups"
      >
        {groups.length === 0 ? (
          <EmptyState message="No groups yet."/>
        ) : (
          <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
            <div style={{
              flex: 1, minWidth: 120,
              background: T.gr2, border: `1px solid ${T.gr}40`, borderRadius: 10,
              padding: '12px 14px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.gr, textTransform: 'uppercase' }}>🟢 Active</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: T.text }}>{ghCounts.active}</div>
              <div style={{ fontSize: 11, color: T.mu }}>Posted in last 7 days</div>
            </div>
            <div style={{
              flex: 1, minWidth: 120,
              background: T.am2, border: `1px solid ${T.am}40`, borderRadius: 10,
              padding: '12px 14px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.am, textTransform: 'uppercase' }}>🟡 Quiet</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: T.text }}>{ghCounts.quiet}</div>
              <div style={{ fontSize: 11, color: T.mu }}>7-14 days ago</div>
            </div>
            <div style={{
              flex: 1, minWidth: 120,
              background: T.ro2, border: `1px solid ${T.ro}40`, borderRadius: 10,
              padding: '12px 14px',
            }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: T.ro, textTransform: 'uppercase' }}>🔴 Dead</div>
              <div style={{ fontFamily: "'DM Serif Display', serif", fontSize: 24, color: T.text }}>{ghCounts.dead}</div>
              <div style={{ fontSize: 11, color: T.mu }}>14+ days silent</div>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Hot papers */}
      <SectionCard
        title="Hot papers"
        subtitle="Papers being discussed by ≥2 distinct researchers"
      >
        {hotPapers.length === 0 ? (
          <EmptyState message="No papers have ≥2 distinct discussers yet."/>
        ) : (
          <div>
            {hotPapers.map((p, i) => (
              <div key={p.doi} style={{
                padding: '10px 0',
                borderTop: i === 0 ? 'none' : `1px solid ${T.bdr}`,
                display: 'grid',
                gridTemplateColumns: '1fr auto auto auto',
                gap: 14, alignItems: 'baseline',
              }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{
                    fontSize: 13, fontWeight: 600, color: T.text,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {p.title || p.doi}
                  </div>
                  <div style={{ fontSize: 11.5, color: T.mu, marginTop: 1 }}>
                    {p.journal || '—'}
                  </div>
                </div>
                <div style={{ fontSize: 12, color: T.mu, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {p.participants} researchers
                </div>
                <div style={{ fontSize: 12, color: T.mu, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {p.posts} posts
                </div>
                <div style={{ fontSize: 12, color: T.mu, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                  {p.total_comments} comments
                </div>
              </div>
            ))}
          </div>
        )}
        <PostHogLinks items={[
          { label: 'Feature adoption trends' },
          { label: 'Lumens earned events' },
          { label: 'Board dismissed events' },
        ]}/>
      </SectionCard>
    </div>
  );
}
