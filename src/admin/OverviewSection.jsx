import React, { useState, useEffect } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip,
  ResponsiveContainer
} from 'recharts';
import { T } from '../lib/constants';
import Spinner from '../components/Spinner';

export default function OverviewSection({ supabase, onNavigate }) {
  const [stats, setStats]           = useState(null);
  const [sparklines, setSparklines] = useState([]);
  const [alerts, setAlerts]         = useState(null);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    const load = async () => {
      const [statsRes, sparkRes, alertsRes] = await Promise.all([
        supabase.rpc('get_platform_stats'),
        supabase.rpc('get_activity_sparklines'),
        supabase.rpc('get_at_risk_alerts'),
      ]);
      setStats(statsRes.data);
      setSparklines(sparkRes.data || []);
      setAlerts(alertsRes.data);
      setLoading(false);
    };
    load();
  }, [supabase]);

  if (loading) {
    return (
      <div style={{ padding: 60, textAlign: 'center' }}>
        <Spinner />
      </div>
    );
  }

  return (
    <div>
      {/* Header */}
      <h1 style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: 32, color: T.text, margin: '0 0 24px',
      }}>
        Overview
      </h1>

      {/* Stat cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: 12, marginBottom: 24,
      }}>
        {[
          { label: 'Users',    value: stats?.users,    today: stats?.users_today,    color: T.v  },
          { label: 'Posts',    value: stats?.posts,    today: stats?.posts_today,    color: T.gr },
          { label: 'Groups',   value: stats?.groups,   today: stats?.groups_today,   color: T.bl },
          { label: 'Projects', value: stats?.projects, today: stats?.projects_today, color: T.am },
        ].map(card => (
          <StatCard key={card.label} {...card} />
        ))}
      </div>

      {/* Sparklines */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: 12, marginBottom: 24,
      }}>
        {[
          { label: 'Posts per day',      key: 'posts',         color: T.v  },
          { label: 'New users per day',  key: 'new_users',     color: T.gr },
          { label: 'Comments per day',   key: 'comments',      color: T.bl },
          { label: 'Library items added', key: 'library_items', color: T.am },
        ].map(chart => (
          <SparklineCard
            key={chart.key}
            label={chart.label}
            dataKey={chart.key}
            color={chart.color}
            data={sparklines}
          />
        ))}
      </div>

      {/* Bottom row: at-risk alerts + PostHog */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        gap: 12,
      }}>
        <AtRiskAlerts alerts={alerts} onNavigate={onNavigate} />
        <PostHogCard />
      </div>
    </div>
  );
}

