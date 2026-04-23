import React, { useState, useEffect } from 'react';
import { T, LUMINARY_TEAM_USER_ID } from '../../lib/constants';
import Av from '../../components/Av';
import Spinner from '../../components/Spinner';
import { buildCitationFromCrossRef } from '../../lib/utils';
import { capture } from '../../lib/analytics';

const MODES = [
  { id: 'broadcast', label: '📢 Broadcast',  desc: 'All users see this in their feed' },
  { id: 'targeted',  label: '🎯 Targeted',   desc: 'Specific users only'              },
  { id: 'group',     label: '👥 Group',      desc: 'Post to a group feed'             },
];

const POST_TYPES = [
  { id: 'text',  label: '✏️ Text'  },
  { id: 'paper', label: '📄 Paper' },
];

export default function ComposeTab({ supabase, user }) {
  const [mode, setMode]         = useState('broadcast');
  const [postType, setPostType] = useState('text');
  const [content, setContent]   = useState('');

  const [users, setUsers]                     = useState([]);
  const [groups, setGroups]                   = useState([]);
  const [selectedUserIds, setSelectedUserIds] = useState(new Set());
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [userSearch, setUserSearch]           = useState('');
  const [loadingUsers, setLoadingUsers]       = useState(false);

  const [doi, setDoi]             = useState('');
  const [doiLoading, setDoiLoading] = useState(false);
  const [paperData, setPaperData] = useState(null);
  const [doiError, setDoiError]   = useState('');

  const [sending, setSending]   = useState(false);
  const [sent, setSent]         = useState(false);
  const [sendError, setSendError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoadingUsers(true);
      const [usersRes, groupsRes] = await Promise.all([
        supabase.rpc('get_admin_user_list'),
        supabase.from('groups').select('id, name').order('name'),
      ]);
      setUsers(usersRes.data || []);
      setGroups(groupsRes.data || []);
      setLoadingUsers(false);
    };
    load();
  }, [supabase]);

  const filteredUsers = users.filter(u => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return u.name?.toLowerCase().includes(q) || u.institution?.toLowerCase().includes(q);
  });

  const toggleUser = (id) => {
    setSelectedUserIds(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const lookupDoi = async () => {
    if (!doi.trim()) return;
    setDoiLoading(true); setDoiError(''); setPaperData(null);
    try {
      const res  = await fetch(`https://api.crossref.org/works/${encodeURIComponent(doi.trim())}`);
      if (!res.ok) throw new Error('Not found');
      const json = await res.json();
      const w    = json.message;
      const citation = buildCitationFromCrossRef(w, doi.trim());
      setPaperData({
        doi:      doi.trim(),
        title:    w.title?.[0]              || '',
        journal:  w['container-title']?.[0] || '',
        authors:  (w.author || []).map(a => `${a.family || ''} ${(a.given || '')[0] || ''}.`.trim()).join(', '),
        abstract: w.abstract || '',
        year:     w.published?.['date-parts']?.[0]?.[0] || null,
        citation,
      });
    } catch {
      setDoiError('DOI not found. Check the format and try again.');
    }
    setDoiLoading(false);
  };

  const canSend = () => {
    if (!content.trim()) return false;
    if (mode === 'targeted' && selectedUserIds.size === 0) return false;
    if (mode === 'group' && !selectedGroupId) return false;
    if (postType === 'paper' && !paperData) return false;
    return true;
  };

  const handleSend = async () => {
    if (!canSend()) return;
    setSending(true); setSendError('');

    const payload = {
      p_mode:        mode,
      p_content:     content.trim(),
      p_bot_user_id: LUMINARY_TEAM_USER_ID,
      p_post_type:   postType,
    };
    if (mode === 'targeted') payload.p_target_user_ids = Array.from(selectedUserIds);
    if (mode === 'group')    payload.p_group_id = selectedGroupId;
    if (postType === 'paper' && paperData) {
      payload.p_paper_doi      = paperData.doi;
      payload.p_paper_title    = paperData.title;
      payload.p_paper_journal  = paperData.journal;
      payload.p_paper_authors  = paperData.authors;
      payload.p_paper_abstract = paperData.abstract;
      payload.p_paper_year     = paperData.year;
      payload.p_paper_citation = paperData.citation;
    }

    const { error } = await supabase.rpc('send_admin_post', payload);
    setSending(false);
    if (error) { setSendError(error.message || 'Send failed.'); return; }

    capture('admin_post_sent', {
      mode,
      post_type: postType,
      recipient_count: mode === 'targeted' ? selectedUserIds.size : 1,
    });

    setSent(true);
    setTimeout(() => {
      setSent(false); setContent(''); setPaperData(null);
      setDoi(''); setSelectedUserIds(new Set()); setSelectedGroupId('');
    }, 2000);
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 20 }}>

      {/* Left: mode + recipient selector */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bdr}`, fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4 }}>
            Delivery mode
          </div>
          {MODES.map(m => (
            <button key={m.id} onClick={() => setMode(m.id)} style={{
              display: 'block', width: '100%', textAlign: 'left', padding: '10px 14px',
              border: 'none', borderBottom: `1px solid ${T.bdr}`,
              background: mode === m.id ? T.v2 : 'transparent',
              cursor: 'pointer', fontFamily: 'inherit',
            }}>
              <div style={{ fontSize: 13, fontWeight: mode === m.id ? 700 : 500, color: mode === m.id ? T.v3 : T.text }}>
                {m.label}
              </div>
              <div style={{ fontSize: 11.5, color: T.mu, marginTop: 2 }}>{m.desc}</div>
            </button>
          ))}
        </div>

        {mode === 'targeted' && (
          <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: `1px solid ${T.bdr}`, fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4 }}>
              Recipients ({selectedUserIds.size})
            </div>
            <div style={{ padding: '8px 10px', borderBottom: `1px solid ${T.bdr}` }}>
              <input
                placeholder="Search users…"
                value={userSearch}
                onChange={e => setUserSearch(e.target.value)}
                style={{ width: '100%', padding: '6px 10px', borderRadius: 7, border: `1px solid ${T.bdr}`, background: T.s2, fontSize: 12, outline: 'none', boxSizing: 'border-box', fontFamily: 'inherit', color: T.text }}
              />
            </div>
            <div style={{ maxHeight: 260, overflow: 'auto' }}>
              {loadingUsers ? (
                <div style={{ padding: 16, textAlign: 'center' }}><Spinner /></div>
              ) : filteredUsers.map(u => (
                <div key={u.id} onClick={() => toggleUser(u.id)} style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '7px 12px', cursor: 'pointer',
                  background: selectedUserIds.has(u.id) ? T.v2 : 'transparent',
                  borderBottom: `1px solid ${T.bdr}`,
                }}>
                  <input type="checkbox" readOnly checked={selectedUserIds.has(u.id)} style={{ flexShrink: 0, cursor: 'pointer' }} />
                  <Av size={22} name={u.name} color={u.avatar_color} url="" />
                  <div style={{ fontSize: 12.5, color: T.text, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {u.name}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {mode === 'group' && (
          <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 14 }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: T.mu, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 8 }}>
              Select group
            </div>
            <select value={selectedGroupId} onChange={e => setSelectedGroupId(e.target.value)}
              style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.s2, fontSize: 13, color: T.text, fontFamily: 'inherit', outline: 'none' }}>
              <option value="">Choose a group…</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {/* Right: compose */}
      <div style={{ background: T.w, border: `1px solid ${T.bdr}`, borderRadius: 12, padding: 20 }}>
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {POST_TYPES.map(t => (
            <button key={t.id} onClick={() => setPostType(t.id)} style={{
              padding: '7px 14px', borderRadius: 9, border: 'none',
              background: postType === t.id ? T.v2 : T.s2,
              color: postType === t.id ? T.v3 : T.mu,
              fontWeight: postType === t.id ? 700 : 500,
              fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
            }}>
              {t.label}
            </button>
          ))}
        </div>

        <textarea
          value={content}
          onChange={e => setContent(e.target.value)}
          rows={5}
          placeholder={
            postType === 'paper' ? 'Add a note about this paper (optional)…'
            : mode === 'broadcast' ? 'Write a message to all users…'
            : 'Write your message…'
          }
          style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: `1px solid ${T.bdr}`, background: T.s2, fontSize: 13, color: T.text, fontFamily: 'inherit', resize: 'vertical', outline: 'none', boxSizing: 'border-box', marginBottom: 14 }}
        />

        {postType === 'paper' && (
          <div style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
              <input
                value={doi} onChange={e => setDoi(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && lookupDoi()}
                placeholder="Enter DOI e.g. 10.1056/NEJMoa2304741"
                style={{ flex: 1, padding: '8px 11px', borderRadius: 8, border: `1px solid ${T.bdr}`, background: T.s2, fontSize: 13, color: T.text, fontFamily: 'inherit', outline: 'none' }}
              />
              <button onClick={lookupDoi} disabled={doiLoading} style={{ padding: '8px 14px', borderRadius: 8, border: 'none', background: T.v, color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}>
                {doiLoading ? '…' : 'Look up'}
              </button>
            </div>
            {doiError && <div style={{ fontSize: 12, color: T.ro, marginBottom: 8 }}>{doiError}</div>}
            {paperData && (
              <div style={{ padding: '10px 12px', borderRadius: 9, background: T.s2, border: `1px solid ${T.bdr}` }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: T.text, marginBottom: 3 }}>{paperData.title}</div>
                <div style={{ fontSize: 12, color: T.mu }}>{paperData.journal}{paperData.year ? ` · ${paperData.year}` : ''}</div>
              </div>
            )}
          </div>
        )}

        <div style={{ fontSize: 12, color: T.mu, marginBottom: 14, padding: '8px 12px', background: T.s2, borderRadius: 8, border: `1px solid ${T.bdr}` }}>
          {mode === 'broadcast' && "📢 Will appear in all users' For You feeds"}
          {mode === 'targeted'  && `🎯 Will appear only for ${selectedUserIds.size} selected user${selectedUserIds.size !== 1 ? 's' : ''}`}
          {mode === 'group'     && '👥 Will post to the selected group feed'}
          {' · Sent as '}<strong>Luminary Team</strong>
        </div>

        {sendError && <div style={{ padding: '8px 12px', borderRadius: 8, background: T.ro2, color: T.ro, fontSize: 13, marginBottom: 10 }}>{sendError}</div>}
        {sent && <div style={{ padding: '8px 12px', borderRadius: 8, background: T.gr2, color: T.gr, fontSize: 13, fontWeight: 600, marginBottom: 10, textAlign: 'center' }}>✓ Sent successfully</div>}

        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button onClick={handleSend} disabled={sending || sent || !canSend()} style={{
            padding: '10px 24px', borderRadius: 9, border: 'none',
            background: T.v, color: '#fff', fontWeight: 600, fontSize: 14,
            cursor: 'pointer', fontFamily: 'inherit',
            opacity: (sending || sent || !canSend()) ? 0.6 : 1,
          }}>
            {sending ? 'Sending…' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
