# Task: Phase 5A — Projects Foundation

## Context

Read CLAUDE.md and PRODUCT_STATE.md first.

Projects are activity-driven collaboration spaces — focused on discussion,
not file storage. Files can be shared via post uploads, keeping all content
in context of a conversation.

Projects exist at two levels sharing the same architecture:
- **Personal projects** — user_id, accessed from personal sidebar nav
- **Group projects** — group_id, accessed from group sidebar

Project sidebar has exactly two sections:
- **Feed** — with folders as sub-navigation items (All Posts + template folders)
- **Members** — who is in this project

No Files tab. If files need sharing, they go in a post.

---

## Step 1 — SQL migration

Create `migration_projects_phase5a.sql` in the project root:

```sql
-- ── PROJECTS ──────────────────────────────────────────────────────────────────

create table if not exists projects (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid references profiles(id) on delete cascade,
  group_id       uuid references groups(id) on delete cascade,
  name           text not null,
  description    text default '',
  template_type  text default 'blank',
  cover_color    text default '#6c63ff',
  icon           text default '✏️',
  status         text default 'active', -- 'active' | 'archived'
  created_by     uuid references profiles(id) on delete set null,
  created_at     timestamptz default now(),
  updated_at     timestamptz default now(),
  constraint projects_owner check (
    (user_id is not null) != (group_id is not null)
  )
);

-- ── PROJECT MEMBERS ───────────────────────────────────────────────────────────

create table if not exists project_members (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  role       text default 'member', -- 'owner' | 'member'
  joined_at  timestamptz default now(),
  unique(project_id, user_id)
);

-- ── PROJECT FOLDERS ───────────────────────────────────────────────────────────
-- Organisational structure within a project.
-- Folders appear in the project sidebar as sub-navigation under Feed.
-- All folders are renameable and deletable — no restrictions.

create table if not exists project_folders (
  id         uuid primary key default gen_random_uuid(),
  project_id uuid references projects(id) on delete cascade not null,
  name       text not null,
  sort_order integer default 0,
  created_at timestamptz default now()
);

-- ── PROJECT POSTS ─────────────────────────────────────────────────────────────
-- Separate table. Full post types supported.
-- Includes encryption placeholder columns for future Phase 6 alignment.

create table if not exists project_posts (
  id                uuid primary key default gen_random_uuid(),
  project_id        uuid references projects(id) on delete cascade not null,
  folder_id         uuid references project_folders(id) on delete set null,
  user_id           uuid references profiles(id) on delete cascade not null,

  -- Content
  post_type         text default 'text', -- text | paper | upload
  content           text default '',
  content_iv        text default '',     -- Phase 6 placeholder
  content_encrypted boolean default false,

  -- Paper fields
  paper_doi         text default '',
  paper_title       text default '',
  paper_journal     text default '',
  paper_authors     text default '',
  paper_abstract    text default '',
  paper_year        text default '',

  -- File/upload fields
  image_url         text default '',
  file_type         text default '',
  file_name         text default '',

  -- Taxonomy
  tags              text[] default '{}',
  tier1             text default '',
  tier2             text[] default '{}',

  -- Project-specific
  is_sticky         boolean default false,
  is_starter        boolean default false, -- created by template
  edited_at         timestamptz default null,
  created_at        timestamptz default now()
);

-- ── VIEW ─────────────────────────────────────────────────────────────────────

create or replace view project_posts_with_meta as
select
  pp.*,
  pr.name           as author_name,
  pr.title          as author_title,
  pr.institution    as author_institution,
  pr.avatar_color   as author_avatar,
  pr.avatar_url     as author_avatar_url,
  pr.identity_tier2 as author_identity_tier2,
  pf.name           as folder_name,
  p.name            as project_name,
  p.icon            as project_icon,
  p.cover_color     as project_color,
  p.group_id        as project_group_id,
  (select count(*) from project_post_likes    l where l.post_id = pp.id)
    as like_count,
  (select count(*) from project_post_comments c where c.post_id = pp.id)
    as comment_count
from project_posts pp
join profiles pr on pr.id = pp.user_id
join projects p  on p.id  = pp.project_id
left join project_folders pf on pf.id = pp.folder_id;

grant select on project_posts_with_meta to anon, authenticated;

-- ── INTERACTIONS ─────────────────────────────────────────────────────────────

create table if not exists project_post_likes (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references project_posts(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  created_at timestamptz default now(),
  unique(post_id, user_id)
);

create table if not exists project_post_comments (
  id         uuid primary key default gen_random_uuid(),
  post_id    uuid references project_posts(id) on delete cascade not null,
  user_id    uuid references profiles(id) on delete cascade not null,
  content    text not null,
  created_at timestamptz default now()
);

-- ── INDEXES ──────────────────────────────────────────────────────────────────

create index if not exists idx_project_posts_project
  on project_posts(project_id, created_at desc);
create index if not exists idx_project_posts_folder
  on project_posts(folder_id);
create index if not exists idx_projects_user
  on projects(user_id) where user_id is not null;
create index if not exists idx_projects_group
  on projects(group_id) where group_id is not null;
create index if not exists idx_project_members_user
  on project_members(user_id);

-- ── RLS ──────────────────────────────────────────────────────────────────────

alter table projects              enable row level security;
alter table project_members       enable row level security;
alter table project_folders       enable row level security;
alter table project_posts         enable row level security;
alter table project_post_likes    enable row level security;
alter table project_post_comments enable row level security;

-- Projects
create policy "proj_select" on projects for select using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role in ('admin','member')
  ))
);
create policy "proj_insert" on projects for insert
  with check (auth.uid() = created_by);
create policy "proj_update" on projects for update using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role = 'admin'
  ))
);
create policy "proj_delete" on projects for delete using (
  (user_id is not null and auth.uid() = user_id) or
  (group_id is not null and group_id in (
    select group_id from group_members
    where user_id = auth.uid() and role = 'admin'
  ))
);

-- Project members
create policy "pm_select" on project_members for select using (
  project_id in (select id from projects)
);
create policy "pm_insert" on project_members for insert with check (
  auth.uid() = user_id or
  project_id in (select id from projects where user_id = auth.uid()) or
  project_id in (
    select p.id from projects p
    join group_members gm on gm.group_id = p.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);
create policy "pm_delete" on project_members for delete using (
  auth.uid() = user_id or
  project_id in (
    select p.id from projects p
    join group_members gm on gm.group_id = p.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);

-- Folders — inherit project access
create policy "pf_select" on project_folders for select using (
  project_id in (select id from projects)
);
create policy "pf_insert" on project_folders for insert with check (
  project_id in (select id from projects)
);
create policy "pf_update" on project_folders for update using (
  project_id in (select id from projects)
);
create policy "pf_delete" on project_folders for delete using (
  project_id in (select id from projects)
);

-- Posts
create policy "pp_select" on project_posts for select using (
  project_id in (select id from projects)
);
create policy "pp_insert" on project_posts for insert with check (
  auth.uid() = user_id and project_id in (select id from projects)
);
create policy "pp_update" on project_posts for update using (
  auth.uid() = user_id or
  project_id in (select id from projects where user_id = auth.uid()) or
  project_id in (
    select p.id from projects p
    join group_members gm on gm.group_id = p.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);
create policy "pp_delete" on project_posts for delete using (
  auth.uid() = user_id or
  project_id in (select id from projects where user_id = auth.uid()) or
  project_id in (
    select p.id from projects p
    join group_members gm on gm.group_id = p.group_id
    where gm.user_id = auth.uid() and gm.role = 'admin'
  )
);

create policy "ppl_select" on project_post_likes for select using (
  post_id in (select id from project_posts)
);
create policy "ppl_insert" on project_post_likes for insert
  with check (auth.uid() = user_id);
create policy "ppl_delete" on project_post_likes for delete
  using (auth.uid() = user_id);

create policy "ppc_select" on project_post_comments for select using (
  post_id in (select id from project_posts)
);
create policy "ppc_insert" on project_post_comments for insert
  with check (auth.uid() = user_id);
create policy "ppc_delete" on project_post_comments for delete
  using (auth.uid() = user_id);
```

