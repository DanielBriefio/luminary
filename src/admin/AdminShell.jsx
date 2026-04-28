import React, { useState } from 'react';
import { T } from '../lib/constants';
import OverviewSection from './OverviewSection';
import InvitesSection from './InvitesSection';
import TemplatesSection from './TemplatesSection';
import UsersSection from './UsersSection';
import InboxSection from './InboxSection';
import ContentSection from './ContentSection';
import InterventionsSection from './InterventionsSection';
import StorageSection from './StorageSection';
import AnalyticsSection from './AnalyticsSection';

const NAV_ITEMS = [
  { id: 'overview',      label: 'Overview',      icon: '📊' },
  { id: 'users',         label: 'Users',         icon: '👥' },
  { id: 'invites',       label: 'Invites',       icon: '🎟️' },
  { id: 'templates',     label: 'Templates',     icon: '📋' },
  { id: 'content',       label: 'Content',       icon: '🗂️' },
  { id: 'interventions', label: 'Interventions', icon: '⚡' },
  { id: 'storage',       label: 'Storage',       icon: '💾' },
  { id: 'inbox',         label: 'Inbox',         icon: '💬' },
  { id: 'analytics',     label: 'Analytics',     icon: '📈' },
];

export default function AdminShell({ supabase, user, profile }) {
  const [section, setSection]             = useState('overview');
  const [sectionParams, setSectionParams] = useState({});

  const navigate = (newSection, params = {}) => {
    setSection(newSection);
    setSectionParams(params);
  };

  return (
    <div style={{
      display: 'flex',
      height: '100vh',
      overflow: 'hidden',
      background: T.bg,
    }}>
      {/* Left nav */}
      <div style={{
        width: 220,
        background: T.w,
        borderRight: `1px solid ${T.bdr}`,
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 14px',
        flexShrink: 0,
      }}>
        {/* Logo + ADMIN badge */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginBottom: 28,
          padding: '0 6px',
        }}>
          <div style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 22,
            color: T.text,
          }}>
            Luminary
          </div>
          <div style={{
            fontSize: 10,
            fontWeight: 700,
            padding: '2px 7px',
            borderRadius: 20,
            background: T.v2,
            color: T.v3,
            letterSpacing: 0.3,
          }}>
            ADMIN
          </div>
        </div>

        {/* Nav items */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
          {NAV_ITEMS.map((item) => {
            const active = section === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 12px',
                  borderRadius: 9,
                  border: 'none',
                  background: active ? T.v2 : 'transparent',
                  color: active ? T.v3 : T.text,
                  fontWeight: active ? 600 : 500,
                  fontSize: 14,
                  cursor: 'pointer',
                  textAlign: 'left',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ fontSize: 16 }}>{item.icon}</span>
                {item.label}
              </button>
            );
          })}
        </div>

        {/* Footer: identity + exit */}
        <div style={{
          marginTop: 'auto',
          paddingTop: 16,
          borderTop: `1px solid ${T.bdr}`,
          fontSize: 12,
          color: T.mu,
        }}>
          <div style={{ marginBottom: 8 }}>
            Signed in as<br/>
            <span style={{ color: T.text, fontWeight: 600 }}>
              {profile?.name || user?.email}
            </span>
          </div>
          <a href="/" style={{
            fontSize: 12,
            color: T.v,
            textDecoration: 'none',
            fontWeight: 600,
          }}>
            ← Back to app
          </a>
        </div>
      </div>

      {/* Main content area — inbox has no padding and needs overflow:hidden for its own scroll */}
      <div style={{
        flex: 1,
        overflow: section === 'inbox' ? 'hidden' : 'auto',
        padding: section === 'inbox' ? 0 : '28px 32px',
      }}>
        {section === 'overview'
          ? <OverviewSection supabase={supabase} onNavigate={navigate} />
          : section === 'users'
          ? <UsersSection supabase={supabase} user={user} initialParams={sectionParams} />
          : section === 'invites'
          ? <InvitesSection supabase={supabase} />
          : section === 'templates'
          ? <TemplatesSection supabase={supabase} />
          : section === 'content'
          ? <ContentSection supabase={supabase} />
          : section === 'interventions'
          ? <InterventionsSection supabase={supabase} user={user} />
          : section === 'storage'
          ? <StorageSection supabase={supabase} />
          : section === 'inbox'
          ? <InboxSection supabase={supabase} />
          : section === 'analytics'
          ? <AnalyticsSection supabase={supabase} />
          : <AdminSectionPlaceholder section={section} />
        }
      </div>
    </div>
  );
}

function AdminSectionPlaceholder({ section }) {
  const LABELS = {
    overview:  'Overview',
    users:     'Users',
    invites:   'Invites',
    inbox:     'Inbox',
    analytics: 'Analytics',
  };
  const title = LABELS[section] || 'Overview';

  return (
    <div>
      <h1 style={{
        fontFamily: "'DM Serif Display', serif",
        fontSize: 32,
        color: T.text,
        margin: '0 0 6px',
      }}>
        {title}
      </h1>
      <div style={{
        fontSize: 13,
        color: T.mu,
        marginBottom: 24,
      }}>
        Admin Panel — {title}
      </div>

      <div style={{
        background: T.w,
        border: `1px solid ${T.bdr}`,
        borderRadius: 12,
        padding: '40px 24px',
        textAlign: 'center',
      }}>
        <div style={{ fontSize: 32, marginBottom: 10 }}>🚧</div>
        <div style={{
          fontSize: 16,
          fontFamily: "'DM Serif Display', serif",
          color: T.text,
          marginBottom: 6,
        }}>
          Coming soon
        </div>
        <div style={{ fontSize: 13, color: T.mu }}>
          This section will be built in a future task.
        </div>
      </div>
    </div>
  );
}
