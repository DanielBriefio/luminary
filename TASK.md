# Task: Library Restructure — Universal Files Tab (Phase 10)

## Context

Read CLAUDE.md, PRODUCT_STATE.md, SCHEMA.md, and TASK.md.

This task restructures the Library to add a universal Files tab that
shows all uploaded files regardless of source (post attachments,
library uploads, group uploads). It also updates the Settings storage
panel to link to the Library Files tab instead of managing files
inline.

The Library becomes three clear sections:
- **Papers** — DOI/EPMC bookmarks organised in folders (unchanged)
- **Saved Posts** — bookmarked feed posts (unchanged)
- **Files** — ALL uploaded files: library uploads + post attachments

Scope:

1. Read and understand current LibraryScreen structure
2. Add Files tab to LibraryScreen
3. File list with filter bar (All / From posts / From library)
4. Delete behaviour per source type
5. Update Settings storage panel — link to Library Files tab
6. Update AdminShell Storage section link (if applicable)

> ⚠️ LibraryScreen.jsx is a complex file. Read it carefully before
> modifying. The existing Papers and Saved Posts tabs must be
> completely unchanged. Only add the new Files tab.
>
> ⚠️ Deleting a post attachment is different from deleting a library
> file — post attachments use soft-delete (`file_deleted_at`) to
> show the "📎 File removed by author" placeholder. Library files
> can be hard-deleted. Handle each case correctly.

---

## Step 1 — Understand current structure

Read the following before making any changes:

1. `src/screens/LibraryScreen.jsx` — current tab structure, how
   Papers and Saved Posts are implemented, existing state management
2. `src/screens/AccountScreen.jsx` or wherever StoragePanel lives —
   how storage is currently shown in Settings
3. The `user_storage_files` table in SCHEMA.md — columns available
   (especially `source`, `context`, `file_url`, `file_name`,
   `file_size`, `post_id`, `group_post_id`, `created_at`)

Confirm:
- What tabs currently exist in LibraryScreen?
- Does `user_storage_files` have a `source` or context column that
  distinguishes library uploads from post attachments?
- Does `user_storage_files` have the `post_id` and `group_post_id`
  foreign keys needed for soft-delete cascade?

Report findings before proceeding. If `user_storage_files` lacks
the columns needed, add them via migration first.

---

## Step 2 — SQL: get_user_files RPC

Create a new RPC to fetch all files for the current user:

```sql
create or replace function get_user_files(
  p_source text default null  -- null = all, 'post' | 'library' | 'group_post'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id',           f.id,
      'file_name',    f.file_name,
      'file_url',     f.file_url,
      'file_size',    f.file_size,
      'file_type',    f.file_type,
      'source',       f.source,
      'post_id',      f.post_id,
      'group_post_id', f.group_post_id,
      'storage_path', f.storage_path,
      'created_at',   f.created_at,
      -- Post context for post attachments
      'post_snippet', case
        when f.post_id is not null then (
          select left(replace(content, '<[^>]+>', ''), 60)
          from posts where id = f.post_id
        )
        else null
      end,
      'post_deleted_at', case
        when f.post_id is not null then (
          select file_deleted_at from posts where id = f.post_id
        )
        else null
      end
    ) order by f.created_at desc), '[]'::jsonb)
    from user_storage_files f
    where f.user_id = auth.uid()
      and (p_source is null or f.source = p_source)
      -- Exclude profile avatars from the file manager
      and f.source != 'avatar'
  );
end;
$$;

grant execute on function get_user_files(text) to authenticated;
```

Also create the delete RPC that handles source-specific deletion:

```sql
create or replace function delete_user_file(
  p_file_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_file user_storage_files%rowtype;
  v_storage_path text;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;

  -- Fetch the file record
  select * into v_file
  from user_storage_files
  where id = p_file_id and user_id = auth.uid();

  if not found then
    raise exception 'file not found or not owned by you';
  end if;

  -- Source-specific delete behaviour:

  if v_file.source = 'post' and v_file.post_id is not null then
    -- Soft delete: mark the post as having its file removed
    -- PostCard will show "📎 File removed by author" placeholder
    update posts
    set
      file_deleted_at = now(),
      image_url       = null,
      file_name       = null,
      file_type       = null
    where id = v_file.post_id
      and user_id = auth.uid();

  elsif v_file.source = 'group_post' and v_file.group_post_id is not null then
    -- Soft delete on group post
    update group_posts
    set
      file_deleted_at = now(),
      image_url       = null,
      file_name       = null,
      file_type       = null
    where id = v_file.group_post_id
      and user_id = auth.uid();

  end if;

  -- Delete from storage (returns path for client-side storage.remove call)
  v_storage_path := v_file.storage_path;

  -- Delete tracking row
  delete from user_storage_files where id = p_file_id;

  -- Update profile storage total
  update profiles
  set storage_used_bytes = greatest(0,
    coalesce(storage_used_bytes, 0) - coalesce(v_file.file_size, 0)
  )
  where id = auth.uid();

  return jsonb_build_object(
    'storage_path', v_storage_path,
    'bucket',       v_file.bucket_name,
    'source',       v_file.source
  );
end;
$$;

grant execute on function delete_user_file(uuid) to authenticated;
```

Note: The client must also call `supabase.storage.from(bucket).remove([path])`
after the RPC succeeds to actually delete the file from storage.
The RPC returns the path and bucket name for this purpose.

Tell the user to run this migration in Supabase SQL Editor.

---

## Step 3 — Add Files tab to LibraryScreen

Read LibraryScreen.jsx carefully. Find where existing tabs are defined
(Papers / Saved Posts or equivalent). Add 'Files' as a new tab.

```javascript
// Add to tabs array — match existing tab definition pattern:
{ id: 'files', label: '📎 Files', icon: ... }
```

Add the tab panel conditional:
```jsx
{activeTab === 'files' && (
  <FilesTab supabase={supabase} user={user} profile={profile} />
)}
```

Do not change any existing tab — Papers and Saved Posts remain
exactly as they are.

---

## Step 4 — FilesTab component

Add as a local component within LibraryScreen.jsx (same file):