Tell the user to run this in Supabase SQL Editor.

---

## Step 2 — Template definitions

Create `src/lib/projectTemplates.js`:

```javascript
/**
 * Project templates — activity-driven, not storage-oriented.
 * Templates create folders AND starter posts.
 * Starter posts answer "what should I do next?" immediately.
 * {projectName} in content is replaced at creation time.
 */

export const PROJECT_TEMPLATES = {

  conference: {
    type:        'conference',
    label:       'Conference',
    icon:        '🗓️',
    color:       '#f59e0b',
    description: 'Coordinate your team and capture key insights during a conference.',
    usedBy:      'Research teams, lab groups, pharma teams',
    folders: [
      { name: 'Planning',      sort_order: 0 },
      { name: 'Key Sessions',  sort_order: 1 },
      { name: 'Daily Notes',   sort_order: 2 },
      { name: 'Papers Shared', sort_order: 3 },
      { name: 'Action Items',  sort_order: 4 },
    ],
    starterPosts: [
      {
        folder:    'Planning',
        is_sticky: true,
        content: `<h3>📋 Welcome to {projectName}</h3>
<p>Use this space to coordinate before, during, and after the conference.</p>
<ul>
<li>Add sessions you plan to attend in <em>Key Sessions</em></li>
<li>Share papers from the programme in <em>Papers Shared</em></li>
<li>Post daily notes and highlights in <em>Daily Notes</em></li>
<li>Capture follow-ups and new contacts in <em>Action Items</em></li>
</ul>`,
      },
      {
        folder:  'Key Sessions',
        content: `<p>📌 <strong>Add a session you're planning to attend</strong></p>
