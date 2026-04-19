# Task: Mobile nav restructure + post card improvements

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task covers four areas:
1. Mobile navigation restructure — hybrid bottom nav + hamburger drawer
2. QR code icon replacement in top bar
3. Post card improvements — mobile compact mode, desktop taxonomy refinement
4. Taxonomy chips — hide on mobile, smaller on desktop, editable, remove post/paper badges

Throughout this task, "mobile" means window.innerWidth < 768.
Use a hook or inline check — the app has no CSS files.

```javascript
// Add this hook to src/lib/utils.js or use inline:
export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState(window.innerWidth < 768);
  React.useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 768);
    window.addEventListener('resize', handler);
    return () => window.removeEventListener('resize', handler);
  }, []);
  return isMobile;
}
```

---

## Part 1 — Mobile navigation restructure

### Current state
Bottom nav: Home | Explore | + | Alerts | Profile
Top bar: Luminary wordmark | ✉️ Messages | 🔲 QR | ↩️ (unknown)

### Target state
Bottom nav: 🏠 Home | 🔍 Explore | ✚ | 👥 Groups | 👤 Profile
Top bar: ☰ Luminary wordmark · 🔔 Alerts (with badge) · 💬 Messages · 🪪 QR

Hamburger drawer contains: Library (placeholder), Network, Settings, Sign out

---

### 1a — Bottom nav changes (mobile only)

In `App.jsx`, update the mobile bottom nav to show 5 items:
- Home
- Explore
- + (new post — centred, large violet circle, unchanged)
- Groups
- Profile

Remove Alerts from bottom nav — it moves to the top bar.

```jsx
// Mobile bottom nav items (replace existing NAV array for mobile):
const MOBILE_NAV = [
  { id: 'feed',    label: 'Home',    icon: homeIconPath },
  { id: 'explore', label: 'Explore', icon: searchIconPath },
  { id: 'post',    label: '',        icon: null }, // centre + button
  { id: 'groups',  label: 'Groups',  icon: groupsIconPath },
  { id: 'profile', label: 'Profile', icon: profileIconPath },
];
```

The Groups nav item shows a badge count if there are unread group posts
(using the existing `groupUnreadCount` state):

```jsx
{item.id === 'groups' && groupUnreadCount > 0 && (
  <span style={{
    position: 'absolute', top: 2, right: 8,
    fontSize: 9, fontWeight: 700,
    background: T.ro, color: '#fff',
    padding: '1px 5px', borderRadius: 20,
    minWidth: 16, textAlign: 'center',
  }}>
    {groupUnreadCount > 9 ? '9+' : groupUnreadCount}
  </span>
)}
```

---

### 1b — Top bar restructure (mobile only)

The mobile top bar currently shows the wordmark + 3 icons.
Restructure to:

```
[☰ hamburger]  [Luminary wordmark]  [🔔 alerts]  [💬 messages]  [QR icon]
```

Left side: hamburger button (☰)
Centre: Luminary wordmark
Right side: three icon buttons — Alerts (with badge), Messages (with badge), QR code