```jsx
function FilesTab({ supabase, user, profile }) {
  const [files, setFiles]         = useState([]);
  const [loading, setLoading]     = useState(true);
  const [sourceFilter, setSourceFilter] = useState('all');
  const [sortBy, setSortBy]       = useState('date');
  const [deleting, setDeleting]   = useState(null);
  const [error, setError]         = useState('');

  const SOURCE_FILTERS = [
    { id: 'all',      label: 'All files'      },
    { id: 'post',     label: 'From posts'     },
    { id: 'library',  label: 'From library'   },
  ];

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.rpc('get_user_files', {
      p_source: sourceFilter === 'all' ? null : sourceFilter,
    });
    setFiles(data || []);
    setLoading(false);
  }, [supabase, sourceFilter]);

  useEffect(() => { load(); }, [load]);

  const sorted = [...files].sort((a, b) => {
    if (sortBy === 'date') {
      return new Date(b.created_at) - new Date(a.created_at);
    }
    if (sortBy === 'size') {
      return (b.file_size || 0) - (a.file_size || 0);
    }
    if (sortBy === 'name') {
      return (a.file_name || '').localeCompare(b.file_name || '');
    }
    return 0;
  });

  // Total storage used
  const totalBytes = files.reduce((sum, f) => sum + (f.file_size || 0), 0);

  const handleDelete = async (file) => {
    if (!window.confirm(
      file.source === 'post'
        ? 'Delete this file? The post will remain but show "File removed by author".'
        : 'Delete this file? This cannot be undone.'
    )) return;

    setDeleting(file.id);
    setError('');

    // Call RPC — gets storage path back
    const { data: result, error: rpcErr } = await supabase.rpc(
      'delete_user_file', { p_file_id: file.id }
    );

    if (rpcErr) {
      setError('Failed to delete file. Please try again.');
      setDeleting(null);
      return;
    }

    // Delete from Supabase Storage
    if (result?.storage_path && result?.bucket) {
      await supabase.storage
        .from(result.bucket)
        .remove([result.storage_path]);
    }

    setDeleting(null);
    load(); // refresh list
  };

  const handleDownload = (file) => {
    const a = document.createElement('a');
    a.href = file.file_url;
    a.download = file.file_name || 'download';
    a.target = '_blank';
    a.click();
  };

  return (
    <div>
      {/* Storage summary */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
        padding: '10px 14px',
        background: T.s2,
        borderRadius: 10,
        border: `1px solid ${T.bdr}`,
      }}>
        <div style={{ fontSize: 13, color: T.mu }}>
          <span style={{ fontWeight: 700, color: T.text }}>
            {formatBytes(totalBytes)}
          </span>
          {' used across '}
          <span style={{ fontWeight: 700, color: T.text }}>
            {files.length}
          </span>
          {' file'}{files.length !== 1 ? 's' : ''}
        </div>
        <div style={{ fontSize: 12, color: T.mu }}>
          Full storage usage in{' '}
          <button
            onClick={() => {/* navigate to settings */}}
            style={{
              background: 'none', border: 'none',
              color: T.v, fontSize: 12, cursor: 'pointer',
              fontFamily: 'inherit', padding: 0,
              textDecoration: 'underline',
            }}
          >
            Settings
          </button>
        </div>
      </div>

      {/* Filter + sort bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 14,
        gap: 8,
        flexWrap: 'wrap',
      }}>
        {/* Source filter */}
        <div style={{ display: 'flex', gap: 4 }}>
          {SOURCE_FILTERS.map(f => (
            <button
              key={f.id}
              onClick={() => setSourceFilter(f.id)}
              style={{
                padding: '5px 12px', borderRadius: 20,
                border: `1px solid ${sourceFilter === f.id ? T.v : T.bdr}`,
                background: sourceFilter === f.id ? T.v2 : T.w,
                color: sourceFilter === f.id ? T.v3 : T.mu,
                fontSize: 12,
                fontWeight: sourceFilter === f.id ? 700 : 500,
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              {f.label}
            </button>
          ))}
        </div>

        {/* Sort */}
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          style={{
            padding: '5px 10px', borderRadius: 8,
            border: `1px solid ${T.bdr}`, background: T.w,
            fontSize: 12, color: T.text,
            fontFamily: 'inherit', cursor: 'pointer',
            outline: 'none',
          }}
        >
          <option value="date">Sort: Newest first</option>
          <option value="size">Sort: Largest first</option>
          <option value="name">Sort: Name A–Z</option>
        </select>
      </div>

      {error && (
        <div style={{
          padding: '8px 12px', borderRadius: 8,
          background: T.ro2, color: T.ro,
          fontSize: 13, marginBottom: 12,
        }}>
          {error}
        </div>
      )}

      {/* File list */}
      {loading ? (
        <div style={{ padding: 40, textAlign: 'center' }}>
          <Spinner />
        </div>
      ) : sorted.length === 0 ? (
        <div style={{
          padding: '60px 20px', textAlign: 'center',
          color: T.mu, fontSize: 14,
        }}>
          <div style={{ fontSize: 32, marginBottom: 10 }}>📎</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            No files yet
          </div>
          <div style={{ fontSize: 13 }}>
            Files you attach to posts or upload to your library
            will appear here.
          </div>
        </div>
      ) : (
        <div style={{
          background: T.w,
          border: `1px solid ${T.bdr}`,
          borderRadius: 12,
          overflow: 'hidden',
        }}>
          {/* Table header */}
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 80px 100px 90px 80px',
            padding: '9px 16px',
            borderBottom: `1px solid ${T.bdr}`,
            fontSize: 11, fontWeight: 600, color: T.mu,
            textTransform: 'uppercase', letterSpacing: 0.4,
          }}>
            <div>File</div>
            <div>Size</div>
            <div>Source</div>
            <div>Date</div>
            <div>Actions</div>
          </div>

          {sorted.map((file, i) => (
            <FileRow
              key={file.id}
              file={file}
              isLast={i === sorted.length - 1}
              deleting={deleting === file.id}
              onDelete={() => handleDelete(file)}
              onDownload={() => handleDownload(file)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({ file, isLast, deleting, onDelete, onDownload }) {
  const icon = getFileIcon(file.file_type, file.file_name);
  const isPostFile = file.source === 'post' || file.source === 'group_post';

  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '1fr 80px 100px 90px 80px',
      padding: '11px 16px',
      borderBottom: isLast ? 'none' : `1px solid ${T.bdr}`,
      alignItems: 'center',
    }}>
      {/* File name + context */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
        }}>
          <span style={{ fontSize: 18, flexShrink: 0 }}>{icon}</span>
          <div style={{ minWidth: 0 }}>
            <div style={{
              fontSize: 13.5, color: T.text, fontWeight: 500,
              overflow: 'hidden', textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}>
              {file.file_name || 'Unnamed file'}
            </div>
            {isPostFile && file.post_snippet && (
              <div style={{
                fontSize: 11.5, color: T.mu, marginTop: 2,
                overflow: 'hidden', textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                Post: "{file.post_snippet}…"
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Size */}
      <div style={{ fontSize: 12, color: T.mu }}>
        {formatBytes(file.file_size || 0)}
      </div>

      {/* Source badge */}
      <div>
        <span style={{
          fontSize: 11, fontWeight: 600,
          padding: '2px 8px', borderRadius: 20,
          background: isPostFile ? T.am2 : T.v2,
          color: isPostFile ? T.am : T.v,
        }}>
          {file.source === 'post'       ? 'Post'
         : file.source === 'group_post' ? 'Group post'
         : 'Library'}
        </span>
      </div>

      {/* Date */}
      <div style={{ fontSize: 12, color: T.mu }}>
        {new Date(file.created_at).toLocaleDateString('en-US', {
          month: 'short', day: 'numeric',
        })}
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 5 }}>
        <button
          onClick={onDownload}
          title="Download"
          style={{
            padding: '4px 8px', borderRadius: 6,
            border: `1px solid ${T.bdr}`, background: T.w,
            fontSize: 13, cursor: 'pointer', color: T.mu,
          }}
        >
          ↓
        </button>
        <button
          onClick={onDelete}
          disabled={deleting}
          title={isPostFile
            ? 'Remove from post'
            : 'Delete file'}
          style={{
            padding: '4px 8px', borderRadius: 6,
            border: `1px solid ${T.bdr}`,
            background: T.w, color: T.ro,
            fontSize: 13,
            cursor: deleting ? 'default' : 'pointer',
            opacity: deleting ? 0.5 : 1,
          }}
        >
          {deleting ? '…' : '🗑'}
        </button>
      </div>
    </div>
  );
}

// File type icon helper
function getFileIcon(fileType, fileName) {
  const ext = (fileName || '').split('.').pop()?.toLowerCase();
  if (fileType?.startsWith('image/') || ['jpg','jpeg','png','gif','webp'].includes(ext))
    return '🖼';
  if (fileType === 'application/pdf' || ext === 'pdf') return '📄';
  if (['xls','xlsx','csv'].includes(ext)) return '📊';
  if (['ppt','pptx'].includes(ext)) return '📑';
  if (['doc','docx'].includes(ext)) return '📝';
  if (['zip','rar','gz'].includes(ext)) return '🗜';
  return '📎';
}

// Format bytes helper
function formatBytes(bytes) {
  if (!bytes || bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}
```

