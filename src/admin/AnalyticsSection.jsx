import { useState } from 'react';
import { T } from '../lib/constants';
import HealthTab    from './analytics/HealthTab';
import GrowthTab    from './analytics/GrowthTab';
import ProductTab   from './analytics/ProductTab';
import BehaviourTab from './analytics/BehaviourTab';
import TimeRangePicker from './analytics/components/TimeRangePicker';

const TABS = [
  { id: 'health',    label: 'Health',    icon: '🩺', question: 'Is this working?' },
  { id: 'growth',    label: 'Growth',    icon: '📈', question: 'Who is joining?' },
  { id: 'product',   label: 'Product',   icon: '🧩', question: 'Which features matter?' },
  { id: 'behaviour', label: 'Behaviour', icon: '👥', question: 'Who to engage with?' },
];

export default function AnalyticsSection({ supabase }) {
  const [tab, setTab]   = useState('health');
  const [days, setDays] = useState(30);
  const active = TABS.find(t => t.id === tab) || TABS[0];

  return (
    <div>
      <div style={{
        display: 'flex', alignItems: 'baseline',
        justifyContent: 'space-between', gap: 16,
        flexWrap: 'wrap', marginBottom: 4,
      }}>
        <h1 style={{
          fontFamily: "'DM Serif Display', serif",
          fontSize: 32, color: T.text, margin: 0,
        }}>
          Analytics
        </h1>
        <TimeRangePicker value={days} onChange={setDays}/>
      </div>
      <div style={{ fontSize: 13, color: T.mu, marginBottom: 22 }}>
        {active.question} — decision support, not wallpaper.
      </div>

      {/* Tab bar */}
      <div style={{
        display: 'flex', gap: 4, marginBottom: 18,
        background: T.s2, border: `1px solid ${T.bdr}`,
        borderRadius: 10, padding: 4, width: 'fit-content',
        flexWrap: 'wrap',
      }}>
        {TABS.map(t => {
          const isActive = tab === t.id;
          return (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              style={{
                padding: '8px 14px', borderRadius: 7, border: 'none',
                background: isActive ? T.w : 'transparent',
                color: isActive ? T.text : T.mu,
                fontWeight: isActive ? 700 : 600, fontSize: 13,
                fontFamily: 'inherit', cursor: 'pointer',
                display: 'flex', alignItems: 'center', gap: 7,
                boxShadow: isActive ? '0 1px 4px rgba(0,0,0,.06)' : 'none',
              }}
            >
              <span>{t.icon}</span>
              {t.label}
            </button>
          );
        })}
      </div>

      {tab === 'health'    && <HealthTab    supabase={supabase} days={days}/>}
      {tab === 'growth'    && <GrowthTab    supabase={supabase} days={days}/>}
      {tab === 'product'   && <ProductTab   supabase={supabase} days={days}/>}
      {tab === 'behaviour' && <BehaviourTab supabase={supabase} days={days}/>}
    </div>
  );
}
