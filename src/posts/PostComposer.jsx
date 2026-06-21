import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { capture, captureLumensEarned } from '../lib/analytics';
import { T, AUTO_TAG_ENABLED, EDGE_HEADERS, COMPOSER_PROMPTS, LUMENS_ENABLED } from '../lib/constants';

const AUTO_TAG_URL = 'https://rtblqylhoswckvwwspcp.supabase.co/functions/v1/auto-tag';
import { getFileCategory } from '../lib/fileUtils';
import { checkRemainingQuota } from '../lib/storageQuota';
import { getCachedTagsByDoi, buildCitationFromEpmc, buildCitationFromCrossRef, extractCorrespondingAuthorFromEpmc } from '../lib/utils';
import { parseAllMentionSlugs } from '../lib/mentionUtils';
import Btn from '../components/Btn';
import RichTextEditor from '../components/RichTextEditor';
import CoverRepositioner from '../components/CoverRepositioner';
import LinkPreview, { extractFirstUrl } from '../components/LinkPreview';
import { useWindowSize } from '../lib/useWindowSize';

// Cap on total granular tags per post — keeps the chip row readable in feed
// cards and stops the AI from diluting user-curated tags.
const TAG_CAP = 8;

// Normalises a tag for case-insensitive dedup and storage. CLAUDE.md
// documents the DB convention as "tags without leading #".
const normaliseTag = (t) => String(t || '').replace(/^#+/, '').trim();

// Merge user + AI tags. User's order preserved; AI tags appended only when
// they don't case-fold onto something the user already typed. Truncated to
// TAG_CAP. Returns a fresh array of bare tags (no #).
function mergeTags(userTags, aiTags) {
  const out  = [];
  const seen = new Set();
  const push = (raw) => {
    const t = normaliseTag(raw);
    if (!t) return;
    const key = t.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(t);
  };
  (userTags || []).forEach(push);
  (aiTags   || []).forEach(push);
  return out.slice(0, TAG_CAP);
}

// Tags / tier1 / tier2 govern the merge:
//   - tier1 / tier2 are auto-filled only when the post doesn't already have
//     them (users almost never set these manually, so missing = always fill).
//   - tags ALWAYS preserve the user's input verbatim. AI suggestions are
//     appended on top, capped at TAG_CAP, with case-insensitive dedup
//     against what the user already typed.
//
// The merge reads current tags / tier1 / tier2 from the DB at run time
// rather than trusting what the caller passed. This makes the function
// self-correcting: if the post was inserted with the user's tags, those
// tags survive even if the caller forgets (or is wrong about) them.
async function smartAutoTag({ postId, postType, content, paperDoi, paperTitle, paperAbstract, paperJournal, userId }) {
  if (postType !== 'paper') {
    const textContent = (content || '').replace(/<[^>]+>/g, '').trim();
    if (textContent.length < 100) { console.log('Auto-tag skipped: content too short'); return; }
  }

  // Source of truth for the merge — the post's current persisted state.
  const { data: existing, error: existingErr } = await supabase
    .from('posts')
    .select('tags, tier1, tier2')
    .eq('id', postId)
    .single();
  if (existingErr) { console.warn('Auto-tag: could not read current post', existingErr); return; }

  const currentTags  = existing?.tags  || [];
  const currentTier1 = (existing?.tier1 || '').trim();
  const currentTier2 = existing?.tier2 || [];

  // Build only the keys we actually want to overwrite. Empty patch = no-op.
  const buildPatch = (suggested) => {
    const patch = {};
    if (!currentTier1 && suggested.tier1)                 patch.tier1 = suggested.tier1;
    if (!currentTier2.length && (suggested.tier2 || []).length) patch.tier2 = suggested.tier2;
    const merged   = mergeTags(currentTags, suggested.tags || []);
    const baseline = (currentTags || []).map(normaliseTag).slice(0, TAG_CAP);
    if (JSON.stringify(merged) !== JSON.stringify(baseline)) {
      patch.tags = merged;
    }
    return patch;
  };

  if (postType === 'paper' && paperDoi) {
    const cached = await getCachedTagsByDoi(paperDoi, supabase);
    if (cached) {
      const patch = buildPatch({ tier1: cached.tier1, tier2: cached.tier2, tags: cached.tags });
      if (Object.keys(patch).length > 0) {
        await supabase.from('posts').update(patch).eq('id', postId);
      }
      console.log('Auto-tag: used cached tags from DOI');
      return;
    }
  }
  try {
    const res = await fetch(AUTO_TAG_URL, {
      method: 'POST',
      headers: EDGE_HEADERS,
      body: JSON.stringify({ content, paperTitle, paperAbstract, paperJournal }),
    });
    if (!res.ok) { console.warn('Auto-tag HTTP error:', res.status); return; }
    const data = await res.json();
    if (!data || data.confidence === 'low') { console.log('Auto-tag skipped: low confidence'); return; }
    if (data.tier1 || data.tags?.length) {
      const patch = buildPatch({ tier1: data.tier1, tier2: data.tier2 || [], tags: data.tags || [] });
      if (Object.keys(patch).length > 0) {
        await supabase.from('posts').update(patch).eq('id', postId);
      }
      console.log(`Auto-tag saved: confidence=${data.confidence}`);
      // Publications row sync — paper context only. We always mirror the
      // AI's view here because the publication record is generally not
      // user-curated post-import; if a user manually edits their pub
      // metadata this can be revisited.
      if (postType === 'paper' && paperDoi && data.tier1 && userId) {
        supabase.from('publications')
          .update({ tier1: data.tier1, tier2: data.tier2 || [], tags: data.tags || [] })
          .eq('user_id', userId).eq('doi', paperDoi.toLowerCase())
          .then(() => {});
      }
    }
  } catch(e) {
    console.warn('Auto-tag failed silently:', e.message);
  }
}

async function fetchDoiMetadata(doi) {
  const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//,'').trim();
  if(!clean) return null;
  try {
    const r = await fetch(`https://api.crossref.org/works/${encodeURIComponent(clean)}`);
    if(!r.ok) return null;
    const j = await r.json();
    const w = j.message;
    const title   = w.title?.[0] || '';
    const journal = w['container-title']?.[0] || w['institution']?.[0]?.name || '';
    const year    = w.published?.['date-parts']?.[0]?.[0]?.toString() || '';
    const authors = (w.author||[]).slice(0,5).map(a=>`${a.given||''} ${a.family||''}`.trim()).join(', ') + ((w.author||[]).length>5?' et al.':'');
    const abstract= w.abstract || '';
    const doiUrl  = `https://doi.org/${clean}`;
    const citation = buildCitationFromCrossRef(w, clean);
    return { title, journal, year, authors, abstract, doi: clean, doiUrl, citation };
  } catch { return null; }
}

function EpResultCard({ title, authors, citation, journal, year, cited, oa, onSelect }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      onMouseEnter={()=>setHovered(true)}
      onMouseLeave={()=>setHovered(false)}
      style={{
        background: hovered ? T.s2 : "rgba(255,255,255,.8)",
        border: `1px solid ${T.bdr}`,
        borderRadius: 10,
        padding: "12px 14px",
        transition: "background .12s",
      }}
    >
      <div style={{fontSize:13,fontWeight:700,color:T.text,lineHeight:1.4,overflow:"hidden",display:"-webkit-box",WebkitLineClamp:2,WebkitBoxOrient:"vertical",marginBottom:4}}>{title}</div>
      <div style={{fontSize:11.5,color:T.mu,marginBottom:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
        {authors.length>80 ? authors.slice(0,80)+'…' : authors}
      </div>
      <div style={{display:"flex",alignItems:"center",gap:6,flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:T.mu}}>{citation || [journal,year].filter(Boolean).join(' · ')}</span>
        {oa && <span style={{fontSize:10,fontWeight:700,color:T.gr,background:T.gr2,border:`1px solid ${T.gr}`,borderRadius:20,padding:"1px 7px"}}>Open Access</span>}
        {cited>0 && <span style={{fontSize:10,fontWeight:700,color:T.bl,background:T.bl2,border:`1px solid ${T.bl}`,borderRadius:20,padding:"1px 7px"}}>{cited} citations</span>}
        <button onClick={onSelect} style={{marginLeft:"auto",padding:"4px 12px",borderRadius:20,border:`1.5px solid ${T.v}`,background:T.v,color:"#fff",fontSize:11.5,fontWeight:700,fontFamily:"inherit",cursor:"pointer",flexShrink:0}}>
          Select →
        </button>
      </div>
    </div>
  );
}

// Default visibility per context
function defaultVisibility(context) {
  if (context.kind === 'feed') return 'public';
  // Group posts default to members-only; users opt in to cross-post via
  // the "Also share to public feed" toggle (open groups only). Pre-cross-
  // post mental model defaulted open groups to public; the new default
  // makes "share to feed" an explicit choice.
  if (context.kind === 'group') return 'members';
  if (context.kind === 'project') return 'members';
  return 'public';
}

// Notify users mentioned via @-mention in a post's content.
// Posts always carry HTML when isDeepDive, otherwise plain text in
// PostComposer's `content` field. Skip self-mentions.
async function notifyPostMentions({ content, isHtml, postId, actorId }) {
  if (!content || !postId) return;
  const slugs = parseAllMentionSlugs(content, isHtml);
  if (!slugs.length) return;
  const { data: profs } = await supabase
    .from('profiles')
    .select('id, profile_slug')
    .in('profile_slug', slugs);
  const recipients = (profs || [])
    .map(p => p.id)
    .filter(id => id && id !== actorId);
  if (!recipients.length) return;
  // Dedup against existing unread mention notifs for this post.
  const { data: existing } = await supabase
    .from('notifications')
    .select('user_id')
    .eq('notif_type', 'mention')
    .eq('target_id', postId)
    .eq('read', false)
    .in('user_id', recipients);
  const skip = new Set((existing || []).map(r => r.user_id));
  const fresh = recipients.filter(id => !skip.has(id));
  if (!fresh.length) return;
  await supabase.from('notifications').insert(
    fresh.map(uid => ({
      user_id:    uid,
      actor_id:   actorId,
      notif_type: 'mention',
      target_id:  postId,
      read:       false,
    }))
  );
}

// Notify group members of a new group post
async function notifyGroupMembers(groupId, groupName, posterId, postId) {
  const { data: members } = await supabase
    .from('group_members')
    .select('user_id')
    .eq('group_id', groupId)
    .in('role', ['admin', 'member'])
    .neq('user_id', posterId);
  if (!members?.length) return;
  await supabase.from('notifications').insert(
    members.map(m => ({
      user_id:    m.user_id,
      notif_type: 'group_post',
      actor_id:   posterId,
      target_id:  postId,
      meta:       { group_id: groupId, group_name: groupName },
    }))
  );
}

export default function PostComposer({
  context = { kind: 'feed' },
  user, profile, setProfile,
  onPublished, onCancel,
  editPost = null,
    // When set, the composer pre-fills from this post and saves with
    // UPDATE instead of INSERT. Currently used for deep-dive edits from
    // the post menu — non-deep-dive edits still happen inline in PostCard.
}) {
  const { isMobile } = useWindowSize();
  const ctx = context.kind || 'feed';
  const isEditMode = !!editPost;
  const [postType,setPostType]           = useState(editPost?.post_type || 'text');
  const [content,setContent]             = useState(editPost?.content || '');

  const [composerPrompt] = useState(() => {
    const prompts = COMPOSER_PROMPTS[profile?.work_mode || 'researcher'];
    return prompts[Math.floor(Math.random() * prompts.length)];
  });

  // Paper fields
  const [paperTitle,setPaperTitle]       = useState(editPost?.paper_title    || '');
  const [paperJournal,setPaperJournal]   = useState(editPost?.paper_journal  || '');
  const [paperDoi,setPaperDoi]           = useState(editPost?.paper_doi      || '');
  const [paperAbstract,setPaperAbstract] = useState(editPost?.paper_abstract || '');
  const [paperAuthors,setPaperAuthors]   = useState(editPost?.paper_authors  || '');
  const [paperYear,setPaperYear]         = useState(editPost?.paper_year     || '');
  const [paperCitation,setPaperCitation] = useState(editPost?.paper_citation || '');
  const [paperCorrespEmail,setPaperCorrespEmail] = useState(editPost?.paper_corresp_email || '');
  const [paperCorrespName, setPaperCorrespName]  = useState(editPost?.paper_corresp_name  || '');
  const [doiFetching,setDoiFetching]     = useState(false);
  const [doiFetched,setDoiFetched]       = useState(false);
  const [paperInputMode,setPaperInputMode] = useState('search');
  const [epSearchTerm,setEpSearchTerm]   = useState('');
  const [epAuthor,     setEpAuthor]      = useState('');
  const [epYearFrom,   setEpYearFrom]    = useState('');
  const [epYearTo,     setEpYearTo]      = useState('');
  const [epJournal,    setEpJournal]     = useState('');
  const [showEpAdv,    setShowEpAdv]     = useState(false);
  const [epResults,setEpResults]         = useState([]);
  const [epNextCursor, setEpNextCursor]  = useState(null);
  const [epHasMore,    setEpHasMore]     = useState(false);
  const [epSearching,setEpSearching]     = useState(false);
  const [epLoadingMore,setEpLoadingMore] = useState(false);
  const [epError,setEpError]             = useState('');
  const [epTotal,      setEpTotal]       = useState(null);

  // Inline images uploaded by the rich-text editor (deep dive only) before
  // we know the post.id. We flush record_storage_file for each after publish.
  const pendingImagesRef = useRef([]);

  // Attachments — single non-image file (PDF/CSV/video/audio/file) OR
  // multiple images. The two paths are mutually exclusive: picking one
  // clears the other. `imageFiles` is the multi-image source of truth;
  // when non-empty the post is published with image_urls populated and
  // image_url mirrored to the first entry for back-compat (OG tags,
  // legacy view code).
  const [attachType,setAttachType]       = useState(null);
  const [uploadFile,setUploadFile]       = useState(null);
  const [uploadPreview,setUploadPreview] = useState('');
  const [uploadCategory,setUploadCategory] = useState('');
  const [uploading,setUploading]         = useState(false);
  const [imageFiles,setImageFiles]       = useState([]);  // File[]
  const [imagePreviews,setImagePreviews] = useState([]);  // string[] (object URLs)
  const photosInputRef = useRef(null);

  const [isDeepDive, setIsDeepDive]       = useState(!!editPost?.is_deep_dive);
  // Mount node for the deep-dive toolbar (rendered via portal from
  // RichTextEditor). Lives ABOVE the scroll container so the toolbar
  // DOM never shares a stacking context with scrolled body text.
  // Callback ref + state combo forces a re-render once the slot DOM
  // node is available, so RichTextEditor can portal into it.
  const [toolbarSlot, setToolbarSlot]     = useState(null);
  const [deepDiveTitle,    setDeepDiveTitle]    = useState(editPost?.deep_dive_title || '');
  const [coverUrl,         setCoverUrl]         = useState(editPost?.deep_dive_cover_url || '');
  const [coverPath,        setCoverPath]        = useState('');
  const [coverFileMeta,    setCoverFileMeta]    = useState(null);
  const [coverUploading,   setCoverUploading]   = useState(false);
  const [coverY,           setCoverY]           = useState(() => {
    const m = (editPost?.deep_dive_cover_position || '').match(/(\d+)\s*%\s*$/);
    return m ? parseInt(m[1], 10) : 50;
  });
  const coverInputRef = useRef(null);
  const [tags,setTags]                   = useState(() => (editPost?.tags || []).join(', '));
  const [visibility,setVisibility]       = useState(() => editPost?.visibility || defaultVisibility(context));
  const [loading,setLoading]             = useState(false);
  const [success,setSuccess]             = useState(false);
  const [error,setError]                 = useState('');

  // Debounced URL detection for live link preview in text posts
  const [previewUrl, setPreviewUrl]      = useState('');
  const urlDebounceRef = useRef(null);
  useEffect(() => {
    if (postType !== 'text') { setPreviewUrl(''); return; }
    clearTimeout(urlDebounceRef.current);
    urlDebounceRef.current = setTimeout(() => {
      setPreviewUrl(extractFirstUrl(content) || '');
    }, 600);
    return () => clearTimeout(urlDebounceRef.current);
  }, [content, postType]);

  // Pre-fill paper fields from Explore / Library "Share this paper"
  useEffect(() => {
    const raw = sessionStorage.getItem('prefill_paper');
    if (!raw) return;
    try {
      const paper = JSON.parse(raw);
      sessionStorage.removeItem('prefill_paper');
      setPostType('paper');
      if (paper.title)    setPaperTitle(paper.title);
      if (paper.journal)  setPaperJournal(paper.journal);
      if (paper.authors)  setPaperAuthors(paper.authors);
      if (paper.abstract) setPaperAbstract(paper.abstract);
      if (paper.year)     setPaperYear(paper.year);
      if (paper.doi)      setPaperDoi(paper.doi);
      if (paper.citation) setPaperCitation(paper.citation);
      if (paper.corresp_email) setPaperCorrespEmail(paper.corresp_email);
      if (paper.corresp_name)  setPaperCorrespName(paper.corresp_name);
      if (paper.title || paper.doi) setDoiFetched(true);
    } catch(e) {}
  }, []); // eslint-disable-line

  const FILE_LIMITS = { image:10, video:200, audio:50, pdf:25, data:5, file:10 };

  const handleDoiLookup = async (doi) => {
    const clean = doi.replace(/^https?:\/\/(dx\.)?doi\.org\//,'').trim();
    if(!clean || doiFetched) return;
    setDoiFetching(true);
    // CrossRef = bibliographic metadata; EuropePMC = corresponding author
    // email (not exposed by CrossRef). Fire both in parallel — either may
    // fail without blocking the other.
    const [meta, epmcResult] = await Promise.all([
      fetchDoiMetadata(clean),
      fetch(
        `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
        + `?query=${encodeURIComponent('DOI:' + clean)}`
        + `&resultType=core&pageSize=1&format=json`
      ).then(r => r.json()).then(j => j.resultList?.result?.[0] || null).catch(() => null),
    ]);
    setDoiFetching(false);
    if(meta) {
      if(!paperTitle)   setPaperTitle(meta.title);
      if(!paperJournal) setPaperJournal(meta.journal || '');
      if(!paperAuthors) setPaperAuthors(meta.authors);
      setPaperAbstract(meta.abstract);
      setPaperYear(meta.year);
      setPaperDoi(meta.doi);
      setPaperCitation(meta.citation || '');
      if (epmcResult) {
        const corresp = extractCorrespondingAuthorFromEpmc(epmcResult);
        if (corresp.email) {
          setPaperCorrespEmail(corresp.email);
          setPaperCorrespName(corresp.name);
        }
      }
      setDoiFetched(true);
    } else {
      setError('Could not find this DOI in CrossRef. Check it and fill in details manually.');
    }
  };

  const resetDoi = () => {
    setPaperDoi(''); setPaperTitle(''); setPaperJournal('');
    setPaperAuthors(''); setPaperAbstract(''); setPaperYear(''); setPaperCitation('');
    setPaperCorrespEmail(''); setPaperCorrespName('');
    setDoiFetched(false); setError('');
  };

  const buildEpQuery = () => {
    const parts = [];
    if (epSearchTerm.trim()) parts.push(epSearchTerm.trim());
    if (epAuthor.trim())     parts.push(`AUTH:"${epAuthor.trim()}"`);
    if (epJournal.trim())    parts.push(`JOURNAL:"${epJournal.trim()}"`);
    if (epYearFrom.trim() || epYearTo.trim()) {
      const from = epYearFrom.trim() || epYearTo.trim();
      const to   = epYearTo.trim()   || epYearFrom.trim();
      parts.push(from === to ? `(PUB_YEAR:${from})` : `(PUB_YEAR:[${from} TO ${to}])`);
    }
    return parts.join(' ');
  };

  const doEpFetch = async (cursor, append) => {
    const q = buildEpQuery();
    if (!q) return;
    const url = `https://www.ebi.ac.uk/europepmc/webservices/rest/search`
      + `?query=${encodeURIComponent(q)}`
      + `&resultType=core&pageSize=10&format=json`
      + `&cursorMark=${encodeURIComponent(cursor || '*')}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('Search failed');
    const data = await resp.json();
    const rows = data.resultList?.result || [];
    const next = data.nextCursorMark;
    if (append) setEpResults(prev => [...prev, ...rows]);
    else { setEpResults(rows); setEpTotal(data.hitCount || 0); }
    setEpNextCursor(next || null);
    setEpHasMore(!!next && next !== cursor && rows.length === 10);
    if (!rows.length && !append) setEpError('No results found. Try different keywords.');
  };

  const handleEpSearch = async () => {
    const q = buildEpQuery();
    if (!q || epSearching) return;
    setEpSearching(true); setEpError(''); setEpResults([]);
    setEpNextCursor(null); setEpHasMore(false); setEpTotal(null);
    try { await doEpFetch('*', false); }
    catch { setEpError('Search failed. Check your connection and try again.'); }
    setEpSearching(false);
  };

  const loadMoreEp = async () => {
    if (!epNextCursor || epLoadingMore) return;
    setEpLoadingMore(true);
    try { await doEpFetch(epNextCursor, true); }
    catch { setEpError('Failed to load more results.'); }
    setEpLoadingMore(false);
  };

  const selectEpResult = async (result) => {
    const title   = result.title?.replace(/<[^>]+>/g, '') || '';
    const authors = result.authorString || '';
    const journal = result.journalTitle || '';
    const year    = result.pubYear || '';
    const doi     = result.doi || '';
    const abstract= result.abstractText?.slice(0, 300) || '';
    const corresp = extractCorrespondingAuthorFromEpmc(result);

    if (doi) {
      setPaperDoi(doi);
      setPaperTitle(title);
      setPaperJournal(journal);
      setPaperAuthors(authors);
      setPaperAbstract(abstract);
      setPaperYear(year);
      setPaperCitation(buildCitationFromEpmc(result));
      setPaperCorrespEmail(corresp.email);
      setPaperCorrespName(corresp.name);
      setDoiFetched(false);
      await handleDoiLookup(doi);
    } else {
      setPaperTitle(title);
      setPaperJournal(journal);
      setPaperAuthors(authors);
      setPaperCitation(buildCitationFromEpmc(result));
      setPaperAbstract(abstract);
      setPaperYear(year);
      setPaperCorrespEmail(corresp.email);
      setPaperCorrespName(corresp.name);
      setDoiFetched(true);
    }
    setEpResults([]);
    setEpSearchTerm('');
  };

  const handleFileSelect = async (e) => {
    const file = e.target.files?.[0];
    if(!file) return;
    const cat = getFileCategory(file.type);
    const limitMB = FILE_LIMITS[cat] || 10;
    if(file.size > limitMB * 1024 * 1024) {
      setError(`File too large. Max size for ${cat} is ${limitMB}MB.`); return;
    }
    const quotaErr = await checkRemainingQuota(file.size);
    if (quotaErr) { setError(quotaErr); return; }
    setUploadFile(file);
    setUploadCategory(cat);
    setError('');
    if(cat === 'image' || cat === 'video' || cat === 'audio') {
      setUploadPreview(URL.createObjectURL(file));
    } else {
      setUploadPreview('');
    }
  };

  const clearFile = () => {
    if(uploadPreview) URL.revokeObjectURL(uploadPreview);
    setUploadFile(null); setUploadPreview(''); setUploadCategory('');
  };

  const clearImages = () => {
    imagePreviews.forEach(u => { try { URL.revokeObjectURL(u); } catch {} });
    setImageFiles([]); setImagePreviews([]);
  };

  const clearAttachment = () => {
    clearFile();
    clearImages();
    setAttachType(null);
  };

  const switchAttachType = (type) => {
    if (attachType === type) { clearAttachment(); return; }
    clearFile();
    clearImages();
    setAttachType(type);
  };

  const MAX_IMAGES = 10;
  const handlePhotosSelect = async (e) => {
    const picked = Array.from(e.target.files || []);
    e.target.value = '';
    if (!picked.length) return;
    setError('');

    // Drop non-images and oversize files; surface a single combined error.
    const imgLimitMB = FILE_LIMITS.image;
    const valid = [];
    const issues = [];
    for (const f of picked) {
      if (!f.type.startsWith('image/')) { issues.push(`${f.name}: not an image`); continue; }
      if (f.size > imgLimitMB * 1024 * 1024) { issues.push(`${f.name}: over ${imgLimitMB}MB`); continue; }
      valid.push(f);
    }

    // Cap total at MAX_IMAGES; ignore extras (user can re-pick later).
    const room = Math.max(0, MAX_IMAGES - imageFiles.length);
    const accept = valid.slice(0, room);
    if (valid.length > room) issues.push(`Only the first ${MAX_IMAGES} photos are kept`);

    if (!accept.length) {
      if (issues.length) setError(issues.join(' · '));
      return;
    }

    // Quota: total of new images + existing single uploadFile (none, since
    // the buttons are mutually exclusive, but the helper sums correctly).
    const totalSize = accept.reduce((s, f) => s + f.size, 0);
    const quotaErr = await checkRemainingQuota(totalSize);
    if (quotaErr) { setError(quotaErr); return; }

    // Switch into image mode if not already (clears single-file path).
    if (attachType !== 'photos') { clearFile(); setAttachType('photos'); }

    setImageFiles(prev => [...prev, ...accept]);
    setImagePreviews(prev => [...prev, ...accept.map(f => URL.createObjectURL(f))]);
    if (issues.length) setError(issues.join(' · '));
  };

  const removeImageAt = (idx) => {
    setImagePreviews(prev => {
      const u = prev[idx]; if (u) { try { URL.revokeObjectURL(u); } catch {} }
      const next = prev.filter((_, i) => i !== idx);
      if (next.length === 0) setAttachType(null);
      return next;
    });
    setImageFiles(prev => prev.filter((_, i) => i !== idx));
  };

  // 3-way mode picker: 'text' / 'paper' / 'deepdive'. Maps to the
  // underlying (postType, isDeepDive) flags so the publish RPC + DB
  // schema don't change. UI state replaces the previous 2-tile +
  // toggle combo with a single first-class choice.
  const mode = postType === 'paper' ? 'paper' : (isDeepDive ? 'deepdive' : 'text');
  const switchMode = (next) => {
    setError('');
    if (next === 'text')     { setPostType('text');  setIsDeepDive(false); }
    if (next === 'paper')    { setPostType('paper'); setIsDeepDive(false); clearAttachment(); }
    if (next === 'deepdive') { setPostType('text');  setIsDeepDive(true);  }
  };

  const uploadFileToStorage = async (file) => {
    const ext  = file.name.split('.').pop().toLowerCase();
    const path = `${user.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    const { data, error } = await supabase.storage
      .from('post-files')
      .upload(path, file, { contentType: file.type, upsert: false });
    if(error) throw error;
    const { data:{ publicUrl } } = supabase.storage.from('post-files').getPublicUrl(data.path);
    return { url: publicUrl, path: data.path };
  };

  // Visibility model (post-cross-post refactor):
  //   Feed       → always public (no selector — feed posts are public by
  //                definition; "Only me" was a confusing edge case).
  //   Open group → members-only by default + optional cross-post toggle
  //                ("Also share to public feed"). Toggle flips visibility
  //                between 'members' and 'public'; FeedScreen unions in
  //                public group posts so 'public' actually surfaces in
  //                the public feed.
  //   Closed grp → members-only, locked.
  //   Project    → members-only, locked.
  // No top-bar pill tabs anymore — open groups use a body-level toggle.
  const isOpenGroup = ctx === 'group' && !!context.groupIsPublic;
  const lockedHint =
    ctx === 'project'                   ? '👥 Project members only' :
    ctx === 'group' && !isOpenGroup     ? '👥 Group members only'   :
    '';

  const publish = async () => {
    const plainContent = content.replace(/<[^>]+>/g,'').trim();
    if(postType === 'paper' && !paperTitle.trim()) { setError('Please add a paper title.'); return; }
    if(postType !== 'paper' && !plainContent && !uploadFile && imageFiles.length === 0) {
      setError('Please write something or add an attachment.'); return;
    }
    setLoading(true); setError('');

    let fileUrl = '', uploadedPath = '';
    let imageUrls = [];          // populated when imageFiles non-empty
    let imageUploadRecords = []; // [{path,size,type,name}, ...] for storage tracking
    if(uploadFile) {
      setUploading(true);
      try {
        const r = await uploadFileToStorage(uploadFile);
        fileUrl = r.url; uploadedPath = r.path;
      }
      catch(err) { setError(`Upload failed: ${err.message}`); setLoading(false); setUploading(false); return; }
      setUploading(false);
    } else if (imageFiles.length > 0) {
      setUploading(true);
      try {
        const results = await Promise.all(imageFiles.map(f => uploadFileToStorage(f)));
        imageUrls          = results.map(r => r.url);
        imageUploadRecords = results.map((r, i) => ({
          path: r.path, size: imageFiles[i].size,
          type: imageFiles[i].type || 'image/jpeg', name: imageFiles[i].name,
        }));
        // Mirror to legacy single-image fields so OG tags + legacy
        // renderers (e.g. ShareModal previews, link unfurls) still work.
        fileUrl      = imageUrls[0];
        uploadedPath = '';
      }
      catch(err) { setError(`Upload failed: ${err.message}`); setLoading(false); setUploading(false); return; }
      setUploading(false);
    }

    let resolvedPostType = postType;
    if (uploadFile)             resolvedPostType = uploadCategory || 'text';
    else if (imageFiles.length) resolvedPostType = 'image';

    // Strip leading '#' on save — DB convention is bare tags, see CLAUDE.md.
    // PostCard / GranularTags renders bare strings; storing the '#' would
    // double up to "##oncology" the second time the user hits Save.
    const manualTags = tags.split(/[\s,]+/).map(t => t.replace(/^#+/, '').trim()).filter(Boolean);

    const payload = {
      content:       content.trim(),
      post_type:     resolvedPostType,
      paper_title:   paperTitle.trim(),
      paper_journal: paperJournal.trim(),
      paper_doi:     paperDoi.trim(),
      paper_abstract:paperAbstract.trim(),
      paper_authors: paperAuthors.trim(),
      paper_year:     paperYear.trim(),
      paper_citation: paperCitation.trim(),
      paper_corresp_email: paperCorrespEmail.trim() || null,
      paper_corresp_name:  paperCorrespName.trim()  || null,
      tags:           manualTags.slice(0, 10),
      visibility,
      is_deep_dive:   isDeepDive,
      deep_dive_title:          isDeepDive ? deepDiveTitle.trim() : '',
      deep_dive_cover_url:      isDeepDive ? coverUrl : '',
      deep_dive_cover_position: (isDeepDive && coverUrl) ? `50% ${Math.round(coverY)}%` : '50% 50%',
    };

    // Edit mode: don't touch user_id / context_* / file_*. Only touch
    // image_url/file_name/file_type when the user uploaded a new file.
    if (!isEditMode) {
      payload.user_id      = user.id;
      payload.image_url    = fileUrl;
      payload.image_urls   = imageUrls;
      payload.file_type    = uploadFile ? uploadCategory : (imageFiles.length ? 'image' : '');
      payload.file_name    = uploadFile?.name || (imageFiles[0]?.name || '');
      payload.tier1        = '';
      payload.tier2        = [];
      payload.context_kind = ctx;
      payload.context_id   = ctx === 'feed' ? null
                            : ctx === 'group'   ? context.groupId
                            : ctx === 'project' ? context.projectId
                            : null;
      // Project posts get scoped to a folder when one is active. "All
      // posts" view (folderId null) leaves the post folder-less.
      if (ctx === 'project' && context.folderId) payload.folder_id = context.folderId;
    } else if (uploadFile) {
      // Edit + new single attachment uploaded → replace existing
      payload.image_url  = fileUrl;
      payload.image_urls = [];
      payload.file_type  = uploadCategory;
      payload.file_name  = uploadFile?.name || '';
    } else if (imageFiles.length > 0) {
      // Edit + new multi-image set → replace existing
      payload.image_url  = imageUrls[0];
      payload.image_urls = imageUrls;
      payload.file_type  = 'image';
      payload.file_name  = imageFiles[0]?.name || '';
    }

    let newPost, mutErr;
    if (isEditMode) {
      const r = await supabase.from('posts').update(payload).eq('id', editPost.id).select('id').single();
      newPost = r.data;
      mutErr  = r.error;
    } else {
      const r = await supabase.from('posts').insert(payload).select('id').single();
      newPost = r.data;
      mutErr  = r.error;
    }
    setLoading(false);
    if(mutErr) { setError(mutErr.message); return; }

    // Storage tracking — every post upload uses source_kind='post'
    if (uploadFile && uploadedPath && newPost?.id) {
      supabase.rpc('record_storage_file', {
        p_bucket:      'post-files',
        p_path:        uploadedPath,
        p_size_bytes:  uploadFile.size,
        p_mime_type:   uploadFile.type || '',
        p_file_name:   uploadFile.name,
        p_source_kind: 'post',
        p_source_id:   newPost.id,
      }).then(() => {}, () => {});
    }

    if (imageUploadRecords.length > 0 && newPost?.id) {
      for (const rec of imageUploadRecords) {
        supabase.rpc('record_storage_file', {
          p_bucket:      'post-files',
          p_path:        rec.path,
          p_size_bytes:  rec.size,
          p_mime_type:   rec.type,
          p_file_name:   rec.name,
          p_source_kind: 'post',
          p_source_id:   newPost.id,
        }).then(() => {}, () => {});
      }
    }

    if (newPost?.id && coverPath && coverFileMeta) {
      supabase.rpc('record_storage_file', {
        p_bucket:      'post-files',
        p_path:        coverPath,
        p_size_bytes:  coverFileMeta.size,
        p_mime_type:   coverFileMeta.type,
        p_file_name:   coverFileMeta.name,
        p_source_kind: 'post',
        p_source_id:   newPost.id,
      }).then(() => {}, () => {});
    }

    // Fire mention notifications — best-effort, never blocks publish.
    if (newPost?.id) {
      notifyPostMentions({
        content,
        // Deep dives are the only path producing HTML content; regular
        // posts (including paper commentary) come in as plain text.
        isHtml: !!isDeepDive,
        postId: newPost.id,
        actorId: user.id,
      }).catch(() => {});
    }

    if (newPost?.id && pendingImagesRef.current.length > 0) {
      for (const rec of pendingImagesRef.current) {
        supabase.rpc('record_storage_file', {
          p_bucket:      rec.bucket,
          p_path:        rec.path,
          p_size_bytes:  rec.size,
          p_mime_type:   rec.mime,
          p_file_name:   rec.name,
          p_source_kind: 'post',
          p_source_id:   newPost.id,
        }).then(() => {}, () => {});
      }
      pendingImagesRef.current = [];
    }

    // Lumens — +5 for post creation. Skip in edit mode (re-saving doesn't earn).
    if (!isEditMode && LUMENS_ENABLED && newPost?.id) {
      try {
        const prevLumens = profile?.lumens_current_period || 0;
        supabase.rpc('award_lumens', {
          p_user_id:  user.id,
          p_amount:   5,
          p_reason:   'post_created',
          p_category: 'creation',
          p_meta:     { post_id: newPost.id, post_type: resolvedPostType },
        }).then(() => {}, () => {});
        captureLumensEarned({ reason: 'post_created', amount: 5, meta: { post_id: newPost.id, post_type: resolvedPostType }, prevLumens });
        setProfile?.(p => p ? {
          ...p,
          lumens_current_period: (p.lumens_current_period || 0) + 5,
          lumens_lifetime:       (p.lumens_lifetime       || 0) + 5,
        } : p);

        // Recognition: if this is the user's first post, find the inviter and
        // award them +100 Lumens. Best-effort.
        (async () => {
          try {
            const { count } = await supabase
              .from('posts')
              .select('*', { count: 'exact', head: true })
              .eq('user_id', user.id);
            if (count !== 1) return;
            const { data: code } = await supabase
              .from('invite_codes')
              .select('created_by')
              .eq('claimed_by', user.id)
              .maybeSingle();
            const inviterId = code?.created_by;
            if (inviterId && inviterId !== user.id) {
              supabase.rpc('award_lumens', {
                p_user_id:  inviterId,
                p_amount:   100,
                p_reason:   'invited_user_active',
                p_category: 'recognition',
                p_meta:     { invited_user_id: user.id },
              }).then(() => {}, () => {});
              captureLumensEarned({ reason: 'invited_user_active', amount: 100, meta: { invited_user_id: user.id, inviter_id: inviterId } });
            }
          } catch {}
        })();
      } catch {}
    }

    // Auto-tag only on creation. Augment, don't replace: smartAutoTag
    // reads current tags / tier1 / tier2 directly from the DB and merges
    // AI suggestions on top, so the user's input survives any re-run.
    if (!isEditMode && AUTO_TAG_ENABLED && newPost?.id) {
      smartAutoTag({
        postId:        newPost.id,
        postType:      resolvedPostType,
        content,
        paperDoi:      paperDoi.trim(),
        paperTitle:    paperTitle.trim(),
        paperAbstract: paperAbstract.trim(),
        paperJournal:  paperJournal.trim(),
        userId:        user.id,
      }).catch(console.warn);
    }

    // Group post: notify members — only on initial create, not edits.
    if (!isEditMode && ctx === 'group' && newPost?.id && context.groupId) {
      notifyGroupMembers(context.groupId, context.groupName, user.id, newPost.id).catch(() => {});
    }

    capture(isEditMode ? 'post_edited' : 'post_created', {
      post_type: resolvedPostType,
      has_tags:  tags.trim().length > 0,
      context_kind: ctx,
    });
    if (!isEditMode && resolvedPostType === 'paper') capture('paper_shared', { has_doi: !!paperDoi.trim(), context_kind: ctx });

    setSuccess(true);
    if (!isEditMode) { setContent(''); resetDoi(); clearAttachment(); setTags(''); }
    setTimeout(() => { setSuccess(false); onPublished?.(newPost); }, 1500);
  };

  const modes = [
    {id:"text",     icon:"✏️", label:"Text",      sub:"A short note or update"},
    {id:"paper",    icon:"📄", label:"Paper",     sub:"Share research with commentary"},
    {id:"deepdive", icon:"🔬", label:"Deep Dive", sub:"Long-form article with rich formatting"},
  ];

  const catInfo = {
    image: { icon:"📸", label:"Photo",          color:T.te },
    video: { icon:"🎥", label:"Video",          color:T.v  },
    audio: { icon:"🎙️", label:"Audio",          color:T.ro },
    pdf:   { icon:"📄", label:"PDF document",   color:T.bl },
    data:  { icon:"📊", label:"Dataset (CSV)",  color:T.gr },
    file:  { icon:"📎", label:"File attachment",color:T.mu },
  };

  const attachBtnStyle = (active) => ({
    display:"flex", alignItems:"center", gap:6,
    padding:"5px 12px", borderRadius:20, fontSize:12, fontWeight:600,
    fontFamily:"inherit", cursor:"pointer",
    border:`1.5px solid ${active ? T.v : T.bdr}`,
    background: active ? T.v2 : T.w,
    color: active ? T.v : T.mu,
  });

  const breadcrumbLabel = isEditMode ? 'Edit post' : 'New post';
  const breadcrumbContext =
    ctx === 'group'   ? `in ${context.groupName || 'group'}` :
    ctx === 'project' ? `in ${context.projectName || 'project'}` :
    '';

  return (
    <div style={{flex:1,display:"flex",flexDirection:"column",minHeight:0,background:T.bg}}>
      {/* Top bar — always visible, doesn't scroll. Holds cancel,
          breadcrumb, visibility (desktop only), and publish. Replaces
          the old in-card header + footer publish row. */}
      <div style={{
        flexShrink:0, background:T.w, borderBottom:`1px solid ${T.bdr}`,
        padding: isMobile ? "10px 14px" : "12px 24px",
        display:"flex", alignItems:"center", gap:12, minHeight:56,
      }}>
        {onCancel && (
          <button onClick={onCancel} title="Cancel" style={{
            fontSize:18, color:T.mu, border:'none', background:'transparent',
            cursor:'pointer', fontFamily:'inherit', padding:'4px 8px',
            lineHeight:1,
          }}>✕</button>
        )}
        <div style={{flex:1, minWidth:0, display:'flex', alignItems:'baseline', gap:8, overflow:'hidden'}}>
          <span style={{
            fontFamily:"'DM Serif Display',serif", fontSize: isMobile?16:18,
            fontWeight:700, color:T.text, whiteSpace:'nowrap',
          }}>{breadcrumbLabel}</span>
          {breadcrumbContext && (
            <span style={{
              fontSize: isMobile?12:13, color:T.mu,
              overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap',
            }}>{breadcrumbContext}</span>
          )}
        </div>
        <Btn variant="s" onClick={publish} disabled={loading||uploading} style={{padding:"8px 20px", fontSize:13, whiteSpace:'nowrap'}}>
          {uploading?"Uploading...":loading?(isEditMode?"Saving...":"Publishing..."):(isEditMode?"Save":"Publish →")}
        </Btn>
      </div>

      {/* Toolbar mount point — rendered above (outside) the scrolling
          region for all three modes (text/paper/deepdive) so the
          toolbar sits in the same place regardless of post type, and
          its DOM is never a sibling of scrolled body text. */}
      <div ref={setToolbarSlot} style={{flexShrink:0,position:"relative",zIndex:10}}/>

      {/* Body — single scroll container. Content centered at reading
          width (~680px) regardless of viewport, sidebar stays as the
          outer layout layer above this composer. */}
      <div style={{flex:1,overflowY:"auto",background:T.bg,minHeight:0}}>
      <div style={{maxWidth:680,width:"100%",margin:"0 auto",padding:isMobile?"16px 16px 80px":"24px 32px 64px",display:"flex",flexDirection:"column"}}>
        {/* Project owned by group — heads-up banner */}
        {ctx === 'project' && context.projectGroupId && context.projectGroupName && (
          <div style={{
            background: T.v2, border: `1px solid rgba(108,99,255,.2)`,
            borderRadius: 10, padding: '9px 13px', marginBottom: 16,
            fontSize: 12.5, color: T.v, lineHeight: 1.5,
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span>👥</span>
            <span>
              This project is owned by <strong>{context.projectGroupName}</strong> — posts here
              are visible to all <strong>{context.projectGroupName}</strong> members.
            </span>
          </div>
        )}

        {success && <div style={{background:T.gr2,border:`1px solid ${T.gr}`,borderRadius:10,padding:"10px 16px",marginBottom:16,color:T.gr,fontWeight:700}}>{isEditMode ? '✅ Saved!' : '✅ Published!'}</div>}
        {error   && <div style={{background:T.ro2,border:`1px solid ${T.ro}`,borderRadius:10,padding:"10px 16px",marginBottom:16,color:T.ro,fontWeight:600}}>⚠️ {error}</div>}

        {/* Mode picker — 3 tiles. Maps to (postType, isDeepDive) flags
            via switchMode. Replaces the old 2-tile + Deep Dive toggle
            combo with a single first-class choice. */}
        <div style={{display:"grid",gridTemplateColumns:isMobile?"repeat(3,1fr)":"repeat(3,1fr)",gap:8,marginBottom:20}}>
          {modes.map(m=>{
            const active = mode === m.id;
            return (
              <div key={m.id} onClick={()=>switchMode(m.id)}
                style={{border:`${active?2:1.5}px solid ${active?T.v:T.bdr}`,borderRadius:11,padding:isMobile?"10px 6px":"12px 10px",textAlign:"center",cursor:"pointer",background:active?T.v2:T.w}}>
                <div style={{fontSize:22,marginBottom:4}}>{m.icon}</div>
                <div style={{fontSize:11.5,fontWeight:700,color:active?T.v:T.text,marginBottom:isMobile?0:2}}>{m.label}</div>
                {!isMobile && (
                  <div style={{fontSize:10.5,color:T.mu,lineHeight:1.3}}>{m.sub}</div>
                )}
              </div>
            );
          })}
        </div>

        {/* Paper search / DOI panel */}
        {postType==='paper' && (
          <div style={{background:T.v2,borderRadius:12,padding:"16px 18px",marginBottom:16,border:`1px solid rgba(108,99,255,.15)`}}>
            <div style={{fontSize:12,fontWeight:700,color:T.v,marginBottom:12}}>📄 Paper details</div>

            <div style={{display:"flex",gap:6,marginBottom:14}}>
              {[['search','🔍 Search Europe PMC'],['doi','✏️ Enter DOI']].map(([mode,label])=>(
                <button key={mode} onClick={()=>setPaperInputMode(mode)} style={{
                  padding:"6px 14px",borderRadius:20,fontSize:12,fontWeight:600,
                  fontFamily:"inherit",cursor:"pointer",
                  border:`1.5px solid ${paperInputMode===mode?T.v:T.bdr}`,
                  background:paperInputMode===mode?T.v2:T.w,
                  color:paperInputMode===mode?T.v:T.mu,
                }}>{label}</button>
              ))}
            </div>

            {paperInputMode==='search' && !doiFetched && (
              <div style={{marginBottom:14}}>
                <div style={{display:"flex",gap:8,marginBottom:6}}>
                  <input
                    value={epSearchTerm}
                    onChange={e=>setEpSearchTerm(e.target.value)}
                    onKeyDown={e=>{ if(e.key==='Enter') handleEpSearch(); }}
                    placeholder="Title, keywords, topic…"
                    style={{flex:1,background:"rgba(255,255,255,.8)",border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}
                  />
                  <Btn variant="s" onClick={handleEpSearch} disabled={epSearching||!buildEpQuery()} style={{whiteSpace:"nowrap"}}>
                    {epSearching?'Searching...':'Search →'}
                  </Btn>
                </div>
                <button onClick={()=>setShowEpAdv(s=>!s)} style={{fontSize:11.5,color:T.v,fontWeight:600,border:'none',background:'transparent',cursor:'pointer',fontFamily:'inherit',padding:0,marginBottom:showEpAdv?8:4}}>
                  {showEpAdv?'▲ Hide filters':'▼ Author, year, journal…'}
                </button>
                {showEpAdv && (
                  <div style={{display:'flex',flexDirection:'column',gap:6,marginBottom:10,padding:'10px 12px',background:'rgba(255,255,255,.6)',borderRadius:9,border:`1px solid ${T.bdr}`}}>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <label style={{fontSize:11.5,color:T.mu,width:48,flexShrink:0}}>Author</label>
                      <input value={epAuthor} onChange={e=>setEpAuthor(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleEpSearch()} placeholder="e.g. Smith J"
                        style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',color:T.text,minWidth:0}}/>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <label style={{fontSize:11.5,color:T.mu,width:48,flexShrink:0}}>Year</label>
                      <input value={epYearFrom} onChange={e=>setEpYearFrom(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleEpSearch()} placeholder="From"
                        style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',color:T.text,minWidth:0}}/>
                      <span style={{fontSize:12,color:T.mu,flexShrink:0}}>–</span>
                      <input value={epYearTo} onChange={e=>setEpYearTo(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleEpSearch()} placeholder="To"
                        style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',color:T.text,minWidth:0}}/>
                    </div>
                    <div style={{display:'flex',gap:8,alignItems:'center'}}>
                      <label style={{fontSize:11.5,color:T.mu,width:48,flexShrink:0}}>Journal</label>
                      <input value={epJournal} onChange={e=>setEpJournal(e.target.value)} onKeyDown={e=>e.key==='Enter'&&handleEpSearch()} placeholder="e.g. Nature"
                        style={{flex:1,background:'rgba(255,255,255,.85)',border:`1.5px solid ${T.bdr}`,borderRadius:8,padding:'7px 11px',fontSize:12.5,fontFamily:'inherit',outline:'none',color:T.text,minWidth:0}}/>
                    </div>
                  </div>
                )}
                {epError && <div style={{fontSize:12,color:T.ro,marginBottom:8}}>{epError}</div>}
                {epTotal !== null && epResults.length > 0 && (
                  <div style={{fontSize:11.5,color:T.mu,marginBottom:8}}>{epTotal.toLocaleString()} results · showing {epResults.length}</div>
                )}
                {epResults.length>0 && (
                  <div style={{display:"flex",flexDirection:"column",gap:8,maxHeight:340,overflowY:"auto"}}>
                    {epResults.map((r,i)=>{
                      const title   = r.title?.replace(/<[^>]+>/g,'')||'';
                      const authors = r.authorString||'';
                      const journal = r.journalTitle||'';
                      const year    = r.pubYear||'';
                      const cited   = r.citedByCount||0;
                      const oa      = r.isOpenAccess==='Y';
                      return (
                        <EpResultCard key={r.pmid||r.doi||i}
                          title={title} authors={authors} journal={journal} year={year}
                          citation={buildCitationFromEpmc(r)}
                          cited={cited} oa={oa}
                          onSelect={()=>selectEpResult(r)}
                        />
                      );
                    })}
                  </div>
                )}
                {epHasMore && (
                  <div style={{textAlign:'center',paddingTop:6}}>
                    <Btn onClick={loadMoreEp} disabled={epLoadingMore}>
                      {epLoadingMore?'Loading...':'Show next 10'}
                    </Btn>
                  </div>
                )}
              </div>
            )}

            {(paperInputMode==='doi' || doiFetched) && (
              <div style={{marginBottom:14}}>
                {doiFetched ? (
                  <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(255,255,255,.6)",borderRadius:9,padding:"9px 14px",border:`1px solid ${T.gr}`}}>
                    <span style={{fontSize:12,color:T.gr,fontWeight:700}}>✓ Paper selected</span>
                    <span style={{fontSize:12,color:T.mu,flex:1,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{paperTitle}</span>
                    <button onClick={()=>{ resetDoi(); setEpResults([]); }} style={{fontSize:11,color:T.mu,border:"none",background:"transparent",cursor:"pointer",fontFamily:"inherit",flexShrink:0}}>✕ Clear</button>
                  </div>
                ) : (
                  <>
                    <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>
                      DOI <span style={{fontWeight:400,color:T.mu}}>— paste to auto-fill everything below</span>
                    </label>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <input value={paperDoi}
                        onChange={e=>{setPaperDoi(e.target.value);setDoiFetched(false);}}
                        onBlur={e=>handleDoiLookup(e.target.value)}
                        onKeyDown={e=>e.key==='Enter'&&handleDoiLookup(paperDoi)}
                        placeholder="10.1038/s41586-024-00001-0 or https://doi.org/..."
                        style={{flex:1,background:"rgba(255,255,255,.8)",border:`1.5px solid ${doiFetched?T.gr:T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
                      {doiFetching
                        ? <span style={{fontSize:12,color:T.mu,whiteSpace:"nowrap"}}>Fetching...</span>
                        : <Btn variant="v" onClick={()=>handleDoiLookup(paperDoi)} style={{whiteSpace:"nowrap",fontSize:11.5}}>Look up →</Btn>}
                    </div>
                    <div style={{fontSize:11,color:T.mu,marginTop:4}}>Fetches title, authors, abstract, and journal automatically via CrossRef.</div>
                  </>
                )}
              </div>
            )}

            {doiFetched && (
              <>
                <div style={{marginBottom:12}}>
                  <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>Paper title *</label>
                  <input value={paperTitle} onChange={e=>setPaperTitle(e.target.value)} placeholder="Will auto-fill"
                    style={{width:"100%",background:"rgba(255,255,255,.8)",border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:12}}>
                  <div>
                    <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>Journal</label>
                    <input value={paperJournal} onChange={e=>setPaperJournal(e.target.value)} placeholder="Auto-filled"
                      style={{width:"100%",background:"rgba(255,255,255,.8)",border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
                  </div>
                  <div>
                    <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>Authors</label>
                    <input value={paperAuthors} onChange={e=>setPaperAuthors(e.target.value)} placeholder="Auto-filled"
                      style={{width:"100%",background:"rgba(255,255,255,.8)",border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
                  </div>
                </div>
                {paperAbstract&&(
                  <div style={{background:"rgba(255,255,255,.6)",borderRadius:9,padding:"12px 14px",border:`1px solid rgba(108,99,255,.15)`}}>
                    <div style={{fontSize:11,fontWeight:700,color:T.v,textTransform:"uppercase",letterSpacing:".05em",marginBottom:6}}>Abstract</div>
                    <div style={{fontSize:12.5,color:T.text,lineHeight:1.8}}>{paperAbstract.replace(/<[^>]+>/g,'').trim()}</div>
                  </div>
                )}
              </>
            )}

            {paperInputMode==='doi' && !doiFetched && paperTitle && (
              <div style={{marginBottom:12}}>
                <label style={{display:"block",fontSize:12,fontWeight:600,color:T.text,marginBottom:5}}>Paper title *</label>
                <input value={paperTitle} onChange={e=>setPaperTitle(e.target.value)}
                  style={{width:"100%",background:"rgba(255,255,255,.8)",border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"9px 14px",fontSize:13,fontFamily:"inherit",outline:"none",color:T.text}}/>
              </div>
            )}
          </div>
        )}

        {/* Open-group cross-post toggle: when on, this group post also
            surfaces in the global public feed (FeedScreen unions it in
            via context_kind='group' + visibility='public' + open-group).
            Default off — group posts stay group-only unless author opts in. */}
        {isOpenGroup && (
          <div
            onClick={() => setVisibility(v => v === 'public' ? 'members' : 'public')}
            style={{
              display:'flex', alignItems:'center', gap:10,
              padding:'10px 12px', marginBottom:14,
              borderRadius:10,
              background: visibility === 'public' ? T.v2 : T.s2,
              border:`1.5px solid ${visibility === 'public' ? T.v : T.bdr}`,
              cursor:'pointer',
            }}
          >
            <div style={{
              width:38, height:20, borderRadius:10,
              background: visibility === 'public' ? T.v : T.bdr,
              position:'relative', flexShrink:0, transition:'background .2s',
            }}>
              <div style={{
                position:'absolute', top:2,
                left: visibility === 'public' ? 19 : 2,
                width:16, height:16, borderRadius:'50%',
                background:'white', boxShadow:'0 1px 3px rgba(0,0,0,.2)',
                transition:'left .2s',
              }}/>
            </div>
            <div style={{flex:1}}>
              <div style={{fontSize:12.5, fontWeight:700, color: visibility === 'public' ? T.v : T.text}}>
                🌍 Also share to public feed
              </div>
              <div style={{fontSize:11, color:T.mu}}>
                {visibility === 'public'
                  ? 'This post appears in the group AND in the public feed for everyone.'
                  : 'Only group members will see this post. Toggle on to also share to the public feed.'}
              </div>
            </div>
          </div>
        )}

        {/* Deep-dive: title + cover image (above the editor) */}
        {isDeepDive && postType === 'text' && (
          <div style={{marginBottom: 10, display:'flex', flexDirection:'column', gap: 8}}>
            <input
              value={deepDiveTitle}
              onChange={e => setDeepDiveTitle(e.target.value)}
              placeholder="Article title…"
              maxLength={140}
              style={{
                width:'100%', padding:'10px 14px', borderRadius:10,
                border:`1.5px solid ${T.bdr}`, outline:'none',
                fontFamily:"'DM Serif Display', Georgia, serif",
                fontSize:22, color:T.text, background:T.w,
              }}
            />

            {coverUrl ? (
              <CoverRepositioner
                url={coverUrl}
                y={coverY}
                onChange={setCoverY}
                onRemove={() => { setCoverUrl(''); setCoverPath(''); setCoverFileMeta(null); setCoverY(50); }}
              />
            ) : (
              <button
                onClick={() => coverInputRef.current?.click()}
                disabled={coverUploading}
                style={{
                  display:'flex', alignItems:'center', justifyContent:'center', gap:8,
                  width:'100%', padding:'14px 16px',
                  background:T.s2, border:`1.5px dashed ${T.bdr}`, borderRadius:10,
                  cursor: coverUploading ? 'wait' : 'pointer',
                  fontFamily:'inherit', color:T.mu, fontSize:13,
                }}
              >
                {coverUploading ? '⏳ Uploading cover…' : '🖼️ Add cover image (optional)'}
              </button>
            )}
            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              style={{display:'none'}}
              onChange={async e => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                if (!f.type.startsWith('image/')) { setError('Please choose an image file.'); return; }
                if (f.size > 10 * 1024 * 1024)   { setError('Cover image is too large (max 10 MB).'); return; }
                const quotaErr = await checkRemainingQuota(f.size);
                if (quotaErr) { setError(quotaErr); return; }
                setCoverUploading(true);
                setError('');
                try {
                  const r = await uploadFileToStorage(f);
                  setCoverUrl(r.url);
                  setCoverPath(r.path);
                  setCoverFileMeta({ size: f.size, type: f.type || 'image/jpeg', name: f.name });
                } catch (err) {
                  setError(`Cover upload failed: ${err.message || 'unknown error'}`);
                }
                setCoverUploading(false);
              }}
            />
          </div>
        )}

        {/* Text editor */}
        <div style={{marginBottom:0}}>
          <RichTextEditor
            value={content}
            onChange={setContent}
            isDeepDive={isDeepDive}
            user={user}
            onPendingImage={(rec) => { pendingImagesRef.current.push(rec); }}
            toolbarPortalTarget={toolbarSlot}
            minHeight={isMobile ? (uploadFile ? 120 : 200) : (uploadFile ? 70 : 110)}
            placeholder={
              postType==='paper' ? "Why does this paper matter? What's the key finding?" :
              isDeepDive ? "Write your article here. Use Heading 2 / 3 for sections, ❝ for pull quotes, 📄 Cite to add paper references…" :
              ctx === 'group' ? "Share an update, finding, or question with the group…" :
              ctx === 'project' ? "Post something in this project…" :
              composerPrompt
            }/>
        </div>

        {/* Live link preview for text posts */}
        {postType === 'text' && previewUrl && (
          <div style={{ marginTop: 4 }}>
            <LinkPreview url={previewUrl} compact/>
          </div>
        )}

        {/* Attachment area (text only) */}
        {postType !== 'paper' && (
          <div style={{marginTop:10, marginBottom:14}}>

            {!uploadFile && imageFiles.length === 0 && (
              <div style={{display:"flex",gap:8}}>
                <button style={attachBtnStyle(attachType==='photos')} onClick={()=>{
                  switchAttachType('photos');
                  // Open the picker immediately on first click for the
                  // happy path; second click toggles off (handled by switchAttachType).
                  setTimeout(() => photosInputRef.current?.click(), 0);
                }}>
                  <span>📸</span> Photos
                </button>
                <button style={attachBtnStyle(attachType==='file')} onClick={()=>switchAttachType('file')}>
                  <span>📎</span> File
                </button>
              </div>
            )}

            <input
              ref={photosInputRef}
              type="file"
              accept="image/*"
              multiple
              style={{display:"none"}}
              onChange={handlePhotosSelect}
            />

            {imageFiles.length > 0 && (
              <div style={{
                border:`1px solid ${T.bdr}`, borderRadius:12,
                padding:10, marginTop:10, background:T.w,
              }}>
                <div style={{
                  display:'grid',
                  gridTemplateColumns:`repeat(${isMobile ? 3 : 4}, 1fr)`,
                  gap:6, marginBottom:10,
                }}>
                  {imagePreviews.map((u, i) => (
                    <div key={u} style={{
                      position:'relative', aspectRatio:'1 / 1',
                      borderRadius:8, overflow:'hidden',
                      border:`1px solid ${T.bdr}`, background:T.s2,
                    }}>
                      <img src={u} alt="" style={{
                        width:'100%', height:'100%', objectFit:'cover', display:'block',
                      }}/>
                      <button
                        onClick={() => removeImageAt(i)}
                        title="Remove"
                        style={{
                          position:'absolute', top:4, right:4,
                          width:22, height:22, borderRadius:'50%',
                          border:'none', background:'rgba(0,0,0,.65)',
                          color:'#fff', fontSize:13, cursor:'pointer',
                          display:'flex', alignItems:'center', justifyContent:'center',
                          lineHeight:1, fontFamily:'inherit',
                        }}
                      >✕</button>
                      {i === 0 && (
                        <span style={{
                          position:'absolute', bottom:4, left:4,
                          background:'rgba(0,0,0,.65)', color:'#fff',
                          fontSize:10, fontWeight:700,
                          padding:'1px 6px', borderRadius:20,
                        }}>Cover</span>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{display:'flex', alignItems:'center', justifyContent:'space-between', gap:8}}>
                  <span style={{fontSize:11.5, color:T.mu}}>
                    {imageFiles.length} of {MAX_IMAGES} photo{imageFiles.length===1?'':'s'} · first is the cover
                  </span>
                  <div style={{display:'flex', gap:6}}>
                    {imageFiles.length < MAX_IMAGES && (
                      <button onClick={()=>photosInputRef.current?.click()} style={{
                        padding:'5px 12px', borderRadius:20,
                        border:`1.5px solid ${T.bdr}`, background:T.w,
                        cursor:'pointer', fontSize:11.5, fontFamily:'inherit',
                        fontWeight:600, color:T.v,
                      }}>+ Add more</button>
                    )}
                    <button onClick={clearAttachment} style={{
                      padding:'5px 12px', borderRadius:20,
                      border:`1.5px solid ${T.bdr}`, background:T.w,
                      cursor:'pointer', fontSize:11.5, fontFamily:'inherit',
                      fontWeight:600, color:T.mu,
                    }}>✕ Remove all</button>
                  </div>
                </div>
                {uploading && (
                  <div style={{marginTop:8, padding:"8px 12px", background:T.v2, borderRadius:8, display:"flex", alignItems:"center", gap:9, fontSize:12.5, color:T.v, fontWeight:600}}>
                    <div style={{width:13,height:13,borderRadius:"50%",border:`2px solid ${T.v2}`,borderTop:`2px solid ${T.v}`,animation:"spin 1s linear infinite"}}/>
                    Uploading {imageFiles.length} photo{imageFiles.length===1?'':'s'}…
                  </div>
                )}
              </div>
            )}

            {attachType === 'file' && !uploadFile && imageFiles.length === 0 && (
              <label style={{display:"block",cursor:"pointer",marginTop:10}}>
                <input type="file"
                  accept="video/*,audio/*,application/pdf,text/csv,application/vnd.ms-excel"
                  onChange={handleFileSelect} style={{display:"none"}}/>
                <div style={{border:`2px dashed rgba(108,99,255,.3)`,borderRadius:12,padding:"20px 20px",textAlign:"center",background:`linear-gradient(135deg,${T.v2},${T.bl2})`}}>
                  <div style={{fontSize:26,marginBottom:6}}>📎</div>
                  <div style={{fontSize:13,fontWeight:700,color:T.text,marginBottom:6}}>Click to select a file</div>
                  <div style={{display:"flex",gap:6,justifyContent:"center",flexWrap:"wrap"}}>
                    {[["🎥","Video","200MB"],["🎙️","Audio","50MB"],["📄","PDF","25MB"],["📊","CSV","5MB"]].map(([icon,label,limit])=>(
                      <span key={label} style={{background:"rgba(255,255,255,.7)",border:"1px solid rgba(108,99,255,.2)",borderRadius:20,padding:"3px 9px",fontSize:10.5,fontWeight:700,color:T.v}}>
                        {icon} {label} · {limit}
                      </span>
                    ))}
                  </div>
                  <div style={{marginTop:8, fontSize:10.5, color:T.mu}}>Photos? Use the 📸 Photos button above to share multiple at once.</div>
                </div>
              </label>
            )}

            {uploadFile && (
              <div style={{border:`1px solid ${T.bdr}`,borderRadius:12,overflow:"hidden",marginTop:10}}>
                {uploadCategory==='image' && uploadPreview && (
                  <img src={uploadPreview} alt="Preview" style={{width:"100%",maxHeight:320,objectFit:"cover",display:"block"}}/>
                )}
                {uploadCategory==='video' && uploadPreview && (
                  <video src={uploadPreview} controls muted style={{width:"100%",maxHeight:320,display:"block",background:"#000"}}/>
                )}
                {uploadCategory==='audio' && uploadPreview && (
                  <div style={{padding:"14px",background:`linear-gradient(135deg,${T.v2},${T.bl2})`}}>
                    <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:8}}>
                      <span style={{fontSize:24}}>🎙️</span>
                      <div><div style={{fontSize:13,fontWeight:700}}>{uploadFile.name}</div><div style={{fontSize:11,color:T.mu}}>Audio</div></div>
                    </div>
                    <audio controls src={uploadPreview} style={{width:"100%"}}/>
                  </div>
                )}
                {uploadCategory==='pdf' && (
                  <div style={{padding:"14px",background:T.bl2,display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:28}}>📄</span>
                    <div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{uploadFile.name}</div><div style={{fontSize:11,color:T.mu}}>PDF · {(uploadFile.size/1024/1024).toFixed(1)}MB</div></div>
                  </div>
                )}
                {uploadCategory==='data' && (
                  <div style={{padding:"14px",background:T.gr2,display:"flex",alignItems:"center",gap:12}}>
                    <span style={{fontSize:28}}>📊</span>
                    <div><div style={{fontSize:13,fontWeight:700,color:T.text}}>{uploadFile.name}</div><div style={{fontSize:11,color:T.mu}}>CSV · {(uploadFile.size/1024).toFixed(0)}KB</div></div>
                  </div>
                )}
                <div style={{padding:"9px 12px",background:T.w,borderTop:`1px solid ${T.bdr}`,display:"flex",alignItems:"center",gap:10}}>
                  <span style={{fontSize:15}}>{catInfo[uploadCategory]?.icon||"📎"}</span>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:12,fontWeight:600,color:T.text,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{uploadFile.name}</div>
                    <div style={{fontSize:10.5,color:T.mu}}>{catInfo[uploadCategory]?.label} · {(uploadFile.size/1024/1024).toFixed(1)}MB</div>
                  </div>
                  <button onClick={clearAttachment}
                    style={{padding:"3px 10px",borderRadius:20,border:`1px solid ${T.bdr}`,background:T.w,cursor:"pointer",fontSize:11.5,fontFamily:"inherit",fontWeight:600,color:T.mu}}>
                    ✕ Remove
                  </button>
                </div>
                {uploading && (
                  <div style={{padding:"9px 14px",background:T.v2,display:"flex",alignItems:"center",gap:9,fontSize:12.5,color:T.v,fontWeight:600}}>
                    <div style={{width:13,height:13,borderRadius:"50%",border:`2px solid ${T.v2}`,borderTop:`2px solid ${T.v}`,animation:"spin 1s linear infinite"}}/>
                    Uploading {catInfo[uploadCategory]?.label||"file"}...
                  </div>
                )}
              </div>
            )}

          </div>
        )}

        {/* Hashtags */}
        <div style={{marginBottom:16}}>
          <input value={tags} onChange={e=>setTags(e.target.value)}
            style={{width:"100%",background:T.s2,border:`1.5px solid ${T.bdr}`,borderRadius:10,padding:"8px 14px",fontSize:12,fontFamily:"inherit",outline:"none",color:T.text}}
            placeholder="Hashtags: #MedicalAffairs #RWE #DigitalHealth (space or comma separated)"/>
        </div>

        {/* Footer — locked-visibility hint (closed groups + projects) +
            Clear. Cancel + Publish moved to the top bar; open-group
            cross-post toggle lives in the body above. */}
        <div style={{display:"flex",alignItems:"center",gap:8,marginTop:12,paddingTop:12,borderTop:`1px solid ${T.bdr}`,flexWrap:"wrap"}}>
          {lockedHint && (
            <span style={{fontSize:12,color:T.mu,fontWeight:600}}>{lockedHint}</span>
          )}
          <div style={{marginLeft:"auto"}}>
            <Btn onClick={()=>{setContent('');setError('');clearAttachment();}}>Clear</Btn>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}
