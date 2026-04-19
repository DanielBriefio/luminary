# Task: Phase 4 — Saved Posts + Personal Library + Group Library

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

This task builds three related features sharing a common data model:

**Phase 4A — Saved Posts**
Bookmark any post or group post. Accessible from a Library screen.

**Phase 4B — Personal Library**
Folder-organised collection of papers and PDFs. Europe PMC search,
DOI import, PDF upload. No default folders — user starts with an
empty library and creates their own folders.

**Phase 4C — Group Library**
Same as Personal Library but scoped to a group. Two default folders
(Journal Club, Our Group's Publications) created on group creation.
Admins can delete ANY folder including defaults.
Lives in the group sidebar as a new "Library" tab.

All three share the `library_items` table and reusable UI components.

---

## Step 1 — SQL migration

Create `migration_library.sql` in the project root:

```sql
-- ── SAVED POSTS ────────────────────────────────────────────────────────────────

create table if not exists saved_posts (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid references profiles(id) on delete cascade not null,
  post_id       uuid references posts(id) on delete cascade,
  group_post_id uuid references group_posts(id) on delete cascade,
  saved_at      timestamptz default now(),
  unique(user_id, post_id),
  unique(user_id, group_post_id)
);

alter table saved_posts enable row level security;
create policy "sp_select" on saved_posts for select
  using (auth.uid() = user_id);
create policy "sp_insert" on saved_posts for insert
  with check (auth.uid() = user_id);
create policy "sp_delete" on saved_posts for delete
  using (auth.uid() = user_id);

create index if not exists idx_saved_posts_user
  on saved_posts(user_id, saved_at desc);

-- ── LIBRARY FOLDERS ─────────────────────────────────────────────────────────────

create table if not exists library_folders (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references profiles(id) on delete cascade,
  group_id    uuid references groups(id) on delete cascade,
  name        text not null,
  description text default '',
  sort_order  integer default 0,
  created_at  timestamptz default now(),
  -- Either user_id or group_id must be set
  constraint lf_owner check (
    (user_id is not null) != (group_id is not null)
  )
);

-- NOTE: No is_default column — all folders are deletable.
-- Group admins can delete any folder including the default ones.
-- Personal library has no default folders at all.

alter table library_folders enable row level security;

create policy "lf_select" on library_folders for select using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role in ('admin','member')
  ))
);
create policy "lf_insert" on library_folders for insert with check (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role = 'admin'
  ))
);
create policy "lf_update" on library_folders for update using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role = 'admin'
  ))
);
-- Anyone can delete their own personal folders.
-- Group admins can delete any group folder including defaults.
create policy "lf_delete" on library_folders for delete using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role = 'admin'
  ))
);

-- ── LIBRARY ITEMS ───────────────────────────────────────────────────────────────

create table if not exists library_items (
  id                   uuid primary key default gen_random_uuid(),
  folder_id            uuid references library_folders(id) on delete cascade not null,
  added_by             uuid references profiles(id) on delete set null,

  -- Paper metadata
  title                text not null,
  authors              text default '',
  journal              text default '',
  year                 text default '',
  doi                  text default '',
  pmid                 text default '',
  epmc_id              text default '',
  abstract             text default '',
  cited_by_count       integer default 0,
  is_open_access       boolean default false,
  full_text_url        text default '',

  -- PDF upload (optional)
  pdf_url              text default '',
  pdf_name             text default '',

  -- Member annotation
  notes                text default '',

  -- Group publication flag (group library only)
  -- When true: counts toward group profile publication stats
  is_group_publication boolean default false,

  added_at             timestamptz default now()
);

alter table library_items enable row level security;

create policy "li_select" on library_items for select using (
  folder_id in (select id from library_folders)
);
create policy "li_insert" on library_items for insert with check (
  auth.uid() = added_by and
  folder_id in (select id from library_folders)
);
create policy "li_update" on library_items for update using (
  auth.uid() = added_by or
  folder_id in (
    select lf.id from library_folders lf
    join group_members gm on gm.group_id = lf.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);
create policy "li_delete" on library_items for delete using (
  auth.uid() = added_by or
  folder_id in (
    select lf.id from library_folders lf
    join group_members gm on gm.group_id = lf.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);

create index if not exists idx_library_items_folder
  on library_items(folder_id, added_at desc);
create index if not exists idx_library_items_doi
  on library_items(doi) where doi != '';

-- ── GROUP LIBRARY DEFAULTS ─────────────────────────────────────────────────────
-- Creates default folders when a group is first created.
-- Admins can delete these at any time.

create or replace function create_group_library_defaults(p_group_id uuid)
returns void language plpgsql as $$
begin
  insert into library_folders (group_id, name, description, sort_order)
  values
    (p_group_id, 'Journal Club',
      'Papers for group reading and discussion', 0),
    (p_group_id, 'Our Group''s Publications',
      'Papers authored by group members', 1);
end;
$$;

-- ── UPDATE group_stats VIEW ────────────────────────────────────────────────────
-- Include publication_count from library items flagged as group publications

drop view if exists group_stats;
create view group_stats as
select
  g.id                                                    as group_id,
  count(gm.id) filter (where gm.role = 'member')         as member_count,
  count(gm.id) filter (where gm.role = 'admin')          as admin_count,
  count(gm.id) filter (where gm.role = 'alumni')         as alumni_count,
  count(gm.id) filter (
    where gm.role in ('admin','member')
  )                                                       as active_member_count,
  (
    select count(*) from library_items li
    join library_folders lf on lf.id = li.folder_id
    where lf.group_id = g.id and li.is_group_publication = true
  )                                                       as publication_count
from groups g
left join group_members gm on gm.group_id = g.id
group by g.id;

grant select on group_stats to anon, authenticated;
```

Tell the user to run this in Supabase SQL Editor.

Also create a new Supabase Storage bucket:
- Name: `library-files`
- Public: ON
- File size limit: 25MB
- Allowed MIME types: `application/pdf`

---

## Step 2 — Performance: batch saved post ID lookup

This is critical for feed performance. Instead of querying the
database once per PostCard to check if it's saved, fetch ALL saved
post IDs once on FeedScreen mount and pass them down as a Set.

### In FeedScreen.jsx

```javascript
// Add state for saved post IDs:
const [savedPostIds,      setSavedPostIds]      = useState(new Set());
const [savedGroupPostIds, setSavedGroupPostIds] = useState(new Set());

// Fetch all saved IDs on mount and after saves/unsaves:
const fetchSavedIds = async () => {
  if (!user) return;
  const { data } = await supabase
    .from('saved_posts')
    .select('post_id, group_post_id')
    .eq('user_id', user.id);

  setSavedPostIds(new Set(
    (data || []).map(r => r.post_id).filter(Boolean)
  ));
  setSavedGroupPostIds(new Set(
    (data || []).map(r => r.group_post_id).filter(Boolean)
  ));
};

useEffect(() => { fetchSavedIds(); }, [user]);
```

Pass to PostCard:
```jsx
<PostCard
  key={post.id}
  post={post}
  user={user}
  isSaved={savedPostIds.has(post.id)}
  onSaveToggled={fetchSavedIds}  // refresh the set after save/unsave
  // ... other props
/>
```

### In PostCard.jsx

Remove the per-card `useEffect` that queries for saved status.
Instead receive `isSaved` and `onSaveToggled` as props:

```javascript
// REMOVE this — no longer needed:
// useEffect(() => {
//   supabase.from('saved_posts').select('id')...
// }, [post.id]);

// REPLACE with:
const [saved, setSaved] = useState(isSaved);

// Keep saved in sync if parent prop changes:
useEffect(() => { setSaved(isSaved); }, [isSaved]);

const toggleSave = async () => {
  const newSaved = !saved;
  setSaved(newSaved); // optimistic update
  if (newSaved) {
    await supabase.from('saved_posts').insert({
      user_id: user.id,
      post_id: post.id,
    });
  } else {
    await supabase.from('saved_posts')
      .delete()
      .eq('user_id', user.id)
      .eq('post_id', post.id);
  }
  onSaveToggled && onSaveToggled(); // refresh parent's ID set
};
```

### Same pattern for GroupFeed.jsx + GroupPostCard.jsx

In `GroupFeed.jsx`, fetch saved group post IDs and pass
`isSaved={savedGroupPostIds.has(post.id)}` to each `GroupPostCard`.

In `GroupPostCard.jsx`, receive `isSaved` and `onSaveToggled` as props
instead of querying per card. Use `group_post_id` column in saved_posts.

---

## Step 3 — Shared Library components

Create `src/library/` directory.

### 3a — LibraryPaperSearch.jsx

Reusable Europe PMC search. Import and use in both
LibraryScreen and GroupLibrary.

```jsx
import { useState } from 'react';
import { T } from '../lib/constants';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';

export default function LibraryPaperSearch({ onSelect, buttonLabel }) {
  const [query,     setQuery]     = useState('');
  const [results,   setResults]   = useState([]);
  const [searching, setSearching] = useState(false);
  const [error,     setError]     = useState('');

  const search = async () => {
    if (!query.trim() || searching) return;
    setSearching(true);
    setError('');
    try {
      const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
        + `?query=${encodeURIComponent(query)}`
        + `&resultType=core&pageSize=8&format=json`;
      const data = await fetch(url).then(r => r.json());
      setResults(data.resultList?.result || []);
      if (!data.resultList?.result?.length)
        setError('No results found. Try different keywords.');
    } catch {
      setError('Search failed. Check your connection.');
    }
    setSearching(false);
  };

  const mapResult = (r) => ({
    title:          r.title?.replace(/<[^>]+>/g,'') || '',
    authors:        r.authorString || '',
    journal:        r.journalTitle || '',
    year:           r.pubYear || '',
    doi:            r.doi || '',
    pmid:           r.pmid || '',
    epmc_id:        r.id || '',
    abstract:       r.abstractText?.slice(0,500) || '',
    cited_by_count: r.citedByCount || 0,
    is_open_access: r.isOpenAccess === 'Y',
    full_text_url:  r.fullTextUrlList?.fullTextUrl?.[0]?.url || '',
  });

  return (
    <div>
      <div style={{display:'flex', gap:8, marginBottom:12}}>
        <input
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && search()}
          placeholder="Search by title, author, keyword..."
          style={{flex:1, padding:'8px 13px', borderRadius:9,
            border:`1.5px solid ${T.bdr}`, fontSize:13,
            fontFamily:'inherit', outline:'none', background:T.s2}}
        />
        <Btn onClick={search} disabled={searching || !query.trim()}>
          {searching ? <Spinner size={14}/> : '🔍 Search'}
        </Btn>
      </div>

      {error && <div style={{fontSize:12.5, color:T.mu, marginBottom:8}}>
        {error}
      </div>}

      {results.map(r => (
        <div key={r.id} style={{
          padding:'12px 14px', borderRadius:10,
          border:`1px solid ${T.bdr}`, background:T.w, marginBottom:8,
        }}>
          <div style={{fontSize:13, fontWeight:700, lineHeight:1.4,
            marginBottom:3}}>
            {r.title?.replace(/<[^>]+>/g,'')}
          </div>
          <div style={{fontSize:11.5, color:T.mu, marginBottom:6}}>
            {r.authorString?.slice(0,80)}{r.authorString?.length>80?'…':''}
          </div>
          <div style={{display:'flex', gap:6, flexWrap:'wrap',
            marginBottom:8, alignItems:'center'}}>
            {r.journalTitle && (
              <span style={{fontSize:11.5, fontWeight:600, color:T.v}}>
                {r.journalTitle}
              </span>
            )}
            {r.pubYear && (
              <span style={{fontSize:11.5, color:T.mu}}>· {r.pubYear}</span>
            )}
            {r.citedByCount > 0 && (
              <span style={{fontSize:10.5, background:T.bl2, color:T.bl,
                padding:'1px 7px', borderRadius:20, fontWeight:600}}>
                {r.citedByCount} citations
              </span>
            )}
            {r.isOpenAccess === 'Y' && (
              <span style={{fontSize:10.5, background:T.gr2, color:T.gr,
                padding:'1px 7px', borderRadius:20, fontWeight:700}}>
                Open Access
              </span>
            )}
          </div>
          <Btn variant="s" onClick={() => onSelect(mapResult(r))}>
            {buttonLabel || 'Add to library'}
          </Btn>
        </div>
      ))}
    </div>
  );
}
```

### 3b — LibraryItemCard.jsx

```jsx
import { T } from '../lib/constants';

export default function LibraryItemCard({
  item,
  onDelete,
  showGroupPublicationToggle,
  onToggleGroupPublication,
  isAdmin,
}) {
  return (
    <div style={{
      padding:'14px 16px', borderRadius:12,
      border:`1px solid ${T.bdr}`, background:T.w, marginBottom:8,
    }}>
      {item.is_group_publication && (
        <div style={{
          fontSize:10.5, fontWeight:700, color:T.am,
          background:T.am2, display:'inline-block',
          padding:'1px 8px', borderRadius:20, marginBottom:6,
        }}>
          🏆 Group publication
        </div>
      )}

      <div style={{fontSize:13.5, fontWeight:700, lineHeight:1.4,
        marginBottom:4}}>
        {item.title}
      </div>

      {item.authors && (
        <div style={{fontSize:11.5, color:T.mu, marginBottom:4}}>
          {item.authors.slice(0,100)}{item.authors.length>100?'…':''}
        </div>
      )}

      <div style={{display:'flex', gap:6, flexWrap:'wrap',
        alignItems:'center', marginBottom:8}}>
        {item.journal && (
          <span style={{fontSize:12, fontWeight:600, color:T.v}}>
            {item.journal}
          </span>
        )}
        {item.year && (
          <span style={{fontSize:12, color:T.mu}}>· {item.year}</span>
        )}
        {item.cited_by_count > 0 && (
          <span style={{fontSize:10.5, background:T.bl2, color:T.bl,
            padding:'1px 7px', borderRadius:20, fontWeight:600}}>
            {item.cited_by_count} citations
          </span>
        )}
        {item.is_open_access && (
          <span style={{fontSize:10.5, background:T.gr2, color:T.gr,
            padding:'1px 7px', borderRadius:20, fontWeight:700}}>
            Open Access
          </span>
        )}
      </div>

      {item.notes && (
        <div style={{fontSize:12, color:T.mu, fontStyle:'italic',
          marginBottom:8, padding:'6px 10px', background:T.s2,
          borderRadius:7}}>
          "{item.notes}"
        </div>
      )}

      <div style={{display:'flex', gap:10, flexWrap:'wrap',
        alignItems:'center'}}>
        {item.doi && (
          <a href={`https://doi.org/${item.doi}`} target="_blank"
            rel="noopener noreferrer"
            style={{fontSize:11.5, color:T.v, fontWeight:600,
              textDecoration:'none'}}>
            DOI ↗
          </a>
        )}
        {item.full_text_url && (
          <a href={item.full_text_url} target="_blank"
            rel="noopener noreferrer"
            style={{fontSize:11.5, color:T.gr, fontWeight:600,
              textDecoration:'none'}}>
            Full text ↗
          </a>
        )}
        {item.pdf_url && (
          <a href={item.pdf_url} target="_blank"
            rel="noopener noreferrer"
            style={{fontSize:11.5, color:T.bl, fontWeight:600,
              textDecoration:'none'}}>
            📄 PDF
          </a>
        )}

        {/* Group publication toggle — admin only */}
        {showGroupPublicationToggle && isAdmin && (
          <button onClick={() => onToggleGroupPublication(item)} style={{
            fontSize:11, fontWeight:600, cursor:'pointer',
            border:`1px solid ${item.is_group_publication ? T.am : T.bdr}`,
            background: item.is_group_publication ? T.am2 : T.w,
            color: item.is_group_publication ? T.am : T.mu,
            padding:'2px 9px', borderRadius:20, fontFamily:'inherit',
          }}>
            {item.is_group_publication ? '★ Our publication' : '☆ Mark as ours'}
          </button>
        )}

        {onDelete && (
          <button onClick={() => onDelete(item)} style={{
            marginLeft:'auto', fontSize:11.5, color:T.ro,
            border:'none', background:'transparent',
            cursor:'pointer', fontFamily:'inherit',
          }}>
            Remove
          </button>
        )}
      </div>
    </div>
  );
}
```

### 3c — LibraryFolderSidebar.jsx

```jsx
import { useState } from 'react';
import { T } from '../lib/constants';

