import React, { useState, useEffect } from 'react';
import {
  T, TIER_CONFIG, TIER_ORDER, getTierFromLumens, getNextTier,
} from '../lib/constants';
import Spinner from '../components/Spinner';

const REASON_LABELS = {
  post_created:         { label: 'You created a post',               icon: '✏️' },
  comment_posted:       { label: 'You commented on a post',          icon: '💬' },
  library_item_added:   { label: 'You added to your library',        icon: '📚' },
  group_created:        { label: 'You created a group',              icon: '👥' },
  project_created:      { label: 'You created a project',            icon: '🗂️' },
  onboarding_completed: { label: 'You completed onboarding',         icon: '✓'  },
  comment_received:     { label: 'Your post received a comment',     icon: '💬' },
  library_saved:        { label: 'Your library item was saved',      icon: '🔖' },
  post_reposted:        { label: 'Your post was reposted',           icon: '↻'  },
  invited_user_active:  { label: 'A user you invited became active', icon: '🎟️' },
  post_featured:        { label: 'Your post was featured',           icon: '✦'  },
  template_approved:    { label: 'Your template was approved',       icon: '📋' },
  discussion_threshold: { label: 'Your post sparked a discussion',   icon: '🔥' },
};

const RULES = [
  {
    category: 'Creation',
    description: 'Lumens for adding content to the platform',
    items: [
      { label: 'Create a post',       amount: 5  },
      { label: 'Comment on a post',   amount: 2  },
      { label: 'Add to your library', amount: 1  },
      { label: 'Create a group',      amount: 25 },
      { label: 'Create a project',    amount: 10 },
      { label: 'Complete onboarding', amount: 25, oneTime: true },
    ],
  },
  {
    category: 'Engagement',
    description: 'Lumens earned when others engage with your contributions',
    items: [
      { label: 'A user comments on your post (first time per user)', amount: 5 },
      { label: 'A user saves your library item',                    amount: 5 },
    ],
  },
  {
    category: 'Recognition',
    description: 'Lumens for influence and quality contributions',
    items: [
      { label: 'Your post is reposted',                         amount: 10  },
      { label: 'A user you invited becomes active',             amount: 100 },
      { label: 'Your post is featured by Luminary',             amount: 100 },
      { label: 'Your community template is approved',           amount: 50  },
      { label: 'Your post sparks a discussion (3+ commenters)', amount: 50  },
    ],
  },
];