---

## Step 5 — Update Settings storage panel

Read the current StoragePanel in AccountScreen (or wherever it lives).

Find where individual file management currently lives (delete buttons
per file). Replace the file list section with a link to Library → Files:

```jsx
{/* Replace individual file management with Library link */}
<div style={{
  marginTop: 16,
  padding: '12px 14px',
  background: T.s2,
  borderRadius: 10,
  border: `1px solid ${T.bdr}`,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
}}>
  <div>
    <div style={{ fontSize: 13, fontWeight: 600, color: T.text }}>
      Manage your files
    </div>
    <div style={{ fontSize: 12, color: T.mu, marginTop: 2 }}>
      View, download, and delete files from your Library
    </div>
  </div>
  <button
    onClick={() => onNavigate('library', { tab: 'files' })}
    style={{
      padding: '7px 14px', borderRadius: 8,
      border: `1px solid ${T.bdr}`, background: T.w,
      fontSize: 13, fontWeight: 600,
      color: T.v, cursor: 'pointer',
      fontFamily: 'inherit',
    }}
  >
    Open Library →
  </button>
</div>
```

The "Open Library →" button should navigate to LibraryScreen with
the Files tab pre-selected. Check how navigation works in the app
(likely `onNavigate('library')` or similar) and pass the tab
parameter so the Files tab opens directly.

If LibraryScreen doesn't currently accept a default tab prop, add one:

```jsx
// In LibraryScreen:
export default function LibraryScreen({
  supabase, user, profile,
  defaultTab = 'papers',  // ← add this prop
  onNavigate,
}) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  // ...
}
```