```jsx
{isMobile && (
  <div style={{
    position: 'fixed', top: 0, left: 0, right: 0,
    height: 52, background: T.w,
    borderBottom: `1px solid ${T.bdr}`,
    display: 'flex', alignItems: 'center',
    padding: '0 12px', zIndex: 100,
    gap: 8,
  }}>
    {/* Hamburger */}
    <button onClick={() => setShowDrawer(true)} style={{
      width: 36, height: 36, border: 'none',
      background: 'transparent', cursor: 'pointer',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 5,
      flexShrink: 0,
    }}>
      {[0,1,2].map(i => (
        <div key={i} style={{
          width: 20, height: 2, background: T.text,
          borderRadius: 2,
        }}/>
      ))}
    </button>

    {/* Wordmark */}
    <div style={{
      flex: 1, textAlign: 'center',
      fontFamily: "'DM Serif Display', serif",
      fontSize: 20, fontWeight: 400,
    }}>
      Lumi<span style={{color: T.v}}>n</span>ary
    </div>

    {/* Alerts icon with badge */}
    <button onClick={() => setScreen('notifications')} style={{
      position: 'relative', width: 36, height: 36,
      border: 'none', background: 'transparent', cursor: 'pointer',
    }}>
      {/* Bell SVG */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={screen === 'notifications' ? T.v : T.mu} strokeWidth="1.8">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
      {unreadNotifications > 0 && (
        <span style={{
          position: 'absolute', top: 4, right: 4,
          width: 8, height: 8, borderRadius: '50%',
          background: T.ro,
        }}/>
      )}
    </button>

    {/* Messages icon with badge */}
    <button onClick={() => setScreen('messages')} style={{
      position: 'relative', width: 36, height: 36,
      border: 'none', background: 'transparent', cursor: 'pointer',
    }}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={screen === 'messages' ? T.v : T.mu} strokeWidth="1.8">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
      {unreadMessages > 0 && (
        <span style={{
          position: 'absolute', top: 4, right: 4,
          width: 8, height: 8, borderRadius: '50%',
          background: T.ro,
        }}/>
      )}
    </button>

    {/* QR code icon */}
    <button onClick={() => setShowCardQR(true)} style={{
      width: 36, height: 36, border: 'none',
      background: 'transparent', cursor: 'pointer',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      {/* Proper QR code SVG icon — four corner squares pattern */}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none"
        stroke={T.mu} strokeWidth="1.8">
        <rect x="3" y="3" width="7" height="7"/>
        <rect x="14" y="3" width="7" height="7"/>
        <rect x="3" y="14" width="7" height="7"/>
        <rect x="5" y="5" width="3" height="3" fill={T.mu} stroke="none"/>
        <rect x="16" y="5" width="3" height="3" fill={T.mu} stroke="none"/>
        <rect x="5" y="16" width="3" height="3" fill={T.mu} stroke="none"/>
        <line x1="14" y1="14" x2="14" y2="14"/>
        <line x1="17" y1="14" x2="21" y2="14"/>
        <line x1="14" y1="17" x2="14" y2="21"/>
        <line x1="17" y1="17" x2="21" y2="21"/>
        <line x1="21" y1="17" x2="17" y2="21"/>
      </svg>
    </button>
  </div>
)}
```

Add `paddingTop: 52` to the main content area on mobile to account
for the fixed top bar.

---

### 1c — Hamburger drawer

Add state: `const [showDrawer, setShowDrawer] = useState(false);`

Render the drawer as a fixed overlay sliding in from the left:

```jsx
{showDrawer && isMobile && (
  <>
    {/* Backdrop */}
    <div
      onClick={() => setShowDrawer(false)}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,.4)', zIndex: 200,
      }}
    />

    {/* Drawer */}
    <div style={{
      position: 'fixed', top: 0, left: 0, bottom: 0,
      width: 280, background: T.w, zIndex: 201,
      display: 'flex', flexDirection: 'column',
      boxShadow: '4px 0 24px rgba(0,0,0,.15)',
    }}>
      {/* User info at top */}
      <div style={{
        padding: '48px 20px 20px',
        borderBottom: `1px solid ${T.bdr}`,
        display: 'flex', alignItems: 'center', gap: 12,
      }}>
        <Av size={44} color={profile?.avatar_color}
          name={profile?.name} url={profile?.avatar_url || ''}/>
        <div>
          <div style={{fontSize: 14, fontWeight: 700}}>
            {profile?.name}
          </div>
          <div style={{fontSize: 12, color: T.mu}}>
            {profile?.title}
          </div>
        </div>
      </div>

      {/* Nav items */}
      <div style={{flex: 1, overflowY: 'auto', padding: '12px 0'}}>
        {[
          { id: 'network',  label: 'My Network',  icon: '🌐' },
          { id: 'library',  label: 'Library',     icon: '📚',
            badge: 'Coming soon', disabled: true },
          { id: 'messages', label: 'Messages',    icon: '💬',
            count: unreadMessages },
          { id: 'notifications', label: 'Alerts', icon: '🔔',
            count: unreadNotifications },
        ].map(item => (
          <button key={item.id}
            onClick={() => {
              if (item.disabled) return;
              setScreen(item.id);
              setShowDrawer(false);
            }}
            style={{
              width: '100%', padding: '13px 20px',
              border: 'none', background: 'transparent',
              cursor: item.disabled ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', gap: 14,
              fontFamily: 'inherit',
              opacity: item.disabled ? 0.4 : 1,
            }}
          >
            <span style={{fontSize: 18, width: 24}}>{item.icon}</span>
            <span style={{fontSize: 14, fontWeight: 500, flex: 1,
              textAlign: 'left', color: T.text}}>
              {item.label}
            </span>
            {item.badge && (
              <span style={{
                fontSize: 10, background: T.am2, color: T.am,
                padding: '2px 7px', borderRadius: 20, fontWeight: 600,
              }}>
                {item.badge}
              </span>
            )}
            {item.count > 0 && (
              <span style={{
                fontSize: 10, background: T.v, color: '#fff',
                padding: '2px 7px', borderRadius: 20, fontWeight: 700,
              }}>
                {item.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Bottom section */}
      <div style={{
        padding: '12px 0',
        borderTop: `1px solid ${T.bdr}`,
      }}>
        <button onClick={() => { setShowDrawer(false); setShowAccountSettings(true); }}
          style={{
            width: '100%', padding: '13px 20px',
            border: 'none', background: 'transparent',
            cursor: 'pointer', display: 'flex',
            alignItems: 'center', gap: 14, fontFamily: 'inherit',
          }}>
          <span style={{fontSize: 18, width: 24}}>⚙️</span>
          <span style={{fontSize: 14, fontWeight: 500, color: T.text}}>
            Settings
          </span>
        </button>
        <button onClick={() => supabase.auth.signOut()} style={{
          width: '100%', padding: '13px 20px',
          border: 'none', background: 'transparent',
          cursor: 'pointer', display: 'flex',
          alignItems: 'center', gap: 14, fontFamily: 'inherit',
        }}>
          <span style={{fontSize: 18, width: 24}}>👋</span>
          <span style={{fontSize: 14, fontWeight: 500, color: T.ro}}>
            Sign out
          </span>
        </button>
      </div>
    </div>
  </>
)}
```