const FOLDER_ICONS = {
  'Journal Club':            '📚',
  "Our Group's Publications": '🏆',
  'Reading List':            '📖',
  'To Reference':            '🔖',
};

export default function LibraryFolderSidebar({
  folders, activeFolderId, onSelectFolder,
  onCreateFolder, onDeleteFolder,
  canManageFolders,
}) {
  const [creating,      setCreating]      = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  return (
    <div style={{
      width:200, flexShrink:0,
      borderRight:`1px solid ${T.bdr}`,
      display:'flex', flexDirection:'column',
      background:T.w,
    }}>
      <div style={{padding:'12px 14px', fontSize:11, fontWeight:700,
        color:T.mu, textTransform:'uppercase', letterSpacing:'.07em'}}>
        Folders
      </div>

      <div style={{flex:1, overflowY:'auto'}}>
        {folders.length === 0 && (
          <div style={{padding:'12px 14px', fontSize:12.5, color:T.mu}}>
            No folders yet.{canManageFolders ? ' Create one below.' : ''}
          </div>
        )}

        {folders.map(folder => (
          <div key={folder.id}
            onClick={() => onSelectFolder(folder.id)}
            style={{
              display:'flex', alignItems:'center', gap:8,
              padding:'9px 14px', cursor:'pointer',
              background: activeFolderId===folder.id ? T.v2 : 'transparent',
              color: activeFolderId===folder.id ? T.v : T.text,
              fontWeight: activeFolderId===folder.id ? 700 : 400,
              fontSize:13,
            }}>
            <span style={{fontSize:14, flexShrink:0}}>
              {FOLDER_ICONS[folder.name] || '📁'}
            </span>
            <span style={{flex:1, overflow:'hidden',
              textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
              {folder.name}
            </span>
            {/* Any folder can be deleted by those with permission */}
            {canManageFolders && (
              <button
                onClick={e => { e.stopPropagation(); onDeleteFolder(folder); }}
                style={{
                  fontSize:11, color:T.mu, border:'none',
                  background:'transparent', cursor:'pointer',
                  opacity:.5, flexShrink:0, lineHeight:1,
                }}
                title="Delete folder"
              >
                ✕
              </button>
            )}
          </div>
        ))}
      </div>

      {canManageFolders && (
        <div style={{padding:'10px 14px', borderTop:`1px solid ${T.bdr}`}}>
          {!creating ? (
            <button onClick={() => setCreating(true)} style={{
              fontSize:12, color:T.v, fontWeight:600,
              border:'none', background:'transparent',
              cursor:'pointer', fontFamily:'inherit',
              display:'flex', alignItems:'center', gap:4,
            }}>
              + New folder
            </button>
          ) : (
            <div>
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' && newFolderName.trim()) {
                    onCreateFolder(newFolderName.trim());
                    setNewFolderName('');
                    setCreating(false);
                  }
                  if (e.key === 'Escape') {
                    setCreating(false);
                    setNewFolderName('');
                  }
                }}
                placeholder="Folder name..."
                style={{width:'100%', fontSize:12.5,
                  padding:'5px 8px', border:`1.5px solid ${T.v}`,
                  borderRadius:7, fontFamily:'inherit', outline:'none'}}
              />
              <div style={{fontSize:11, color:T.mu, marginTop:3}}>
                Enter to save · Esc to cancel
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

---

## Step 4 — Personal Library screen

Create `src/library/LibraryScreen.jsx`.

Two tabs: **Papers** (folder library) and **Saved** (bookmarked posts).

Personal library starts completely empty — no default folders.
The empty state prompts the user to create their first folder.

```jsx
import { useState, useEffect } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import { timeAgo } from '../lib/utils';
import Btn from '../components/Btn';
import Spinner from '../components/Spinner';
import Av from '../components/Av';
import LibraryFolderSidebar from './LibraryFolderSidebar';
import LibraryPaperSearch   from './LibraryPaperSearch';
import LibraryItemCard      from './LibraryItemCard';

export default function LibraryScreen({ user, savedPostIds,
  savedGroupPostIds, onSaveToggled }) {

  const [activeTab,      setActiveTab]      = useState('papers');
  const [folders,        setFolders]        = useState([]);
  const [activeFolderID, setActiveFolderID] = useState(null);
  const [items,          setItems]          = useState([]);
  const [savedPosts,     setSavedPosts]     = useState([]);
  const [showSearch,     setShowSearch]     = useState(false);
  const [showDOI,        setShowDOI]        = useState(false);
  const [doiInput,       setDoiInput]       = useState('');
  const [doiLoading,     setDoiLoading]     = useState(false);
  const [loading,        setLoading]        = useState(true);

  useEffect(() => { fetchFolders(); }, []);
  useEffect(() => { if (activeFolderID) fetchItems(activeFolderID); }, [activeFolderID]);
  useEffect(() => { if (activeTab === 'saved') fetchSavedPosts(); }, [activeTab]);

  const fetchFolders = async () => {
    const { data } = await supabase
      .from('library_folders')
      .select('*')
      .eq('user_id', user.id)
      .order('sort_order');
    setFolders(data || []);
    if (data?.length) setActiveFolderID(data[0].id);
    setLoading(false);
  };

  const fetchItems = async (folderId) => {
    const { data } = await supabase
      .from('library_items')
      .select('*')
      .eq('folder_id', folderId)
      .order('added_at', { ascending: false });
    setItems(data || []);
  };

  const fetchSavedPosts = async () => {
    const { data } = await supabase
      .from('saved_posts')
      .select(`
        id, saved_at, post_id, group_post_id,
        post:posts(id, content, paper_title, created_at,
          profiles(name, avatar_url, avatar_color)),
        group_post:group_posts(id, content, paper_title, created_at,
          profiles(name, avatar_url, avatar_color))
      `)
      .eq('user_id', user.id)
      .order('saved_at', { ascending: false });
    setSavedPosts(data || []);
  };

  const addPaperToFolder = async (paperData) => {
    if (!activeFolderID) return;
    await supabase.from('library_items').insert({
      folder_id: activeFolderID,
      added_by:  user.id,
      ...paperData,
    });
    fetchItems(activeFolderID);
    setShowSearch(false);
  };

  const addByDOI = async () => {
    if (!doiInput.trim() || !activeFolderID) return;
    setDoiLoading(true);
    try {
      const resp = await fetch(
        `https://api.crossref.org/works/${encodeURIComponent(doiInput.trim())}`
      );
      const data = await resp.json();
      const w    = data.message;
      await addPaperToFolder({
        title:   w.title?.[0] || '',
        authors: (w.author || [])
          .map(a => `${a.family||''} ${(a.given||'')[0]||''}`.trim())
          .join(', '),
        journal: w['container-title']?.[0] || '',
        year:    String(w.published?.['date-parts']?.[0]?.[0] || ''),
        doi:     doiInput.trim(),
      });
      setDoiInput('');
      setShowDOI(false);
    } catch {
      alert('DOI not found. Check the format and try again.');
    }
    setDoiLoading(false);
  };

  const createFolder = async (name) => {
    const { data } = await supabase.from('library_folders').insert({
      user_id:    user.id,
      name,
      sort_order: folders.length,
    }).select().single();
    if (data) {
      setFolders(f => [...f, data]);
      setActiveFolderID(data.id);
    }
  };

  const deleteFolder = async (folder) => {
    const confirmed = window.confirm(
      `Delete "${folder.name}"? All papers inside will be removed.`
    );
    if (!confirmed) return;
    await supabase.from('library_folders').delete().eq('id', folder.id);
    const remaining = folders.filter(f => f.id !== folder.id);
    setFolders(remaining);
    setActiveFolderID(remaining[0]?.id || null);
    if (remaining.length === 0) setItems([]);
  };

  const deleteItem = async (item) => {
    await supabase.from('library_items').delete().eq('id', item.id);
    setItems(i => i.filter(x => x.id !== item.id));
  };

  const uploadPDF = async (file) => {
    if (!activeFolderID) return;
    const path = `library/${user.id}/${Date.now()}_${file.name}`;
    const { error } = await supabase.storage
      .from('library-files').upload(path, file);
    if (error) { alert('Upload failed.'); return; }
    const { data } = supabase.storage
      .from('library-files').getPublicUrl(path);
    await supabase.from('library_items').insert({
      folder_id: activeFolderID,
      added_by:  user.id,
      title:     file.name.replace(/\.[^/.]+$/, ''),
      pdf_url:   data.publicUrl,
      pdf_name:  file.name,
    });
    fetchItems(activeFolderID);
  };

  const unsavePost = async (sp) => {
    await supabase.from('saved_posts').delete().eq('id', sp.id);
    setSavedPosts(p => p.filter(x => x.id !== sp.id));
    onSaveToggled && onSaveToggled();
  };

  return (
    <div style={{display:'flex', flexDirection:'column',
      height:'100%', background:T.s2}}>

      {/* Header */}
      <div style={{padding:'16px 20px', background:T.w,
        borderBottom:`1px solid ${T.bdr}`,
        display:'flex', alignItems:'center', gap:12}}>
        <div style={{
          fontFamily:"'DM Serif Display',serif", fontSize:20,
        }}>
          Library
        </div>
        <div style={{display:'flex', gap:4, marginLeft:'auto'}}>
          {[['papers','📚 Papers'],['saved','🔖 Saved']].map(([id,label]) => (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              padding:'5px 14px', borderRadius:20, cursor:'pointer',
              fontSize:12.5, fontWeight:600, fontFamily:'inherit',
              border:`1.5px solid ${activeTab===id ? T.v : T.bdr}`,
              background: activeTab===id ? T.v2 : T.w,
              color: activeTab===id ? T.v : T.mu,
            }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Papers tab */}
      {activeTab === 'papers' && (
        <div style={{display:'flex', flex:1, overflow:'hidden'}}>

          <LibraryFolderSidebar
            folders={folders}
            activeFolderId={activeFolderID}
            onSelectFolder={setActiveFolderID}
            onCreateFolder={createFolder}
            onDeleteFolder={deleteFolder}
            canManageFolders={true}
          />

          <div style={{flex:1, overflowY:'auto', padding:16}}>

            {/* Empty state — no folders yet */}
            {!loading && folders.length === 0 && (
              <div style={{textAlign:'center', color:T.mu,
                padding:'48px 20px'}}>
                <div style={{fontSize:36, marginBottom:12}}>📚</div>
                <div style={{fontSize:15,
                  fontFamily:"'DM Serif Display',serif",
                  marginBottom:8}}>
                  Your library is empty
                </div>
                <div style={{fontSize:13, marginBottom:16,
                  lineHeight:1.6}}>
                  Create a folder to get started, then add papers
                  from Europe PMC or by DOI.
                </div>
              </div>
            )}

            {/* Folder selected — show add controls */}
            {activeFolderID && (
              <>
                <div style={{display:'flex', gap:8, marginBottom:16,
                  flexWrap:'wrap'}}>
                  <Btn onClick={() => {
                    setShowSearch(s => !s); setShowDOI(false);
                  }}>
                    🔍 Search Europe PMC
                  </Btn>
                  <Btn onClick={() => {
                    setShowDOI(s => !s); setShowSearch(false);
                  }}>
                    🔗 Enter DOI
                  </Btn>
                  <label style={{cursor:'pointer'}}>
                    <input type="file" accept=".pdf"
                      style={{display:'none'}}
                      onChange={e =>
                        e.target.files[0] && uploadPDF(e.target.files[0])}
                    />
                    <span style={{
                      display:'inline-flex', alignItems:'center', gap:6,
                      padding:'7px 14px', borderRadius:9,
                      border:`1px solid ${T.bdr}`, background:T.w,
                      fontSize:13, cursor:'pointer', fontWeight:500,
                    }}>
                      📄 Upload PDF
                    </span>
                  </label>
                </div>

                {showSearch && (
                  <div style={{marginBottom:16, padding:14,
                    background:T.w, borderRadius:12,
                    border:`1px solid ${T.bdr}`}}>
                    <LibraryPaperSearch onSelect={addPaperToFolder}/>
                  </div>
                )}

                {showDOI && (
                  <div style={{marginBottom:16, padding:14,
                    background:T.w, borderRadius:12,
                    border:`1px solid ${T.bdr}`,
                    display:'flex', gap:8, alignItems:'center'}}>
                    <input value={doiInput}
                      onChange={e => setDoiInput(e.target.value)}
                      onKeyDown={e => e.key==='Enter' && addByDOI()}
                      placeholder="10.1056/NEJMoa..."
                      style={{flex:1, padding:'8px 13px',
                        borderRadius:9, border:`1.5px solid ${T.bdr}`,
                        fontSize:13, fontFamily:'inherit', outline:'none'}}
                    />
                    <Btn variant="s" onClick={addByDOI}
                      disabled={doiLoading}>
                      {doiLoading ? '...' : 'Add'}
                    </Btn>
                  </div>
                )}

                {items.length === 0 && !showSearch && !showDOI && (
                  <div style={{textAlign:'center', color:T.mu,
                    padding:'32px 20px', fontSize:13}}>
                    <div style={{fontSize:28, marginBottom:8}}>📭</div>
                    This folder is empty. Add papers above.
                  </div>
                )}

                {items.map(item => (
                  <LibraryItemCard
                    key={item.id}
                    item={item}
                    onDelete={deleteItem}
                    showGroupPublicationToggle={false}
                  />
                ))}
              </>
            )}
          </div>
        </div>
      )}

      {/* Saved posts tab */}
      {activeTab === 'saved' && (
        <div style={{flex:1, overflowY:'auto', padding:16}}>
          {savedPosts.length === 0 && (
            <div style={{textAlign:'center', color:T.mu,
              padding:'48px 20px'}}>
              <div style={{fontSize:36, marginBottom:12}}>🔖</div>
              <div style={{fontSize:15,
                fontFamily:"'DM Serif Display',serif",
                marginBottom:8}}>
                No saved posts yet
              </div>
              <div style={{fontSize:13, lineHeight:1.6}}>
                Tap the bookmark icon on any post to save it here.
              </div>
            </div>
          )}
          {savedPosts.map(sp => {
            const post = sp.post || sp.group_post;
            if (!post) return null;
            const text = (post.content || '')
              .replace(/<[^>]+>/g,'')
              .slice(0, 200);
            return (
              <div key={sp.id} style={{
                padding:'12px 14px', borderRadius:12,
                border:`1px solid ${T.bdr}`, background:T.w,
                marginBottom:8, display:'flex', gap:10,
                alignItems:'flex-start',
              }}>
                <Av size={36}
                  color={post.profiles?.avatar_color}
                  name={post.profiles?.name}
                  url={post.profiles?.avatar_url || ''}/>
                <div style={{flex:1, minWidth:0}}>
                  <div style={{fontSize:12.5, fontWeight:700,
                    marginBottom:2}}>
                    {post.profiles?.name}
                  </div>
                  <div style={{fontSize:13, lineHeight:1.55,
                    color:T.text, marginBottom:4}}>
                    {post.paper_title || text || '(no text)'}
                    {text.length === 200 ? '…' : ''}
                  </div>
                  <div style={{fontSize:11.5, color:T.mu}}>
                    Saved {timeAgo(sp.saved_at)}
                  </div>
                </div>
                <button onClick={() => unsavePost(sp)} style={{
                  fontSize:12, color:T.mu, border:'none',
                  background:'transparent', cursor:'pointer',
                  flexShrink:0, lineHeight:1,
                }} title="Unsave">
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
```

---

## Step 5 — Bookmark icon on PostCard and GroupPostCard

In `src/feed/PostCard.jsx`:

Remove any existing per-card saved status `useEffect` queries.
Receive `isSaved` and `onSaveToggled` as props instead.

```javascript
// Props: isSaved (boolean), onSaveToggled (function)
const [saved, setSaved] = useState(isSaved);
useEffect(() => { setSaved(isSaved); }, [isSaved]);

const toggleSave = async () => {
  const next = !saved;
  setSaved(next); // optimistic
  if (next) {
    await supabase.from('saved_posts').insert({
      user_id: user.id, post_id: post.id,
    });
  } else {
    await supabase.from('saved_posts').delete()
      .eq('user_id', user.id).eq('post_id', post.id);
  }
  onSaveToggled && onSaveToggled();
};
```

Add bookmark button to the action bar (right side):

```jsx
<button onClick={toggleSave}
  title={saved ? 'Unsave' : 'Save post'}
  style={{
    display:'flex', alignItems:'center', justifyContent:'center',
    width: isMobile ? 30 : 34, height: isMobile ? 30 : 34,
    border:'none', background:'transparent', cursor:'pointer',
    color: saved ? T.v : T.mu,
  }}>
  <svg width={isMobile ? 14 : 16} height={isMobile ? 14 : 16}
    viewBox="0 0 24 24"
    fill={saved ? T.v : 'none'}
    stroke={saved ? T.v : T.mu} strokeWidth="1.8">
    <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
  </svg>
</button>
```

Apply the same pattern to `GroupPostCard.jsx` using `group_post_id`.

---

## Step 6 — Group Library tab

In `src/groups/GroupScreen.jsx`, add Library to the sidebar:

```
📋 Feed
👥 Members
🏛️ Profile
📚 Library   ← new
```

Create `src/groups/GroupLibrary.jsx`:

Nearly identical to LibraryScreen's papers tab, but:
- Fetches folders with `group_id = groupId`
- Calls `create_group_library_defaults` on first visit
- `canManageFolders` = `myRole === 'admin'` only
- Any member can add papers (`myRole !== null` and `myRole !== 'alumni'`)
- `showGroupPublicationToggle = true` when the active folder is
  "Our Group's Publications"
- `isAdmin = myRole === 'admin'`

```javascript
const fetchFolders = async () => {
  const { data } = await supabase
    .from('library_folders')
    .select('*')
    .eq('group_id', groupId)
    .order('sort_order');

  if (!data?.length) {
    // First visit — create default folders
    await supabase.rpc('create_group_library_defaults',
      { p_group_id: groupId });
    return fetchFolders();
  }
  setFolders(data);
  setActiveFolderID(data[0]?.id);
};

const toggleGroupPublication = async (item) => {
  await supabase.from('library_items')
    .update({ is_group_publication: !item.is_group_publication })
    .eq('id', item.id);
  fetchItems(activeFolderID);
  // Signal group profile to refresh its publication count
  onStatsChanged && onStatsChanged();
};

const isOurPublicationsFolder = () => {
  const f = folders.find(f => f.id === activeFolderID);
  return f?.name === "Our Group's Publications";
};
```

Pass to `LibraryItemCard`:
```jsx
<LibraryItemCard
  key={item.id}
  item={item}
  onDelete={canDelete ? deleteItem : null}
  showGroupPublicationToggle={isOurPublicationsFolder()}
  onToggleGroupPublication={toggleGroupPublication}
  isAdmin={myRole === 'admin'}
/>
```

For delete permissions: any member can delete items they added,
admins can delete any item.

---

## Step 7 — Wire into App.jsx

### Batch saved IDs at app level

Move the saved post ID fetching to App.jsx so it's available to
both FeedScreen and LibraryScreen:

```javascript
const [savedPostIds,      setSavedPostIds]      = useState(new Set());
const [savedGroupPostIds, setSavedGroupPostIds] = useState(new Set());

const fetchSavedIds = async () => {
  if (!session) return;
  const { data } = await supabase
    .from('saved_posts')
    .select('post_id, group_post_id')
    .eq('user_id', session.user.id);
  setSavedPostIds(new Set(
    (data||[]).map(r=>r.post_id).filter(Boolean)
  ));
  setSavedGroupPostIds(new Set(
    (data||[]).map(r=>r.group_post_id).filter(Boolean)
  ));
};

useEffect(() => { if (session) fetchSavedIds(); }, [session]);
```

Pass to FeedScreen, GroupFeed, and LibraryScreen:
```jsx
<FeedScreen
  savedPostIds={savedPostIds}
  onSaveToggled={fetchSavedIds}
  // ...other props
/>

<LibraryScreen
  savedPostIds={savedPostIds}
  savedGroupPostIds={savedGroupPostIds}
  onSaveToggled={fetchSavedIds}
  // ...other props
/>
```

### Add Library nav item

Desktop sidebar:
```javascript
{ id: 'library', label: 'Library', icon: libraryIconPath }
```

Mobile hamburger drawer: remove `disabled: true` from the Library item.

Add to screens:
```jsx
library: <LibraryScreen
  user={session?.user}
  savedPostIds={savedPostIds}
  savedGroupPostIds={savedGroupPostIds}
  onSaveToggled={fetchSavedIds}
/>,
```

---

## What NOT to change

- PublicationsTab (personal publication list) — separate from Library
- Existing group feed, group post logic
- The auto-tag Edge Function
- Run `npm run build` when done

---

## Remind the user

1. Run `migration_library.sql` in Supabase SQL Editor
2. Create `library-files` storage bucket in Supabase:
   Storage → New bucket → name: `library-files` → Public: ON
3. Personal Library starts completely empty — the user creates
   their own folders. No defaults are created automatically.
4. Group Library defaults (Journal Club + Our Group's Publications)
   are created on the first time any member opens the Library tab.
   Admins can delete these if they want.
5. Test the performance improvement: open browser DevTools → Network
   tab → load the feed → verify only ONE `saved_posts` query fires
   (not one per post card)
6. Test group publication count: mark a paper as "Our publication"
   in the group library → check the group profile stats → count
   should increment immediately