Keep the storage usage summary (total bytes, breakdown by category)
in Settings — only remove the individual file list and delete buttons.

---

## Step 6 — Group library Files tab (if applicable)

Check whether the group library (within GroupScreen or a group detail
view) has its own library section. If it does, apply the same Files
tab pattern scoped to group files:

- Filter: `p_source = 'group_post'` AND `group_id = current_group_id`
- Delete: soft-delete on group_post, remove from storage
- Group admins can delete any group member's file
- Regular members can only delete their own files

If group library is not yet implemented or is out of scope, skip
this step and note it as a follow-up.

---

## What NOT to change

- `src/screens/GroupsScreen.jsx` — legacy file, do not touch
- Existing Papers tab in LibraryScreen — completely unchanged
- Existing Saved Posts tab in LibraryScreen — completely unchanged
- The storage usage summary in Settings (total + category breakdown)
  — keep this, only remove the file list below it
- Post card "📎 File removed by author" placeholder — already built,
  should trigger correctly when post attachment is deleted via Files tab
- Run `npm run build` when done

---

## Deployment

```bash
# 1. Run migration in Supabase SQL Editor:
#    - get_user_files RPC
#    - delete_user_file RPC

# 2. Verify:
#    select get_user_files(null);  -- should return [] if no files yet

# 3. Deploy:
git add . && git commit -m "Phase 10: Library Files tab — universal file manager for library uploads and post attachments" && git push
```

---

## Remind the user

**Testing the delete flow for post attachments:**
1. Create a post with an image or PDF attached
2. Go to Library → Files
3. Find the file, click 🗑
4. Confirm the warning about "File removed by author"
5. Go back to the feed — the post should show "📎 File removed by author"
6. The file should no longer exist in Supabase Storage

**Testing the delete flow for library files:**
1. Upload a PDF directly to your library
2. Go to Library → Files
3. Delete it
4. Verify it's gone from the list and from Supabase Storage

**Navigating from Settings:**
1. Go to Settings → Account → Storage
2. The storage summary (total bytes, breakdown) should still be there
3. "Open Library →" button should navigate directly to Library → Files tab

---

## Testing checklist

**Migration:**
- [ ] `get_user_files` RPC exists and returns correct structure
- [ ] `delete_user_file` RPC exists
- [ ] Both RPCs require authentication (return error for anon)
- [ ] Avatar files excluded from results

**Files tab in Library:**
- [ ] Files tab appears alongside existing tabs
- [ ] Existing Papers and Saved Posts tabs completely unchanged
- [ ] Files tab loads without error (empty state when no files)
- [ ] Empty state shows helpful message about where files come from

**File list:**
- [ ] All files shown when "All files" filter selected
- [ ] "From posts" filter shows only post attachments
- [ ] "From library" filter shows only library uploads
- [ ] Sort by Date works (newest first)
- [ ] Sort by Size works (largest first)
- [ ] Sort by Name works (A-Z)
- [ ] File icon matches file type (PDF, image, Excel, etc.)
- [ ] Post snippet shown for post attachment files
- [ ] Source badge shows correctly (Post / Library)
- [ ] File size formatted correctly (KB / MB)
- [ ] Date formatted correctly

**Storage summary in Files tab:**
- [ ] Total bytes and file count shown at top of Files tab
- [ ] "Settings" link in summary navigates to Settings storage section

**Delete — library file:**
- [ ] Confirmation dialog appears
- [ ] File deleted from user_storage_files table
- [ ] File deleted from Supabase Storage
- [ ] Profile storage_used_bytes updated
- [ ] File disappears from list after deletion

**Delete — post attachment:**
- [ ] Confirmation dialog warns about "File removed by author"
- [ ] Post soft-deleted: image_url cleared, file_deleted_at set
- [ ] File deleted from Supabase Storage
- [ ] Post in feed shows "📎 File removed by author" placeholder
- [ ] File disappears from Files tab list

**Download:**
- [ ] Download button triggers file download
- [ ] Correct filename used for download

**Settings storage panel:**
- [ ] Storage summary (total + breakdown) still visible
- [ ] Individual file list removed from Settings
- [ ] "Open Library →" button present
- [ ] Clicking button navigates to Library with Files tab pre-selected

**Build:**
- [ ] `npm run build` succeeds with no new warnings