---

### 1d — QR icon replacement (desktop sidebar too)

Replace the existing QR/grid icon in both mobile top bar and desktop
sidebar with a proper QR code SVG icon (four corner squares pattern
as shown in 1b above). The icon should be clearly recognisable as a
QR code to anyone who has seen one.

Also add a tooltip/title attribute: `title="Share my contact card"`

---

## Part 2 — Post card improvements

Find `src/feed/PostCard.jsx` and `src/groups/GroupPostCard.jsx`.
Apply all changes to both files.

---

### 2a — Remove post type badge and paper badge

Find and remove the post type badge (the "Post", "Paper", "Link",
"Tip" pill that appears next to the author name). This is visually
cluttered and obvious from context.

Also remove the paper badge/icon that appears on paper posts.
The paper content (title, journal, authors) makes it self-evident.

---

### 2b — Taxonomy chips — desktop improvements

On desktop (`!isMobile`):

**Hide Tier 1 badge entirely** from post cards — only show it when
editing a post (so the user can see/change their classification).

**Tier 2 chips — smaller:**
```jsx
// Desktop Tier 2 chips (replace existing):
{!isMobile && post.tier2?.length > 0 && (
  <div style={{display:'flex', gap:4, flexWrap:'wrap', marginBottom:4}}>
    {post.tier2.map(t => (
      <span key={t}
        onClick={() => onTagClick && onTagClick(t)}
        style={{
          fontSize: 10.5, fontWeight: 600,
          padding: '1px 8px', borderRadius: 20,
          background: T.v2, color: T.v,
          border: `1px solid rgba(108,99,255,.15)`,
          cursor: 'pointer',
        }}>
        {t}
      </span>
    ))}
  </div>
)}
```

**Granular tags — collapse to max 3 with "+N more":**
```jsx
{!isMobile && post.tags?.length > 0 && (
  <GranularTags tags={post.tags} onTagClick={onTagClick}/>
)}

// GranularTags sub-component (define inside PostCard):
function GranularTags({ tags, onTagClick }) {
  const [expanded, setExpanded] = React.useState(false);
  const visible = expanded ? tags : tags.slice(0, 3);
  const hidden  = tags.length - 3;

  return (
    <div style={{display:'flex', gap:4, flexWrap:'wrap', marginTop:3}}>
      {visible.map(tag => (
        <span key={tag}
          onClick={() => onTagClick && onTagClick(tag)}
          style={{
            fontSize: 10, color: T.mu, padding: '1px 7px',
            borderRadius: 20, background: T.s2,
            border: `1px solid ${T.bdr}`, cursor: 'pointer',
          }}>
          #{tag}
        </span>
      ))}
      {!expanded && hidden > 0 && (
        <span
          onClick={() => setExpanded(true)}
          style={{
            fontSize: 10, color: T.v, padding: '1px 7px',
            borderRadius: 20, background: T.v2,
            border: `1px solid rgba(108,99,255,.15)`,
            cursor: 'pointer', fontWeight: 600,
          }}>
          +{hidden} more
        </span>
      )}
    </div>
  );
}
```

