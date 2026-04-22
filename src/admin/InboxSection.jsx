import React, { useState, useEffect, useRef } from 'react';
import { T, LUMINARY_TEAM_USER_ID } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import { timeAgo } from '../lib/utils';

export default function InboxSection({ supabase }) {
  const [convos, setConvos]         = useState([]);
  const [profiles, setProfiles]     = useState({});
  const [loading, setLoading]       = useState(true);
  const [activeConvo, setActiveConvo] = useState(null);
  const [messages, setMessages]     = useState([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [reply, setReply]           = useState('');
  const [sending, setSending]       = useState(false);
  const bottomRef  = useRef(null);
  const channelRef = useRef(null);

  // Load all bot conversations
  useEffect(() => {
    const load = async () => {
      setLoading(true);

      const { data: convData } = await supabase
        .from('conversations')
        .select('*')
        .or(`user_id_a.eq.${LUMINARY_TEAM_USER_ID},user_id_b.eq.${LUMINARY_TEAM_USER_ID}`)
        .order('last_message_at', { ascending: false });

      if (!convData?.length) {
        setConvos([]);
        setLoading(false);
        return;
      }

      const otherIds = [...new Set(
        convData.map(c =>
          c.user_id_a === LUMINARY_TEAM_USER_ID ? c.user_id_b : c.user_id_a
        )
      )];

      const { data: profileData } = await supabase
        .from('profiles')
        .select('id, name, avatar_color, avatar_url, title, institution')
        .in('id', otherIds);

      const profileMap = {};
      (profileData || []).forEach(p => { profileMap[p.id] = p; });

      setProfiles(profileMap);
      setConvos(convData);
      setLoading(false);
    };
    load();
  }, [supabase]);

  // Load messages + subscribe when active convo changes
  useEffect(() => {
    if (!activeConvo) return;

    const loadMessages = async () => {
      setLoadingMsgs(true);
      const { data } = await supabase
        .from('messages')
        .select('id, sender_id, content, created_at')
        .eq('conversation_id', activeConvo.id)
        .order('created_at', { ascending: true });
      setMessages(data || []);
      setLoadingMsgs(false);
    };

    loadMessages();

    if (channelRef.current) supabase.removeChannel(channelRef.current);
    channelRef.current = supabase
      .channel(`admin-inbox-${activeConvo.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${activeConvo.id}`,
      }, payload => {
        setMessages(prev => [...prev, payload.new]);
      })
      .subscribe();

    return () => {
      if (channelRef.current) supabase.removeChannel(channelRef.current);
    };
  }, [activeConvo?.id]); // eslint-disable-line

  // Scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendReply = async () => {
    if (!reply.trim() || !activeConvo || sending) return;
    const text = reply.trim();
    setSending(true);
    setReply('');

    const { error } = await supabase.rpc('send_bot_message', {
      p_conversation_id: activeConvo.id,
      p_message:         text,
      p_bot_user_id:     LUMINARY_TEAM_USER_ID,
    });

    if (error) {
      setReply(text);
    } else {
      setConvos(prev => prev.map(c =>
        c.id === activeConvo.id
          ? { ...c, last_message: text, last_message_at: new Date().toISOString() }
          : c
      ));
    }
    setSending(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendReply();
    }
  };

  return (
    <div style={{ display: 'flex', height: '100%' }}>

      {/* ── Conversation list ─────────────────────────────────────── */}
      <div style={{
        width: 280, flexShrink: 0,
        borderRight: `1px solid ${T.bdr}`,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        <div style={{ padding: '0 16px 14px', borderBottom: `1px solid ${T.bdr}` }}>
          <h1 style={{
            fontFamily: "'DM Serif Display', serif",
            fontSize: 24, color: T.text, margin: '0 0 2px',
          }}>
            Inbox
          </h1>
          <div style={{ fontSize: 12, color: T.mu }}>
            {convos.length} conversation{convos.length !== 1 ? 's' : ''}
          </div>
        </div>

        <div style={{ flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 24, textAlign: 'center' }}><Spinner /></div>
          ) : convos.length === 0 ? (
            <div style={{
              padding: 24, fontSize: 13, color: T.mu, textAlign: 'center',
            }}>
              No conversations yet.<br />Send a nudge to start one.
            </div>
          ) : (
            convos.map(c => {
              const otherId = c.user_id_a === LUMINARY_TEAM_USER_ID ? c.user_id_b : c.user_id_a;
              const p = profiles[otherId];
              const isActive = activeConvo?.id === c.id;
              return (
                <div
                  key={c.id}
                  onClick={() => setActiveConvo(c)}
                  style={{
                    padding: '11px 16px',
                    borderBottom: `1px solid ${T.bdr}`,
                    cursor: 'pointer',
                    background: isActive ? T.v2 : 'transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                    <Av
                      size={32}
                      name={p?.name}
                      color={p?.avatar_color}
                      url={p?.avatar_url || ''}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 600, color: T.text }}>
                        {p?.name || '—'}
                      </div>
                      <div style={{
                        fontSize: 12, color: T.mu,
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                      }}>
                        {c.last_message || '—'}
                      </div>
                    </div>
                    <div style={{ fontSize: 11, color: T.mu, flexShrink: 0 }}>
                      {c.last_message_at ? timeAgo(c.last_message_at) : ''}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* ── Thread ────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {!activeConvo ? (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            color: T.mu, fontSize: 14,
          }}>
            Select a conversation
          </div>
        ) : (() => {
          const otherId = activeConvo.user_id_a === LUMINARY_TEAM_USER_ID
            ? activeConvo.user_id_b : activeConvo.user_id_a;
          const p = profiles[otherId];
          return (
            <>
              {/* Thread header */}
              <div style={{
                padding: '14px 20px',
                borderBottom: `1px solid ${T.bdr}`,
                display: 'flex', alignItems: 'center', gap: 10,
                flexShrink: 0,
              }}>
                <Av size={34} name={p?.name} color={p?.avatar_color} url={p?.avatar_url || ''} />
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: T.text }}>
                    {p?.name || '—'}
                  </div>
                  {(p?.title || p?.institution) && (
                    <div style={{ fontSize: 12, color: T.mu }}>
                      {[p.title, p.institution].filter(Boolean).join(' · ')}
                    </div>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px' }}>
                {loadingMsgs ? (
                  <div style={{ textAlign: 'center', padding: 24 }}><Spinner /></div>
                ) : (
                  messages.map(msg => {
                    const isBot = msg.sender_id === LUMINARY_TEAM_USER_ID;
                    return (
                      <div
                        key={msg.id}
                        style={{
                          display: 'flex',
                          justifyContent: isBot ? 'flex-end' : 'flex-start',
                          marginBottom: 10,
                        }}
                      >
                        <div style={{
                          maxWidth: '70%',
                          padding: '9px 13px',
                          borderRadius: isBot
                            ? '14px 14px 4px 14px'
                            : '14px 14px 14px 4px',
                          background: isBot ? T.v : T.s3,
                          color: isBot ? '#fff' : T.text,
                          fontSize: 13.5,
                          lineHeight: 1.5,
                        }}>
                          {msg.content}
                          <div style={{
                            fontSize: 10.5,
                            color: isBot ? 'rgba(255,255,255,0.6)' : T.mu,
                            marginTop: 4,
                            textAlign: 'right',
                          }}>
                            {timeAgo(msg.created_at)}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={bottomRef} />
              </div>

              {/* Reply box */}
              <div style={{
                padding: '12px 20px',
                borderTop: `1px solid ${T.bdr}`,
                display: 'flex', gap: 8, alignItems: 'flex-end',
                flexShrink: 0,
              }}>
                <textarea
                  value={reply}
                  onChange={e => setReply(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Reply as Luminary Team… (Enter to send, Shift+Enter for newline)"
                  rows={2}
                  style={{
                    flex: 1, padding: '9px 12px', borderRadius: 9,
                    border: `1px solid ${T.bdr}`, background: T.s2,
                    fontSize: 13, color: T.text, fontFamily: 'inherit',
                    resize: 'none', outline: 'none',
                  }}
                />
                <button
                  onClick={sendReply}
                  disabled={sending || !reply.trim()}
                  style={{
                    padding: '9px 18px', borderRadius: 9, border: 'none',
                    background: T.v, color: '#fff', fontWeight: 600,
                    fontSize: 13,
                    cursor: (sending || !reply.trim()) ? 'default' : 'pointer',
                    opacity: (sending || !reply.trim()) ? 0.5 : 1,
                    fontFamily: 'inherit', flexShrink: 0,
                  }}
                >
                  {sending ? '…' : 'Send'}
                </button>
              </div>
            </>
          );
        })()}
      </div>
    </div>
  );
}
