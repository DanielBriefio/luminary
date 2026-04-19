import { T } from '../lib/constants';

const ICONS = {
  feed:    "M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  explore: "M11 11m-7 0a7 7 0 1 0 14 0a7 7 0 1 0-14 0 M21 21l-4.35-4.35",
  post:    "M12 5v14 M5 12h14",
  groups:  "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2 M23 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  profile: "M12 8a4 4 0 1 0 0-8 4 4 0 0 0 0 8z M4 20c0-4 3.6-7 8-7s8 3 8 7",
};

const TABS = [
  { id: 'feed',    label: 'Home',    icon: ICONS.feed },
  { id: 'explore', label: 'Explore', icon: ICONS.explore },
  { id: 'post',    label: 'Post',    icon: ICONS.post, isCenter: true },
  { id: 'groups',  label: 'Groups',  icon: ICONS.groups },
  { id: 'profile', label: 'Profile', icon: ICONS.profile },
];

export default function BottomNav({ screen, setScreen, groupUnreadCount = 0 }) {
  return (
    <div style={{
      position: 'fixed', bottom: 0, left: 0, right: 0,
      height: 60,
      paddingBottom: 'env(safe-area-inset-bottom)',
      background: T.w,
      borderTop: `1px solid ${T.bdr}`,
      display: 'flex',
      zIndex: 200,
    }}>
      {TABS.map(tab => {
        const active = screen === tab.id;
        const isCenter = tab.isCenter;
        return (
          <button
            key={tab.id}
            onClick={() => setScreen(tab.id)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              gap: 3, border: 'none', background: 'transparent',
              cursor: 'pointer', padding: 0, position: 'relative',
              color: active ? T.v : T.mu,
            }}
          >
            {isCenter ? (
              <div style={{
                width: 44, height: 44, borderRadius: '50%',
                background: T.v, display: 'flex', alignItems: 'center',
                justifyContent: 'center', marginTop: -16,
                boxShadow: '0 4px 14px rgba(108,99,255,.45)',
              }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
                  stroke="#fff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d={tab.icon}/>
                </svg>
              </div>
            ) : (
              <>
                <div style={{ position: 'relative' }}>
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none"
                    stroke="currentColor" strokeWidth={active ? 2.2 : 1.7}
                    strokeLinecap="round" strokeLinejoin="round">
                    <path d={tab.icon}/>
                  </svg>
                  {tab.id === 'groups' && groupUnreadCount > 0 && (
                    <span style={{
                      position: 'absolute', top: -3, right: -5,
                      fontSize: 9, fontWeight: 700, background: T.ro, color: '#fff',
                      padding: '1px 4px', borderRadius: 20, minWidth: 14,
                      textAlign: 'center', lineHeight: '14px',
                    }}>
                      {groupUnreadCount > 9 ? '9+' : groupUnreadCount}
                    </span>
                  )}
                </div>
                <span style={{ fontSize: 10, fontWeight: active ? 700 : 500 }}>
                  {tab.label}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>
  );
}