---

### 2c — Mobile: hide taxonomy entirely

On mobile, hide ALL taxonomy chips and granular tags:

```jsx
// Only render taxonomy section if not mobile:
{!isMobile && (
  <>
    {/* Tier 2 chips */}
    {/* Granular tags with collapse */}
  </>
)}
```

---

### 2d — Mobile: compact post card padding

On mobile, reduce card padding and tighten spacing:

```jsx
// Card container padding:
padding: isMobile ? '10px 12px' : '16px 18px'

// Gap between sections inside card:
// Between author row and content: 6px mobile, 10px desktop
// Between content and tags: 4px mobile, 8px desktop
// Between tags and action bar: 6px mobile, 10px desktop
```

---

### 2e — Mobile: compact action bar

On mobile, show icons only. Show counts only if > 0.

```jsx
function ActionBar({ likes, comments, reposts, onLike, onComment, onRepost, onShare, isMobile, liked }) {

  const iconSize = isMobile ? 15 : 16;
  const fontSize = isMobile ? 12 : 13;
  const padding  = isMobile ? '6px 8px' : '8px 10px';

  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      gap: isMobile ? 4 : 8,
      paddingTop: isMobile ? 8 : 10,
      borderTop: `1px solid ${T.bdr}`,
      marginTop: isMobile ? 6 : 10,
    }}>

      {/* Like */}
      <button onClick={onLike} style={{
        display: 'flex', alignItems: 'center',
        gap: 4, padding, border: 'none',
        background: 'transparent', cursor: 'pointer',
        color: liked ? T.ro : T.mu, fontFamily: 'inherit',
        fontSize,
      }}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24"
          fill={liked ? T.ro : 'none'}
          stroke={liked ? T.ro : T.mu} strokeWidth="1.8">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
        </svg>
        {/* Show count only if > 0 on mobile, always on desktop */}
        {(!isMobile || likes > 0) && (
          <span>{likes}</span>
        )}
      </button>

      {/* Comment */}
      <button onClick={onComment} style={{
        display: 'flex', alignItems: 'center',
        gap: 4, padding, border: 'none',
        background: 'transparent', cursor: 'pointer',
        color: T.mu, fontFamily: 'inherit', fontSize,
      }}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24"
          fill="none" stroke={T.mu} strokeWidth="1.8">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        {(!isMobile || comments > 0) && (
          <span>{comments}</span>
        )}
      </button>

      {/* Repost */}
      <button onClick={onRepost} style={{
        display: 'flex', alignItems: 'center',
        gap: 4, padding, border: 'none',
        background: 'transparent', cursor: 'pointer',
        color: T.mu, fontFamily: 'inherit', fontSize,
      }}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24"
          fill="none" stroke={T.mu} strokeWidth="1.8">
          <path d="M17 1l4 4-4 4"/>
          <path d="M3 11V9a4 4 0 0 1 4-4h14"/>
          <path d="M7 23l-4-4 4-4"/>
          <path d="M21 13v2a4 4 0 0 1-4 4H3"/>
        </svg>
        {(!isMobile || reposts > 0) && (
          <span>{reposts}</span>
        )}
      </button>

      {/* Share — icon only on mobile */}
      <button onClick={onShare} style={{
        display: 'flex', alignItems: 'center',
        gap: 4, padding, border: 'none',
        background: 'transparent', cursor: 'pointer',
        color: T.mu, fontFamily: 'inherit', fontSize,
        marginLeft: 'auto',
      }}>
        <svg width={iconSize} height={iconSize} viewBox="0 0 24 24"
          fill="none" stroke={T.mu} strokeWidth="1.8">
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
          <polyline points="16 6 12 2 8 6"/>
          <line x1="12" y1="2" x2="12" y2="15"/>
        </svg>
        {!isMobile && <span>Share</span>}
      </button>
    </div>
  );
}
```

---

### 2f — Make taxonomy chips editable on posts

On the post card, the owner should be able to edit taxonomy tags.
Add a small ✏️ edit tags button in the ··· menu (owner only):

