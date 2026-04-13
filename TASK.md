# Task: Europe PMC search in the Paper post type

## Context

Luminary is a research networking app. Read CLAUDE.md for full architecture.

The relevant file is `src/screens/NewPostScreen.jsx` (or wherever the paper
post type is handled — search for "paper" and "doi" to find it).

Currently the Paper post type requires the user to manually type or paste a DOI.
The DOI is then looked up via CrossRef to fetch metadata.

We want to add a Europe PMC search so the user can search by title, keyword,
or author and select a paper from the results — without needing to know the DOI.

---

## What to build

### UX flow

1. User selects the Paper post type
2. They see two options side by side (or tabbed):
   - **"Search Europe PMC"** — new, default
   - **"Enter DOI manually"** — existing fallback
3. In the search tab: a text input + Search button
4. Results appear below as a list of paper cards
5. User clicks a paper → it populates the post exactly as if they had entered the DOI
6. They can then edit the post text and publish normally

### Search tab UI

```
┌─────────────────────────────────────────────┐
│  🔍 [Search by title, keyword, or author  ] │  [Search]
└─────────────────────────────────────────────┘

Results:
┌─────────────────────────────────────────────┐
│ Title of the paper                          │
│ Authors · Journal · Year                    │
│ [Select this paper →]                       │
├─────────────────────────────────────────────┤
│ Another paper title                         │
│ ...                                         │
└─────────────────────────────────────────────┘
```

---

## Europe PMC search API

```
GET https://www.ebi.ac.uk/europepmc/webservices/rest/search
  ?query=SEARCH_TERM
  &resultType=core
  &pageSize=10
  &format=json
```

`resultType=core` gives citation counts and open access status.
No API key required.

### Build the query

Simple: pass the user's search string directly as the `query` parameter.
Europe PMC handles title, keyword, and author searches natively.

```javascript
const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
  + `?query=${encodeURIComponent(searchTerm)}`
  + `&resultType=core&pageSize=10&format=json`;

const resp = await fetch(url);
const data = await resp.json();
const results = data.resultList?.result || [];
```

### Fields to extract per result

```javascript
{
  title:         result.title?.replace(/<[^>]+>/g, '') || '',
  authors:       result.authorString || '',
  journal:       result.journalTitle || '',
  year:          result.pubYear || '',
  doi:           result.doi || '',
  pmid:          result.pmid || '',
  abstract:      result.abstractText?.slice(0, 300) || '',
  citedByCount:  result.citedByCount || 0,
  isOpenAccess:  result.isOpenAccess === 'Y',
}
```

---

## When user selects a paper

Call the existing DOI metadata handler (CrossRef or however the paper post
currently populates fields) with the DOI from the Europe PMC result.

If the paper has no DOI, populate the fields directly from Europe PMC data:
- Paper title → `paperTitle` state
- Journal → `paperJournal` state
- Authors → `paperAuthors` state
- Abstract → `paperAbstract` state (if that field exists)
- Year → wherever year is stored

The post should look identical whether the paper was found via DOI entry
or via Europe PMC search.

---

## Result card design

Each result card should show:
- Title (bold, max 2 lines with ellipsis overflow)
- Authors (muted, truncated to ~80 chars)
- Journal · Year (muted)
- Open Access badge if `isOpenAccess === true` — green badge matching T.gr2/T.gr
- Citation count if > 0 — blue badge matching T.bl2/T.bl
- A "Select →" button (variant="s" Btn, or a styled button using T.v)

On hover the card should have a subtle background change to T.s2.

---

## State to add

```javascript
const [epSearchTerm,   setEpSearchTerm]   = useState('');
const [epResults,      setEpResults]      = useState([]);
const [epSearching,    setEpSearching]    = useState(false);
const [epError,        setEpError]        = useState('');
const [paperInputMode, setPaperInputMode] = useState('search'); // 'search' | 'doi'
```

---

## Tab switcher design

Two small toggle buttons above the search input:

```jsx
<div style={{display:'flex', gap:6, marginBottom:12}}>
  {[['search','🔍 Search Europe PMC'],['doi','✏️ Enter DOI']].map(([mode, label]) => (
    <button key={mode} onClick={() => setPaperInputMode(mode)} style={{
      padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600,
      fontFamily: 'inherit', cursor: 'pointer',
      border: `1.5px solid ${paperInputMode === mode ? T.v : T.bdr}`,
      background: paperInputMode === mode ? T.v2 : T.w,
      color: paperInputMode === mode ? T.v : T.mu,
    }}>
      {label}
    </button>
  ))}
</div>
```

---

## Search on Enter key

```javascript
const handleEpSearch = async () => {
  if (!epSearchTerm.trim() || epSearching) return;
  setEpSearching(true);
  setEpError('');
  setEpResults([]);
  try {
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
      + `?query=${encodeURIComponent(epSearchTerm)}`
      + `&resultType=core&pageSize=10&format=json`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Europe PMC search failed');
    const data = await resp.json();
    setEpResults(data.resultList?.result || []);
    if (!data.resultList?.result?.length) setEpError('No results found. Try different keywords.');
  } catch (e) {
    setEpError('Search failed. Check your connection and try again.');
  }
  setEpSearching(false);
};

// Allow Enter key to trigger search
onKeyDown={e => { if (e.key === 'Enter') handleEpSearch(); }}
```

---

## What NOT to change

- The existing DOI manual entry flow — it becomes the fallback tab, not removed
- The CrossRef lookup — still used when a DOI is available (either typed or from EPMC result)
- Auto-tagging edge function — still fires on publish as before
- Any other post types (text, link, file, tip)
- Feed, profile, groups, notifications screens

---

## Run npm run build when done to verify no broken imports.