// ─── StatCard ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, today, color }) {
  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`,
      borderRadius: 12, padding: '18px 20px',
      borderTop: `3px solid ${color}`,
    }}>
      <div style={{
        fontSize: 36, fontWeight: 700,
        fontFamily: "'DM Serif Display', serif",
        color: T.text, lineHeight: 1, marginBottom: 4,
      }}>
        {(value ?? 0).toLocaleString()}
      </div>
      <div style={{
        display: 'flex', alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ fontSize: 13, color: T.mu }}>{label}</div>
        {today > 0 && (
          <div style={{
            fontSize: 12, fontWeight: 700,
            color: color,
            background: color + '22',
            padding: '2px 8px', borderRadius: 20,
          }}>
            +{today} today
          </div>
        )}
      </div>
    </div>
  );
}

// ─── SparklineCard ────────────────────────────────────────────────────────────

function SparklineCard({ label, dataKey, color, data }) {
  const formatDate = (str) => {
    if (!str) return '';
    const d = new Date(str);
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  };

  const tickFormatter = (str, index) =>
    index % 7 === 0 ? formatDate(str) : '';

  const maxVal = Math.max(...data.map(d => d[dataKey] || 0), 1);

  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`,
      borderRadius: 12, padding: '16px 20px',
    }}>
      <div style={{
        fontSize: 13, fontWeight: 600, color: T.text, marginBottom: 12,
      }}>
        {label}
        <span style={{
          fontSize: 20, fontWeight: 700,
          fontFamily: "'DM Serif Display', serif",
          color: color, marginLeft: 10,
        }}>
          {data.reduce((sum, d) => sum + (d[dataKey] || 0), 0)}
        </span>
        <span style={{ fontSize: 11, color: T.mu, marginLeft: 4 }}>
          last 30 days
        </span>
      </div>

      <ResponsiveContainer width="100%" height={80}>
        <AreaChart data={data} margin={{ top: 2, right: 0, left: -30, bottom: 0 }}>
          <defs>
            <linearGradient id={`grad-${dataKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor={color} stopOpacity={0.18} />
              <stop offset="95%" stopColor={color} stopOpacity={0}    />
            </linearGradient>
          </defs>
          <XAxis
            dataKey="date"
            tickFormatter={tickFormatter}
            tick={{ fontSize: 10, fill: T.mu }}
            axisLine={false}
            tickLine={false}
          />
          <YAxis
            domain={[0, maxVal]}
            tick={{ fontSize: 10, fill: T.mu }}
            axisLine={false}
            tickLine={false}
            allowDecimals={false}
          />
          <Tooltip
            contentStyle={{
              background: T.w, border: `1px solid ${T.bdr}`,
              borderRadius: 8, fontSize: 12,
            }}
            labelFormatter={formatDate}
            formatter={(val) => [val, label]}
          />
          <Area
            type="monotone"
            dataKey={dataKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#grad-${dataKey})`}
            dot={false}
            activeDot={{ r: 4, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

// ─── AtRiskAlerts ─────────────────────────────────────────────────────────────

function AtRiskAlerts({ alerts, onNavigate }) {
  if (!alerts) return null;

  const items = [
    {
      count:   alerts.ghost_users,
      level:   'red',
      label:   'users signed up 2–5 days ago with zero interaction',
      action:  'Review in Users →',
      onClick: () => onNavigate('users', { ghostFilter: 'stuck' }),
      live:    true,
    },
    {
      count:   alerts.quiet_groups,
      level:   'yellow',
      label:   'groups with no posts in the last 7 days',
      action:  'Content management (coming soon)',
      onClick: null,
      live:    false,
    },
    {
      count:   alerts.pending_templates,
      level:   'yellow',
      label:   'community template submissions pending review',
      action:  'Review templates →',
      onClick: () => onNavigate('templates'),
      live:    true,
    },
  ];

  const hasAlerts = items.some(i => i.count > 0);

  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`,
      borderRadius: 12, padding: '18px 20px',
    }}>
      <div style={{
        fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 14,
      }}>
        ⚠️ At-risk alerts
      </div>

      {!hasAlerts ? (
        <div style={{
          textAlign: 'center', padding: '20px 0',
          fontSize: 13, color: T.mu,
        }}>
          <div style={{ fontSize: 28, marginBottom: 6 }}>✓</div>
          No alerts right now
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {items.filter(i => i.count > 0).map((item, idx) => (
            <div key={idx} style={{
              display: 'flex', alignItems: 'flex-start',
              gap: 10, padding: '10px 12px', borderRadius: 9,
              background: item.level === 'red' ? T.ro2 : T.am2,
              border: `1px solid ${item.level === 'red' ? T.ro : T.am}`,
            }}>
              <div style={{ fontSize: 16, lineHeight: 1.4, flexShrink: 0 }}>
                {item.level === 'red' ? '🔴' : '🟡'}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, color: T.text, marginBottom: 4 }}>
                  <span style={{ fontWeight: 700 }}>{item.count}</span>
                  {' '}{item.label}
                </div>
                {item.live && item.onClick ? (
                  <button
                    onClick={item.onClick}
                    style={{
                      fontSize: 12, color: T.v,
                      fontWeight: 600, background: 'transparent',
                      border: 'none', padding: 0, cursor: 'pointer',
                      fontFamily: 'inherit',
                    }}
                  >
                    {item.action}
                  </button>
                ) : (
                  <span style={{ fontSize: 12, color: T.mu, fontStyle: 'italic' }}>
                    {item.action}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PostHogCard ──────────────────────────────────────────────────────────────

function PostHogCard() {
  return (
    <div style={{
      background: T.w, border: `1px solid ${T.bdr}`,
      borderRadius: 12, padding: '18px 20px',
      display: 'flex', flexDirection: 'column',
    }}>
      <div style={{ fontSize: 14, fontWeight: 700, color: T.text, marginBottom: 6 }}>
        📊 PostHog Analytics
      </div>
      <div style={{
        fontSize: 13, color: T.mu, lineHeight: 1.6, marginBottom: 16, flex: 1,
      }}>
        Connect PostHog to see funnel analysis, session recordings,
        cohort retention, and feature adoption data. Free up to 1M
        events/month.
      </div>
      <div style={{
        background: T.s2, border: `1px dashed ${T.bdr}`,
        borderRadius: 9, padding: '20px',
        textAlign: 'center', marginBottom: 14,
        flex: 1,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ color: T.mu, fontSize: 13 }}>
          PostHog dashboard will appear here
          <br />
          once integration is configured.
        </div>
      </div>
      <a
        href="https://eu.posthog.com"
        target="_blank"
        rel="noopener noreferrer"
        style={{
          display: 'block', textAlign: 'center',
          padding: '9px 0', borderRadius: 9,
          border: `1px solid ${T.bdr}`, background: T.w,
          color: T.v, fontSize: 13, fontWeight: 600,
          textDecoration: 'none',
        }}
      >
        Open PostHog →
      </a>
    </div>
  );
}
