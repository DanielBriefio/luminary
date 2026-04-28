import { useEffect, useState } from 'react';
import { T } from '../../lib/constants';
import Spinner from '../../components/Spinner';
import StatCard from './components/StatCard';
import SectionCard from './components/SectionCard';
import SimpleBarChart from './components/SimpleBarChart';
import SimpleLineChart from './components/SimpleLineChart';
import PostHogLinks from './components/PostHogLinks';
import EmptyState from './components/EmptyState';

function formatPct(n) {
  if (n == null) return '—';
  return `${n}%`;
}
function retentionColor(pct, healthy, ok) {
  if (pct == null) return T.mu;
  if (pct >= healthy) return T.gr;
  if (pct >= ok) return T.am;
  return T.ro;
}

export default function HealthTab({ supabase }) {
  const [loading, setLoading]   = useState(true);
  const [stats, setStats]       = useState(null);
  const [funnel, setFunnel]     = useState([]);
  const [retention, setRet]     = useState(null);
  const [weekly, setWeekly]     = useState([]);
  const [dau, setDau]           = useState([]);
  const [err, setErr]           = useState('');

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [statsR, funR, retR, wkR, dauR] = await Promise.all([
        supabase.rpc('get_platform_stats'),
        supabase.rpc('get_user_activation_stages'),
        supabase.rpc('get_retention_cohorts'),
        supabase.rpc('get_weekly_signups'),
        supabase.rpc('get_daily_active_users'),
      ]);
      const firstErr = [statsR, funR, retR, wkR, dauR].find(r => r.error);
      if (firstErr) setErr(firstErr.error.message);
      setStats(statsR.data);
      setFunnel(funR.data || []);
      setRet(retR.data);
      setWeekly(wkR.data || []);
      setDau(dauR.data || []);
      setLoading(false);
    })();
  }, [supabase]);

  if (loading) return <div style={{ padding: 60, textAlign: 'center' }}><Spinner/></div>;

  return (
    <div>
      {err && (
        <div style={{
          background: T.ro2, border: `1px solid ${T.ro}`, borderRadius: 10,
          padding: '10px 14px', fontSize: 13, color: T.ro, marginBottom: 14,
        }}>{err}</div>
      )}

      {/* Stat cards */}
      <div style={{
        display: 'grid', gap: 12, marginBottom: 18,
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
      }}>
        <StatCard
          label="Total users"
          value={stats?.users ?? 0}
          sub={`${stats?.users_today ?? 0} new today`}
        />
        <StatCard
          label="Posts"
          value={stats?.posts ?? 0}
          sub={`${stats?.posts_today ?? 0} new today`}
        />
        <StatCard
          label="Groups"
          value={stats?.groups ?? 0}
          sub={`${stats?.groups_today ?? 0} new today`}
        />
        <StatCard
          label="Projects"
          value={stats?.projects ?? 0}
          sub={`${stats?.projects_today ?? 0} new today`}
        />
      </div>

      {/* Retention */}
      <SectionCard
        title="Retention"
        subtitle="Of users who signed up X days ago, what fraction came back?"
      >
        <div style={{
          display: 'grid', gap: 14,
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        }}>
          {['d7', 'd30'].map(key => {
            const r = retention?.[key];
            const isD7 = key === 'd7';
            const benchmark = isD7 ? '≥30% healthy' : '≥20% healthy';
            const color = retentionColor(r?.pct, isD7 ? 30 : 20, isD7 ? 15 : 10);
            return (
              <div key={key} style={{
                background: T.s2, border: `1px solid ${T.bdr}`,
                borderRadius: 10, padding: '14px 16px',
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, color: T.mu,
                  letterSpacing: 0.4, textTransform: 'uppercase',
                }}>
                  {isD7 ? 'D7 retention' : 'D30 retention'}
                </div>
                {r?.cohort_size === 0 ? (
                  <div style={{ fontSize: 12.5, color: T.mu, marginTop: 8, fontStyle: 'italic' }}>
                    {isD7 ? 'No users signed up 7-14 days ago yet.'
                          : 'No users signed up 30-60 days ago yet.'}
                  </div>
                ) : (
                  <>
                    <div style={{
                      fontFamily: "'DM Serif Display', serif",
                      fontSize: 30, color, lineHeight: 1.1, marginTop: 4,
                    }}>
                      {formatPct(r?.pct)}
                    </div>
                    <div style={{ fontSize: 12, color: T.mu, marginTop: 4 }}>
                      {r?.retained ?? 0} of {r?.cohort_size ?? 0} returned
                    </div>
                    <div style={{ fontSize: 11, color: T.mu, marginTop: 6, fontStyle: 'italic' }}>
                      {benchmark}
                    </div>
                  </>
                )}
              </div>
            );
          })}
        </div>
      </SectionCard>

      {/* Activation funnel */}
      <SectionCard
        title="Activation funnel"
        subtitle="Where users drop off on the path from signup to visible profile"
      >
        {funnel.length === 0 ? (
          <EmptyState message="No users yet."/>
        ) : (
          <div>
            {funnel.map((stage, i) => {
              const total    = funnel[0]?.count || 1;
              const pct      = Math.round((stage.count / total) * 100);
              const prevCnt  = i === 0 ? null : funnel[i - 1].count;
              const dropOff  = (prevCnt && prevCnt > 0)
                                 ? Math.round(100 - (stage.count / prevCnt) * 100)
                                 : null;
              return (
                <div key={stage.stage} style={{ marginBottom: 10 }}>
                  <div style={{
                    display: 'flex', alignItems: 'baseline',
                    justifyContent: 'space-between', marginBottom: 4,
                  }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
                      {stage.stage}
                    </div>
                    <div style={{ fontSize: 12, color: T.mu, fontVariantNumeric: 'tabular-nums' }}>
                      {stage.count} · {pct}%
                      {dropOff != null && dropOff > 0 && (
                        <span style={{ marginLeft: 8, color: T.ro }}>
                          −{dropOff}%
                        </span>
                      )}
                    </div>
                  </div>
                  <div style={{
                    width: '100%', height: 8, borderRadius: 99,
                    background: T.s3, overflow: 'hidden',
                  }}>
                    <div style={{
                      width: `${pct}%`, height: '100%', background: T.v,
                    }}/>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </SectionCard>

      {/* Weekly signups */}
      <SectionCard title="Weekly signups" subtitle="Cumulative growth, last 12 weeks">
        {weekly.length === 0 ? (
          <EmptyState message="No signup data yet."/>
        ) : weekly.every(w => w.count === 0) ? (
          <EmptyState message="No signups in the last 12 weeks."/>
        ) : (
          <SimpleLineChart
            data={weekly.map(w => ({
              ...w,
              week_label: w.week_start.slice(5),
            }))}
            xKey="week_label"
            yKey="cumulative"
            label="Cumulative users"
            height={220}
          />
        )}
      </SectionCard>

      {/* DAU */}
      <SectionCard
        title="Daily active users"
        subtitle="Posted, commented, or liked. Last 30 days"
      >
        {dau.length === 0 ? (
          <EmptyState message="No activity data yet."/>
        ) : dau.every(d => d.count === 0) ? (
          <EmptyState message="No activity in the last 30 days."/>
        ) : (
          <SimpleBarChart
            data={dau.map(d => ({ ...d, day_label: d.day.slice(5) }))}
            xKey="day_label"
            yKey="count"
            label="Active users"
            height={200}
          />
        )}
        <PostHogLinks items={[
          { label: 'Retention chart' },
          { label: 'Activation funnel' },
          { label: 'Live events' },
        ]}/>
      </SectionCard>
    </div>
  );
}