<p>Share the title, speaker, time, and why it's relevant to your work. Others can add their picks too.</p>`,
      },
      {
        folder:  'Daily Notes',
        content: `<p>📝 <strong>Day 1 — Share your highlights</strong></p>
<p>What was the most interesting talk or conversation today? Even rough bullet points help the team stay aligned.</p>`,
      },
      {
        folder:  'Action Items',
        content: `<p>✅ <strong>People to follow up with</strong></p>
<p>Add contacts you met and what you discussed. Include their email or institution if you have it.</p>`,
      },
    ],
  },

  journal_club: {
    type:        'journal_club',
    label:       'Journal Club',
    icon:        '📖',
    color:       '#6c63ff',
    description: 'Run a recurring paper discussion with structured takeaways.',
    usedBy:      'Lab groups, residency programs, research teams',
    folders: [
      { name: "This Week's Paper", sort_order: 0 },
      { name: 'Discussion',        sort_order: 1 },
      { name: 'Key Takeaways',     sort_order: 2 },
      { name: 'Past Sessions',     sort_order: 3 },
    ],
    starterPosts: [
      {
        folder:    "This Week's Paper",
        is_sticky: true,
        content: `<p>📄 <strong>Add this week's paper</strong></p>
<p>Share the paper you're discussing this session using the paper post type — paste the DOI or search Europe PMC. Add a one-line reason why you chose it.</p>`,
      },
      {
        folder:  'Discussion',
        content: `<p>💬 <strong>What's your initial take?</strong></p>
<p>Before the session, share one thought on the paper — the methodology, the findings, or what surprised you. Doesn't need to be polished.</p>`,
      },
      {
        folder:  'Discussion',
        content: `<p>❓ <strong>Questions to discuss</strong></p>
<p>Add questions you want the group to tackle during the session. Others can add theirs too.</p>`,
      },
      {
        folder:  'Key Takeaways',
        content: `<p>🏆 <strong>Share your single most important learning</strong></p>
<p>After the session — what's the one thing you're taking away? One sentence is enough.</p>`,
      },
    ],
  },

  publication: {
    type:        'publication',
    label:       'Publication',
    icon:        '✍️',
    color:       '#10b981',
    description: 'Coordinate a manuscript from first draft to submission.',
    usedBy:      'Research teams, co-author groups',
    folders: [
      { name: 'Drafts',         sort_order: 0 },
      { name: 'Figures & Data', sort_order: 1 },
      { name: 'References',     sort_order: 2 },
      { name: 'Reviews',        sort_order: 3 },
      { name: 'Submission',     sort_order: 4 },
    ],
    starterPosts: [
      {
        folder:    'Drafts',
        is_sticky: true,
        content: `<h3>✍️ Welcome to {projectName}</h3>
<p><strong>Current status:</strong> [update this]</p>
<p><strong>Target journal:</strong> [add journal name]</p>
<p><strong>Submission deadline:</strong> [add date]</p>
<p><strong>Co-authors:</strong> [tag them here]</p>`,
      },
      {
        folder:  'Drafts',
        content: `<p>📝 <strong>Open questions before we start writing</strong></p>
<p>What do we need to agree on before drafting? List them here so co-authors can weigh in.</p>`,
      },
      {
        folder:  'Reviews',
        content: `<p>🔍 <strong>Co-author review round</strong></p>
<p>When the draft is ready, share it here and note which sections need most attention.</p>`,
      },
      {
        folder:  'Submission',
        content: `<p>📬 <strong>Submission checklist</strong></p>
<p>Before submitting: cover letter drafted · figures in correct format · author contributions statement · conflict of interest statement · supplementary files ready.</p>`,
      },
    ],
  },

  blank: {
    type:        'blank',
    label:       'Blank Project',
    icon:        '✏️',
    color:       '#6b7280',
    description: 'Start with a clean slate — your structure, your way.',
    usedBy:      'Anyone',
    folders: [],
    starterPosts: [
      {
        folder:    null,
        is_sticky: true,
        content: `<p>👋 <strong>Welcome to {projectName}</strong></p>
<p>This is your space. Add folders using the + button in the sidebar, then start posting.</p>`,
      },
    ],
  },

};