In the owner dropdown menu, add:
```jsx
<button onClick={() => setEditingTags(true)}>
  ✏️ Edit tags
</button>
```

When `editingTags` is true, show an inline edit panel below the post
content (replacing the tag display):

```jsx
{editingTags && (
  <div style={{
    background: T.s2, borderRadius: 10,
    padding: 12, marginTop: 8,
  }}>
    {/* Show Tier 1 badge here (only time it's visible on a post) */}
    <div style={{fontSize: 12, fontWeight: 600, marginBottom: 6}}>
      Discipline: {post.tier1 || 'Not set'}
    </div>

    {/* Tier 1 select */}
    <select value={editTier1}
      onChange={e => { setEditTier1(e.target.value); setEditTier2([]); }}
      style={{...selectStyle, marginBottom: 8}}>
      <option value="">Select discipline...</option>
      {TIER1_LIST.map(t => <option key={t} value={t}>{t}</option>)}
    </select>

    {/* Tier 2 chips */}
    {editTier1 && (
      <div style={{display:'flex', gap:5, flexWrap:'wrap', marginBottom:8}}>
        {getTier2(editTier1).map(t => (
          <button key={t}
            onClick={() => setEditTier2(prev =>
              prev.includes(t) ? prev.filter(x=>x!==t)
              : prev.length < 3 ? [...prev, t] : prev
            )}
            style={{
              padding:'2px 9px', borderRadius:20, cursor:'pointer',
              fontSize:11.5, fontFamily:'inherit',
              border:`1.5px solid ${editTier2.includes(t) ? T.v : T.bdr}`,
              background: editTier2.includes(t) ? T.v2 : T.w,
              color: editTier2.includes(t) ? T.v : T.text,
            }}>
            {t}
          </button>
        ))}
      </div>
    )}

    {/* Granular tags */}
    <div style={{fontSize:11.5, color:T.mu, marginBottom:4}}>
      Specific tags (comma separated):
    </div>
    <input
      value={editTags.join(', ')}
      onChange={e => setEditTags(
        e.target.value.split(',').map(t => t.trim()).filter(Boolean)
      )}
      placeholder="e.g. p53_mutation, CRISPR_cas9"
      style={{...inputStyle, marginBottom:8, fontSize:12}}
    />

    <div style={{display:'flex', gap:8}}>
      <Btn onClick={() => setEditingTags(false)}>Cancel</Btn>
      <Btn variant="s" onClick={saveTagEdits}>Save</Btn>
    </div>
  </div>
)}
```

Save handler:
```javascript
const saveTagEdits = async () => {
  await supabase.from('posts').update({
    tier1: editTier1,
    tier2: editTier2,
    tags:  editTags,
  }).eq('id', post.id);
  // Update local state and close editor
  setEditingTags(false);
  onPostUpdated && onPostUpdated();
};
```

State to add to PostCard:
```javascript
const [editingTags, setEditingTags] = useState(false);
const [editTier1,   setEditTier1]   = useState(post.tier1 || '');
const [editTier2,   setEditTier2]   = useState(post.tier2 || []);
const [editTags,    setEditTags]    = useState(post.tags  || []);
```

Apply same pattern to GroupPostCard using `group_posts` table.

---

## What NOT to change

- Desktop sidebar layout — only mobile top bar and bottom nav change
- Post content rendering (text, paper, link, file previews)
- The + new post button behaviour
- Account Settings, profile screens, groups screens
- Run `npm run build` when done

---

## Testing checklist

- [ ] On mobile: bottom nav shows Home/Explore/+/Groups/Profile
- [ ] On mobile: top bar shows ☰ / Luminary / 🔔 / 💬 / QR icon
- [ ] Hamburger opens drawer with Network, Library (disabled), Settings, Sign out
- [ ] Groups unread badge appears on bottom nav Groups item
- [ ] Alerts badge appears on bell icon in top bar
- [ ] QR icon opens the business card QR overlay
- [ ] On mobile: post cards have no taxonomy chips, tighter padding,
      compact action bar (counts hidden when 0)
- [ ] On desktop: Tier 1 hidden, Tier 2 chips smaller, granular tags
      collapse at 3 with +N more
- [ ] Post type badge (Post/Paper) removed from all post cards
- [ ] Owner can edit tags via ··· menu → shows Tier 1 for editing
- [ ] Resize browser window — layout switches correctly at 768px