export default function LumensScreen({ supabase, user, profile, onBack }) {
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: result } = await supabase.rpc('get_lumen_history', { p_limit: 50 });
      if (!cancelled) {
        setData(result);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [supabase]);

  if (loading) {
    return <div style={{ padding: 60, textAlign: 'center' }}><Spinner /></div>;
  }

  const lumens     = data?.current_period_lumens || 0;
  const tier       = data?.tier || getTierFromLumens(lumens);
  const tierConfig = TIER_CONFIG[tier];
  const next       = getNextTier(tier);
  const nextConfig = next ? TIER_CONFIG[next] : null;
  const periodStart = new Date(data?.current_period_started || Date.now());
  const periodEnd   = new Date(periodStart);
  periodEnd.setFullYear(periodEnd.getFullYear() + 1);

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '24px 32px 60px' }}>

      {/* Tier hero card */}
      <div style={{
        background: `linear-gradient(135deg, ${tierConfig.color}15 0%, ${tierConfig.color}05 100%)`,
        border: `2px solid ${tierConfig.color}`,
        borderRadius: 16,
        padding: '28px 32px',
        marginBottom: 24,
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{
          position: 'absolute', top: -20, right: -20,
          width: 120, height: 120, borderRadius: '50%',
          background: tierConfig.color, opacity: 0.08,
        }}/>

        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          padding: '4px 12px', borderRadius: 20,
          background: tierConfig.bg, color: tierConfig.color,
          fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
          textTransform: 'uppercase', marginBottom: 12,
        }}>
          ✦ {tierConfig.name}
        </div>

        {data?.is_founding_member && (
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 6,
            padding: '4px 12px', borderRadius: 20,
            background: '#1A1B2E10', color: '#1A1B2E',
            fontSize: 12, fontWeight: 700, letterSpacing: 0.5,
            textTransform: 'uppercase', marginBottom: 12, marginLeft: 6,
          }}>
            ★ Founding Member
          </div>
        )}

        <h1 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 36, color: T.text, margin: '0 0 4px',
        }}>
          {lumens.toLocaleString()} Lumens
        </h1>

        <p style={{ fontSize: 14, color: T.mu, margin: '0 0 18px' }}>
          This period · ends {periodEnd.toLocaleDateString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          })}
        </p>

        <p style={{
          fontSize: 15, color: T.text, lineHeight: 1.6,
          margin: '0 0 18px', maxWidth: 560,
        }}>
          {tierConfig.description}
        </p>

        {next && (
          <div>
            <div style={{
              display: 'flex', justifyContent: 'space-between',
              fontSize: 12, color: T.mu, marginBottom: 6,
            }}>
              <span>{tierConfig.name}</span>
              <span style={{ fontWeight: 700 }}>
                {(nextConfig.min - lumens).toLocaleString()} to {nextConfig.name}
              </span>
              <span>{nextConfig.name}</span>
            </div>
            <div style={{
              height: 8, background: T.bdr, borderRadius: 4, overflow: 'hidden',
            }}>
              <div style={{
                height: '100%',
                width: `${Math.min(100, ((lumens - tierConfig.min) / (nextConfig.min - tierConfig.min)) * 100)}%`,
                background: `linear-gradient(90deg, ${tierConfig.color}, ${nextConfig.color})`,
                transition: 'width 0.5s ease',
              }}/>
            </div>
          </div>
        )}
      </div>

      {/* Tier ladder */}
      <div style={{
        background: T.w, border: `1px solid ${T.bdr}`,
        borderRadius: 12, padding: '20px 24px', marginBottom: 24,
      }}>
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20, color: T.text, margin: '0 0 16px',
        }}>
          The four tiers
        </h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {TIER_ORDER.map(t => {
            const config    = TIER_CONFIG[t];
            const isCurrent = t === tier;
            return (
              <div key={t} style={{
                padding: '14px 16px', borderRadius: 10,
                border: `2px solid ${isCurrent ? config.color : T.bdr}`,
                background: isCurrent ? config.bg : T.w,
              }}>
                <div style={{
                  fontSize: 11, fontWeight: 700, letterSpacing: 0.5,
                  textTransform: 'uppercase', color: config.color, marginBottom: 4,
                }}>
                  ✦ {config.name}
                </div>
                <div style={{ fontSize: 13, color: T.text, fontWeight: 600 }}>
                  {config.min.toLocaleString()}
                  {config.max !== null ? ` – ${config.max.toLocaleString()}` : '+'}
                </div>
                <div style={{ fontSize: 11, color: T.mu }}>Lumens</div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Earning rules */}
      <div style={{
        background: T.w, border: `1px solid ${T.bdr}`,
        borderRadius: 12, padding: '20px 24px', marginBottom: 24,
      }}>
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20, color: T.text, margin: '0 0 6px',
        }}>
          How Lumens are earned
        </h2>
        <p style={{ fontSize: 13, color: T.mu, margin: '0 0 18px' }}>
          Three ways: by creating, by being engaged with, and by being recognised.
          Recognition counts more than creation.
        </p>

        {RULES.map(category => (
          <div key={category.category} style={{ marginBottom: 18 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 4 }}>
              {category.category}
            </div>
            <div style={{ fontSize: 12, color: T.mu, marginBottom: 10 }}>
              {category.description}
            </div>
            {category.items.map((item, i) => (
              <div key={i} style={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                padding: '8px 0',
                borderBottom: i < category.items.length - 1 ? `1px solid ${T.bdr}` : 'none',
              }}>
                <div style={{ fontSize: 13.5, color: T.text }}>
                  {item.label}
                  {item.oneTime && (
                    <span style={{
                      marginLeft: 8, fontSize: 11, color: T.mu, fontStyle: 'italic',
                    }}>
                      one-time
                    </span>
                  )}
                </div>
                <div style={{
                  fontSize: 14, fontWeight: 700, color: tierConfig.color,
                }}>
                  +{item.amount}
                </div>
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Recent earnings */}
      <div style={{
        background: T.w, border: `1px solid ${T.bdr}`,
        borderRadius: 12, padding: '20px 24px',
      }}>
        <h2 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 20, color: T.text, margin: '0 0 16px',
        }}>
          Recent earnings
        </h2>

        {(data?.transactions || []).length === 0 ? (
          <div style={{
            padding: '40px 20px', textAlign: 'center',
            color: T.mu, fontSize: 14,
          }}>
            No Lumens earned yet. Start by creating your first post or
            joining a discussion.
          </div>
        ) : (
          <div>
            {data.transactions.map(tx => {
              const info = REASON_LABELS[tx.reason] || { label: tx.reason, icon: '•' };
              return (
                <div key={tx.id} style={{
                  display: 'flex', alignItems: 'center', gap: 12,
                  padding: '10px 0', borderBottom: `1px solid ${T.bdr}`,
                }}>
                  <div style={{ fontSize: 20, flexShrink: 0, width: 28, textAlign: 'center' }}>
                    {info.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13.5, color: T.text, fontWeight: 500 }}>
                      {info.label}
                    </div>
                    <div style={{ fontSize: 11, color: T.mu, textTransform: 'capitalize' }}>
                      {tx.category} · {new Date(tx.created_at).toLocaleDateString('en-US', {
                        month: 'short', day: 'numeric',
                      })}
                    </div>
                  </div>
                  <div style={{
                    fontSize: 14, fontWeight: 700, color: tierConfig.color,
                  }}>
                    +{tx.amount}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