export const TEMPLATE_LIST = Object.values(PROJECT_TEMPLATES);

/**
 * Apply a template to a newly created project.
 * Returns { folders, posts } ready to insert into the database.
 * Caller must resolve _folderName → folder_id after inserting folders.
 */
export function applyTemplate(template, projectName, projectId, userId) {
  const folders = template.folders.map(f => ({
    project_id: projectId,
    name:       f.name,
    sort_order: f.sort_order,
  }));

  const posts = template.starterPosts.map(sp => ({
    project_id:  projectId,
    user_id:     userId,
    post_type:   'text',
    is_starter:  true,
    is_sticky:   sp.is_sticky || false,
    content:     sp.content.replace(/\{projectName\}/g, projectName),
    _folderName: sp.folder, // resolved to folder_id after folder insert
  }));

  return { folders, posts };
}
```

---

## Step 3 — Project creation modal

Create `src/projects/CreateProjectModal.jsx`.

Two-step modal:

### Step 1 — Template selection (2×2 grid)

```jsx
import { TEMPLATE_LIST } from '../lib/projectTemplates';

<div style={{
  display: 'grid', gridTemplateColumns: '1fr 1fr',
  gap: 10, marginBottom: 20,
}}>
  {TEMPLATE_LIST.map(t => (
    <button key={t.type}
      onClick={() => setSelectedTemplate(t.type)}
      style={{
        padding: '16px 14px', borderRadius: 12,
        cursor: 'pointer', fontFamily: 'inherit',
        textAlign: 'left',
        border: `2px solid ${
          selectedTemplate === t.type ? t.color : T.bdr}`,
        background: selectedTemplate === t.type
          ? `${t.color}14` : T.w,
        transition: 'all .12s',
      }}>
      <div style={{fontSize: 28, marginBottom: 6}}>{t.icon}</div>
      <div style={{fontSize: 13, fontWeight: 700, marginBottom: 3}}>
        {t.label}
      </div>
      <div style={{fontSize: 11.5, color: T.mu, lineHeight: 1.5}}>
        {t.description}
      </div>
    </button>
  ))}
</div>
```

### Step 2 — Project name and description

```jsx
<input
  value={projectName}
  onChange={e => setProjectName(e.target.value)}
  placeholder="Project name..."
  autoFocus
  style={{...inputStyle, marginBottom: 10}}
/>
<textarea
  value={description}
  onChange={e => setDescription(e.target.value)}
  placeholder="Brief description (optional)"
  rows={2}
  style={{...inputStyle, resize: 'none', marginBottom: 16}}
/>
<Btn variant="s"
  onClick={createProject}
  disabled={!projectName.trim() || creating}
  style={{width: '100%'}}>
  {creating ? 'Creating…' : `Create ${selectedTemplate === 'blank'
    ? 'project' : PROJECT_TEMPLATES[selectedTemplate]?.label}`}
</Btn>
```

### Create handler

```javascript
import { applyTemplate, PROJECT_TEMPLATES } from '../lib/projectTemplates';

