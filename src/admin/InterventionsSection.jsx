import React, { useState } from 'react';
import { T } from '../lib/constants';
import ComposeTab from './interventions/ComposeTab';
import BoardTab from './interventions/BoardTab';
import PaperOfWeekTab from './interventions/PaperOfWeekTab';
import MilestoneTab from './interventions/MilestoneTab';

const TABS = [
  { id: 'compose',  label: '📢 Compose',       desc: 'Send posts as Luminary Team'   },
  { id: 'board',    label: '📋 Luminary Board', desc: 'Sidebar message to all users'  },
  { id: 'potw',     label: '📄 Paper of Week',  desc: 'Sidebar featured paper config' },
  { id: 'milestone',label: '🎉 Milestone post', desc: 'Profile completion card copy'  },
];

export default function InterventionsSection({ supabase, user }) {
  const [tab, setTab] = useState('compose');

  return (
    <div>
      <h1 style={{ fontFamily: "'DM Serif Display', serif", fontSize: 32, color: T.text, margin: '0 0 6px' }}>
        Interventions
      </h1>
      <div style={{ fontSize: 13, color: T.mu, marginBottom: 24 }}>
        Control what users see — posts, sidebar cards, and profile milestones.
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '8px 16px', borderRadius: 9, border: 'none',
            background: tab === t.id ? T.v2 : T.w,
            color: tab === t.id ? T.v3 : T.text,
            fontWeight: tab === t.id ? 700 : 500,
            fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            border: `1px solid ${tab === t.id ? T.v : T.bdr}`,
          }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'compose'   && <ComposeTab supabase={supabase} user={user} />}
      {tab === 'board'     && <BoardTab supabase={supabase} />}
      {tab === 'potw'      && <PaperOfWeekTab supabase={supabase} />}
      {tab === 'milestone' && <MilestoneTab supabase={supabase} />}
    </div>
  );
}