const createProject = async () => {
  if (!projectName.trim() || creating) return;
  setCreating(true);

  const template = PROJECT_TEMPLATES[selectedTemplate];

  // 1. Insert project
  const { data: project } = await supabase
    .from('projects')
    .insert({
      [isGroupProject ? 'group_id' : 'user_id']: ownerId,
      name:          projectName.trim(),
      description:   description.trim(),
      template_type: selectedTemplate,
      icon:          template.icon,
      cover_color:   template.color,
      created_by:    user.id,
    })
    .select()
    .single();

  // 2. Add creator as owner
  await supabase.from('project_members').insert({
    project_id: project.id,
    user_id:    user.id,
    role:       'owner',
  });

  // 3. Create folders
  const { folders, posts } = applyTemplate(
    template, projectName.trim(), project.id, user.id
  );

  let folderIdMap = {};
  if (folders.length) {
    const { data: createdFolders } = await supabase
      .from('project_folders')
      .insert(folders)
      .select();
    (createdFolders || []).forEach(f => {
      folderIdMap[f.name] = f.id;
    });
  }

  // 4. Create starter posts (resolve folder IDs)
  if (posts.length) {
    const toInsert = posts.map(p => {
      const { _folderName, ...rest } = p;
      return {
        ...rest,
        folder_id: _folderName ? (folderIdMap[_folderName] || null) : null,
      };
    });
    await supabase.from('project_posts').insert(toInsert);
  }

  setCreating(false);
  onProjectCreated(project.id);
};
```

---

## Step 4 — Project screen with folder sidebar

Create `src/projects/ProjectScreen.jsx`.

### Layout

```
┌──────────────────────┬──────────────────────────────────┐
│  ← All projects      │                                  │
│                      │                                  │
│  🗓️ Conference 2025  │     [Post feed / Members]       │
│  amber accent bar    │                                  │
│                      │                                  │
│  ─── Feed ─────────  │                                  │
│    📋 All Posts  ←   │                                  │
│    📁 Planning       │                                  │
│    📁 Key Sessions   │                                  │
│    📁 Daily Notes    │                                  │
│    📁 Papers Shared  │                                  │
│    📁 Action Items   │                                  │
│    + Add folder      │                                  │
│                      │                                  │
│  ─── Members ──────  │                                  │
│                      │                                  │
│  [Archive] [Delete]  │                                  │
└──────────────────────┴──────────────────────────────────┘
```

### Sidebar implementation

```jsx
export default function ProjectScreen({ projectId, user, onBack }) {
  const [project,         setProject]         = useState(null);
  const [folders,         setFolders]         = useState([]);
  const [myRole,          setMyRole]          = useState(null);
  const [activeFolderId,  setActiveFolderId]  = useState(null); // null = All Posts
  const [activeSection,   setActiveSection]   = useState('feed'); // 'feed' | 'members'
  const [addingFolder,    setAddingFolder]    = useState(false);
  const [newFolderName,   setNewFolderName]   = useState('');
  const [loading,         setLoading]         = useState(true);

  useEffect(() => {
    const load = async () => {
      const [{ data: proj }, { data: fols }, { data: mem }] =
        await Promise.all([
          supabase.from('projects').select('*').eq('id', projectId).single(),
          supabase.from('project_folders').select('*')
            .eq('project_id', projectId).order('sort_order'),
          supabase.from('project_members').select('role')
            .eq('project_id', projectId).eq('user_id', user.id).single(),
        ]);
      setProject(proj);
      setFolders(fols || []);
      setMyRole(mem?.role || null);
      setLoading(false);
    };
    load();
  }, [projectId]);

  const addFolder = async () => {
    if (!newFolderName.trim()) return;
    const { data } = await supabase.from('project_folders').insert({
      project_id: projectId,
      name:       newFolderName.trim(),
      sort_order: folders.length,
    }).select().single();
    if (data) {
      setFolders(f => [...f, data]);
      setActiveFolderId(data.id);
    }
    setNewFolderName('');
    setAddingFolder(false);
  };

  const deleteFolder = async (folder) => {
    if (!window.confirm(
      `Delete "${folder.name}"? Posts in it will move to All Posts.`
    )) return;
    // Set folder_id to null on posts first
    await supabase.from('project_posts')
      .update({ folder_id: null })
      .eq('folder_id', folder.id);
    await supabase.from('project_folders').delete().eq('id', folder.id);
    setFolders(f => f.filter(x => x.id !== folder.id));
    if (activeFolderId === folder.id) setActiveFolderId(null);
  };

  const isOwner = myRole === 'owner';

  if (loading) return <Spinner/>;

  return (
    <div style={{display:'flex', flex:1, overflow:'hidden'}}>

      {/* ── Sidebar ── */}
      <div style={{
        width: 200, flexShrink: 0, background: T.w,
        borderRight: `1px solid ${T.bdr}`,
        display: 'flex', flexDirection: 'column',
        overflowY: 'auto',
      }}>

        {/* Back */}
        <button onClick={onBack} style={{
          fontSize: 11, color: T.mu, padding: '10px 14px 0',
          border: 'none', background: 'transparent',
          cursor: 'pointer', textAlign: 'left',
          fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 4,
        }}>
          ← All projects
        </button>

        {/* Project identity */}
        <div style={{
          padding: '10px 14px 14px',
          borderBottom: `1px solid ${T.bdr}`,
        }}>
          <div style={{
            height: 4, borderRadius: 2,
            background: project.cover_color || T.v,
            marginBottom: 10,
          }}/>
          <div style={{fontSize: 22, marginBottom: 4}}>
            {project.icon}
          </div>
          <div style={{
            fontSize: 13, fontWeight: 700, lineHeight: 1.3,
            marginBottom: 4,
          }}>
            {project.name}
          </div>
          {project.description && (
            <div style={{fontSize: 11.5, color: T.mu, lineHeight: 1.4}}>
              {project.description}
            </div>
          )}
        </div>

        {/* ── Feed section ── */}
        <div style={{padding: '10px 0 4px'}}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: T.mu,
            textTransform: 'uppercase', letterSpacing: '.07em',
            padding: '0 14px 6px',
          }}>
            Feed
          </div>

          {/* All Posts */}
          <SidebarItem
            label="📋 All Posts"
            active={activeSection === 'feed' && activeFolderId === null}
            onClick={() => {
              setActiveSection('feed');
              setActiveFolderId(null);
            }}
          />

          {/* Folder items */}
          {folders.map(folder => (
            <SidebarItem
              key={folder.id}
              label={`📁 ${folder.name}`}
              active={activeSection === 'feed' &&
                activeFolderId === folder.id}
              onClick={() => {
                setActiveSection('feed');
                setActiveFolderId(folder.id);
              }}
              onDelete={isOwner ? () => deleteFolder(folder) : null}
            />
          ))}

          {/* Add folder */}
          {!addingFolder ? (
            <button onClick={() => setAddingFolder(true)} style={{
              width: '100%', padding: '6px 14px',
              border: 'none', background: 'transparent',
              cursor: 'pointer', fontFamily: 'inherit',
              fontSize: 12, color: T.mu,
              textAlign: 'left', display: 'flex',
              alignItems: 'center', gap: 6,
            }}>
              <span style={{fontSize: 14}}>+</span> Add folder
            </button>
          ) : (
            <div style={{padding: '4px 10px'}}>
              <input
                autoFocus
                value={newFolderName}
                onChange={e => setNewFolderName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') addFolder();
                  if (e.key === 'Escape') {
                    setAddingFolder(false);
                    setNewFolderName('');
                  }
                }}
                placeholder="Folder name..."
                style={{
                  width: '100%', fontSize: 12.5,
                  padding: '5px 8px',
                  border: `1.5px solid ${T.v}`,
                  borderRadius: 7, fontFamily: 'inherit',
                  outline: 'none',
                }}
              />
              <div style={{fontSize: 10.5, color: T.mu, marginTop: 2}}>
                Enter · Esc to cancel
              </div>
            </div>
          )}
        </div>

        {/* ── Members section ── */}
        <div style={{padding: '4px 0'}}>
          <div style={{
            fontSize: 10, fontWeight: 700, color: T.mu,
            textTransform: 'uppercase', letterSpacing: '.07em',
            padding: '6px 14px',
          }}>
            Members
          </div>
          <SidebarItem
            label="👥 Members"
            active={activeSection === 'members'}
            onClick={() => setActiveSection('members')}
          />
        </div>

        {/* ── Owner actions ── */}
        <div style={{
          marginTop: 'auto', padding: '10px 14px',
          borderTop: `1px solid ${T.bdr}`,
          display: 'flex', flexDirection: 'column', gap: 4,
        }}>
          {isOwner && (
            <>
              <button onClick={archiveProject} style={{
                fontSize: 12, color: T.mu, border: 'none',
                background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left',
                padding: '3px 0',
              }}>
                📦 Archive project
              </button>
              <button onClick={deleteProject} style={{
                fontSize: 12, color: T.ro, border: 'none',
                background: 'transparent', cursor: 'pointer',
                fontFamily: 'inherit', textAlign: 'left',
                padding: '3px 0',
              }}>
                Delete project
              </button>
            </>
          )}
          {!isOwner && (
            <button onClick={leaveProject} style={{
              fontSize: 12, color: T.mu, border: 'none',
              background: 'transparent', cursor: 'pointer',
              fontFamily: 'inherit', textAlign: 'left',
              padding: '3px 0',
            }}>
              Leave project
            </button>
          )}
        </div>
      </div>

      {/* ── Content area ── */}
      <div style={{flex: 1, overflow: 'hidden', display: 'flex',
        flexDirection: 'column'}}>
        {activeSection === 'feed' && (
          <ProjectFeed
            project={project}
            user={user}
            myRole={myRole}
            activeFolderId={activeFolderId}
            folders={folders}
          />
        )}
        {activeSection === 'members' && (
          <ProjectMembers
            project={project}
            user={user}
            myRole={myRole}
          />
        )}
      </div>
    </div>
  );
}

// Sidebar item component
function SidebarItem({ label, active, onClick, onDelete }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center',
      padding: '7px 14px', cursor: 'pointer',
      background: active ? T.v2 : 'transparent',
      color: active ? T.v : T.text,
      fontWeight: active ? 700 : 400,
      fontSize: 12.5,
    }}
    onClick={onClick}>
      <span style={{flex: 1, overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap'}}>
        {label}
      </span>
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          style={{
            fontSize: 11, color: T.mu, border: 'none',
            background: 'transparent', cursor: 'pointer',
            opacity: 0.5, flexShrink: 0, lineHeight: 1,
            padding: '0 0 0 4px',
          }}>
          ✕
        </button>
      )}
    </div>
  );
}
```

---

## Step 5 — Project feed

Create `src/projects/ProjectFeed.jsx`.

Fetches posts filtered by project (and optionally by folder).
Sticky posts always first.

```javascript
const fetchPosts = async () => {
  let query = supabase
    .from('project_posts_with_meta')
    .select('*')
    .eq('project_id', project.id)
    .order('is_sticky', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  // Filter by folder if one is selected
  if (activeFolderId) {
    query = query.eq('folder_id', activeFolderId);
  }

  const { data } = await query;
  setPosts(data || []);
};
```

Show the active folder name as a header above the feed:
```jsx
<div style={{
  padding: '10px 16px',
  borderBottom: `1px solid ${T.bdr}`,
  background: T.w,
  fontSize: 12, fontWeight: 700, color: T.mu,
  display: 'flex', alignItems: 'center', gap: 6,
}}>
  {activeFolderId
    ? `📁 ${folders.find(f => f.id === activeFolderId)?.name || 'Folder'}`
    : '📋 All Posts'
  }
</div>
```

When posting, allow the user to select which folder to post into
via a small dropdown in the compose area:

```jsx
{folders.length > 0 && (
  <select value={selectedFolderForPost || ''}
    onChange={e => setSelectedFolderForPost(e.target.value || null)}
    style={{...selectStyle, fontSize: 12, marginBottom: 8}}>
    <option value="">No folder (general)</option>
    {folders.map(f => (
      <option key={f.id} value={f.id}>{f.name}</option>
    ))}
  </select>
)}
```

Default the folder selector to `activeFolderId` when a folder is
currently selected in the sidebar — natural behaviour.

---

## Step 6 — Project post card

Create `src/projects/ProjectPostCard.jsx`.

Based on GroupPostCard. Key visual additions:

```jsx
{/* Folder badge — shown in All Posts view */}
{post.folder_name && !activeFolderId && (
  <span style={{
    fontSize: 10.5, color: T.mu,
    background: T.s2, padding: '1px 8px',
    borderRadius: 20, border: `1px solid ${T.bdr}`,
    marginBottom: 6, display: 'inline-block',
  }}>
    📁 {post.folder_name}
  </span>
)}

{/* Starter post badge */}
{post.is_sticky && post.is_starter && (
  <span style={{
    fontSize: 10.5, color: T.am,
    background: T.am2, padding: '1px 8px',
    borderRadius: 20, marginLeft: 4,
    display: 'inline-block', fontWeight: 600,
  }}>
    📌 Getting started
  </span>
)}
```

Actions: like (project_post_likes), comment (project_post_comments),
sticky toggle (owner or admin), delete (own posts + owner/admin).

---

## Step 7 — Project members tab

Create `src/projects/ProjectMembers.jsx`.

Simple list of project members with their role (owner / member).

For personal projects — only the owner (just the user themselves).
For group projects — subset of group members who have been added.

Owner can add group members to the project:
```javascript
// Search group members not yet in the project
const addMember = async (userId) => {
  await supabase.from('project_members').insert({
    project_id: projectId,
    user_id:    userId,
    role:       'member',
  });
  fetchMembers();
};
```

---

## Step 8 — Personal Projects screen

Create `src/projects/ProjectsScreen.jsx`.

Shows all personal projects as badge cards. Accessed from sidebar nav.

```jsx
// Empty state — inviting, not clinical
{projects.length === 0 && (
  <div style={{textAlign:'center', padding:'48px 20px'}}>
    <div style={{fontSize:40, marginBottom:12}}>🚀</div>
    <div style={{fontSize:16,
      fontFamily:"'DM Serif Display',serif",
      marginBottom:8, color:T.text}}>
      No projects yet
    </div>
    <div style={{fontSize:13, color:T.mu,
      marginBottom:20, lineHeight:1.6, maxWidth:300, margin:'0 auto 20px'}}>
      Projects are activity spaces for your research, writing,
      and collaboration — from a single conference to a full manuscript.
    </div>
    <Btn variant="s" onClick={() => setShowCreate(true)}>
      Create your first project
    </Btn>
  </div>
)}
```

Project badge cards in a 2-column grid. Each card shows:
- Colour accent bar (template colour) at top
- Icon + project name
- Template type label
- Description (truncated to 2 lines)
- Last activity (timeAgo of most recent post)

---

## Step 9 — Group Projects tab

In `src/groups/GroupScreen.jsx`, add Projects to the group sidebar:

```
📋 Feed
👥 Members
🏛️ Profile
📚 Library
🚀 Projects   ← new
```

Create `src/groups/GroupProjects.jsx`:

Same as ProjectsScreen but scoped to the group.
Any group member (not just admin) can create a project.
When a project is selected, render ProjectScreen with that project ID.

```javascript
const fetchGroupProjects = async () => {
  const { data } = await supabase
    .from('projects')
    .select('*')
    .eq('group_id', groupId)
    .eq('status', 'active')
    .order('updated_at', { ascending: false });
  setProjects(data || []);
};
```

---

## Step 10 — Group feed: project badge + filter

### Project badge on group feed posts

In `GroupPostCard.jsx`, if a post came from a project
(`post.project_name` is set), show a small badge:

```jsx
{post.project_name && (
  <div style={{
    fontSize: 11, color: T.mu,
    marginBottom: 4,
    display: 'flex', alignItems: 'center', gap: 4,
  }}>
    <span>{post.project_icon}</span>
    <span style={{fontWeight: 600}}>{post.project_name}</span>
  </div>
)}
```

Group project posts appear in the group feed because the group_id
is the same — no additional logic needed, just the visual badge.

### Group feed filter

In `GroupFeed.jsx`, add a filter row above the feed:

```jsx
const [feedFilter,    setFeedFilter]    = useState('all');
const [projectFilter, setProjectFilter] = useState(null);

// Filter row
<div style={{
  display: 'flex', gap: 6, padding: '10px 16px',
  borderBottom: `1px solid ${T.bdr}`,
  background: T.w, flexWrap: 'wrap',
}}>
  <button
    onClick={() => { setFeedFilter('all'); setProjectFilter(null); }}
    style={{...chipStyle, active: feedFilter === 'all'}}>
    📋 All posts
  </button>
  {groupProjects.map(p => (
    <button key={p.id}
      onClick={() => {
        setFeedFilter('project');
        setProjectFilter(p.id);
      }}
      style={{
        ...chipStyle,
        active: projectFilter === p.id,
        borderColor: projectFilter === p.id ? p.cover_color : T.bdr,
        background: projectFilter === p.id ? `${p.cover_color}14` : T.w,
        color: projectFilter === p.id ? p.cover_color : T.mu,
      }}>
      {p.icon} {p.name}
    </button>
  ))}
</div>
```

When a project filter is active, filter the fetched posts:
```javascript
const filtered = projectFilter
  ? posts.filter(p => p.project_id === projectFilter)
  : posts;
```

---

## Step 11 — Add Projects to personal sidebar nav

In `App.jsx`:

Add nav item:
```javascript
{ id: 'projects', label: 'Projects', icon: rocketIconPath }
```

Rocket SVG path:
```
M12 2L9.5 8.5 3 11l6.5 2.5L12 20l2.5-6.5L21 11l-6.5-2.5z
```

Add state:
```javascript
const [activeProjectId, setActiveProjectId] = useState(null);
```

Add to screens:
```jsx
projects: activeProjectId
  ? <ProjectScreen
      projectId={activeProjectId}
      user={session?.user}
      onBack={() => setActiveProjectId(null)}
    />
  : <ProjectsScreen
      user={session?.user}
      onSelectProject={id => {
        setActiveProjectId(id);
        setScreen('projects');
      }}
    />,
```

Clicking Projects nav always clears `activeProjectId` to return
to the overview — same pattern as Groups.

---

## What NOT to change

- No Files tab anywhere — removed by design
- Library, saved posts, group library — unchanged
- Public feed, profile, messages, notifications — unchanged
- Run `npm run build` when done

---

## Deployment

```bash
# 1. Run migration_projects_phase5a.sql in Supabase SQL Editor
# 2. Deploy:
git add . && git commit -m "Phase 5A: Projects foundation" && git push
```

---

## Testing checklist

- [ ] Create Conference project → sidebar shows 5 folders as sub-items
      under Feed, 4 starter posts exist in correct folders
- [ ] Create Journal Club → "This Week's Paper" is sticky, discussions
      and takeaways folders populated with prompts
- [ ] Create Publication → Drafts has status sticky, Reviews and
      Submission have activity prompts
- [ ] Create Blank → only welcome sticky, no folders in sidebar
- [ ] Click "All Posts" → shows all posts across folders
- [ ] Click a folder → shows only posts in that folder
- [ ] Add a new folder via "+ Add folder" → appears in sidebar instantly
- [ ] Delete a folder (owner) → posts move to All Posts, not deleted
- [ ] Create a group project → appears in group sidebar Projects tab
- [ ] Post in a group project → appears in group feed with project badge
- [ ] Group feed filter → select a project → only that project's posts
- [ ] Projects nav item → always returns to overview when clicked
- [ ] "← All projects" breadcrumb inside project works correctly
