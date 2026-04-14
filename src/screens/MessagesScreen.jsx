import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import { timeAgo } from '../lib/utils';
import { useWindowSize } from '../lib/useWindowSize';

// ─── Exported helper — call from anywhere to open or create a DM thread ──────

export async function startConversation(currentUserId, otherUserId, supabaseClient) {
  // Sort IDs for canonical ordering (prevents duplicate conversations)
  const [a, b] = [currentUserId, otherUserId].sort();

  const { data: existing } = await supabaseClient
    .from('conversations')
    .select('id')
    .eq('user_id_a', a)
    .eq('user_id_b', b)
    .maybeSingle();

  if (existing) return existing.id;

  const { data: newConv } = await supabaseClient
    .from('conversations')
    .insert({ user_id_a: a, user_id_b: b })
    .select('id')
    .single();

  return newConv?.id;
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ConversationRow({ conv, isActive, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', gap: 10, padding: '12px 16px',
        background: isActive ? T.v2 : 'transparent',
        cursor: 'pointer', borderBottom: `1px solid ${T.bdr}`,
        transition: 'background .1s',
      }}
    >
      <Av
        size={40}
        color={conv.otherUser?.avatar_color || 'me'}
        name={conv.otherUser?.name}
        url={conv.otherUser?.avatar_url || ''}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 700,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {conv.otherUser?.name || 'Unknown'}
        </div>
        <div style={{
          fontSize: 12, color: T.mu, marginTop: 2,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {conv.last_message || 'No messages yet'}
        </div>
      </div>
      <div style={{ fontSize: 10.5, color: T.mu, flexShrink: 0, paddingTop: 2 }}>
        {timeAgo(conv.last_message_at)}
      </div>
    </div>
  );
}

function MessageThread({
  messages, currentUserId, otherUser, newMessage,
  setNewMessage, onSend, sending, messagesEndRef, onViewProfile, onBack,
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Thread header */}
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${T.bdr}`,
        display: 'flex', alignItems: 'center', gap: 10,
        background: T.w, flexShrink: 0,
      }}>
        {onBack && (
          <button
            onClick={onBack}
            style={{
              width: 32, height: 32, borderRadius: '50%', border: 'none',
              background: T.s3, cursor: 'pointer', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, color: T.mu,
            }}
          >
            ←
          </button>
        )}
        <Av size={36} color={otherUser?.avatar_color} name={otherUser?.name} url={otherUser?.avatar_url || ''} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{otherUser?.name}</div>
          {otherUser?.title && (
            <div style={{ fontSize: 11.5, color: T.mu }}>{otherUser.title}</div>
          )}
        </div>
        {onViewProfile && (
          <button
            onClick={onViewProfile}
            style={{
              fontSize: 12, color: T.v, fontWeight: 600,
              border: `1px solid ${T.v}`, background: T.v2,
              borderRadius: 20, padding: '5px 12px',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            View profile
          </button>
        )}
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px' }}>
        {messages.map(msg => {
          const isMine = msg.sender_id === currentUserId;
          return (
            <div key={msg.id} style={{
              display: 'flex',
              justifyContent: isMine ? 'flex-end' : 'flex-start',
              marginBottom: 8,
            }}>
              <div style={{
                maxWidth: '70%',
                padding: '9px 13px',
                borderRadius: isMine ? '18px 18px 4px 18px' : '18px 18px 18px 4px',
                background: isMine ? T.v : T.s2,
                color: isMine ? '#fff' : T.text,
                fontSize: 13,
                lineHeight: 1.55,
                wordBreak: 'break-word',
                whiteSpace: 'pre-wrap',
              }}>
                {msg.content}
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Compose */}
      <div style={{
        padding: '12px 16px', borderTop: `1px solid ${T.bdr}`,
        display: 'flex', gap: 8, alignItems: 'flex-end',
        background: T.w, flexShrink: 0,
      }}>
        <textarea
          value={newMessage}
          onChange={e => setNewMessage(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onSend(); }
          }}
          placeholder="Write a message… (Enter to send, Shift+Enter for new line)"
          rows={1}
          style={{
            flex: 1, background: T.s2, border: `1.5px solid ${T.bdr}`,
            borderRadius: 20, padding: '9px 14px', fontSize: 13,
            fontFamily: 'inherit', outline: 'none', resize: 'none',
            lineHeight: 1.5, maxHeight: 120, overflowY: 'auto',
          }}
        />
        <button
          onClick={onSend}
          disabled={sending || !newMessage.trim()}
          style={{
            width: 38, height: 38, borderRadius: '50%', border: 'none',
            background: newMessage.trim() ? T.v : T.bdr,
            color: newMessage.trim() ? '#fff' : T.mu,
            cursor: newMessage.trim() ? 'pointer' : 'default',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, fontSize: 16, transition: 'all .15s',
          }}
        >
          ↑
        </button>
      </div>
    </div>
  );
}

// ─── New Message Panel ────────────────────────────────────────────────────────

function NewMessagePanel({ user, onSelect, onClose }) {
  const [query,       setQuery]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [results,     setResults]     = useState([]);
  const [loadingSug,  setLoadingSug]  = useState(true);
  const [loadingSrch, setLoadingSrch] = useState(false);
  const searchRef = useRef(null);

  // Focus search on mount
  useEffect(() => { searchRef.current?.focus(); }, []);

  // Load suggestions: union of people I follow + followers (user-type only)
  useEffect(() => {
    (async () => {
      setLoadingSug(true);
      const [{ data: following }, { data: followers }] = await Promise.all([
        supabase
          .from('follows')
          .select('target_id')
          .eq('follower_id', user.id)
          .eq('target_type', 'user'),
        supabase
          .from('follows')
          .select('follower_id')
          .eq('target_id', user.id)
          .eq('target_type', 'user'),
      ]);

      const ids = [
        ...new Set([
          ...(following || []).map(r => r.target_id),
          ...(followers || []).map(r => r.follower_id),
        ]),
      ].filter(id => id !== user.id);

      if (!ids.length) { setSuggestions([]); setLoadingSug(false); return; }

      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, name, title, avatar_url, avatar_color')
        .in('id', ids)
        .order('name');

      setSuggestions(profiles || []);
      setLoadingSug(false);
    })();
  }, [user.id]);

  // Debounced search
  useEffect(() => {
    if (!query.trim()) { setResults([]); return; }
    setLoadingSrch(true);
    const timer = setTimeout(async () => {
      const { data } = await supabase
        .from('profiles')
        .select('id, name, title, avatar_url, avatar_color')
        .ilike('name', `%${query.trim()}%`)
        .neq('id', user.id)
        .order('name')
        .limit(20);
      setResults(data || []);
      setLoadingSrch(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [query, user.id]);

  const people = query.trim() ? results : suggestions;
  const isLoading = query.trim() ? loadingSrch : loadingSug;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* Header */}
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${T.bdr}`,
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <button
          onClick={onClose}
          style={{
            width: 28, height: 28, borderRadius: '50%', border: 'none',
            background: T.s3, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 14, color: T.mu, flexShrink: 0,
          }}
        >
          ←
        </button>
        <span style={{ fontSize: 14, fontWeight: 700, flex: 1 }}>New message</span>
      </div>

      {/* Search input */}
      <div style={{ padding: '10px 16px', borderBottom: `1px solid ${T.bdr}` }}>
        <input
          ref={searchRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Search by name…"
          style={{
            width: '100%', boxSizing: 'border-box',
            background: T.s2, border: `1.5px solid ${T.bdr}`,
            borderRadius: 20, padding: '8px 14px',
            fontSize: 13, fontFamily: 'inherit',
            outline: 'none', color: T.text,
          }}
        />
      </div>

      {/* Section label */}
      {!query.trim() && (
        <div style={{
          padding: '8px 16px 4px', fontSize: 11, fontWeight: 700,
          color: T.mu, textTransform: 'uppercase', letterSpacing: '.06em',
        }}>
          Suggested
        </div>
      )}

      {/* People list */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {isLoading && (
          <div style={{ display: 'flex', justifyContent: 'center', padding: 24 }}>
            <Spinner />
          </div>
        )}
        {!isLoading && people.length === 0 && (
          <div style={{ padding: 24, textAlign: 'center', color: T.mu, fontSize: 13 }}>
            {query.trim() ? 'No users found.' : 'Follow people to see suggestions here.'}
          </div>
        )}
        {!isLoading && people.map(p => (
          <div
            key={p.id}
            onClick={() => onSelect(p)}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', cursor: 'pointer',
              borderBottom: `1px solid ${T.bdr}`,
              transition: 'background .1s',
            }}
            onMouseEnter={e => e.currentTarget.style.background = T.s2}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            <Av size={38} color={p.avatar_color} name={p.name} url={p.avatar_url || ''} />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {p.name}
              </div>
              {p.title && (
                <div style={{ fontSize: 11.5, color: T.mu, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {p.title}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Main MessagesScreen ──────────────────────────────────────────────────────

export default function MessagesScreen({ user, onViewUser }) {
  const [conversations,   setConversations]   = useState([]);
  const [activeConvId,    setActiveConvId]    = useState(null);
  const [activeOtherUser, setActiveOtherUser] = useState(null);
  const [messages,        setMessages]        = useState([]);
  const [newMessage,      setNewMessage]      = useState('');
  const [loading,         setLoading]         = useState(true);
  const [sending,         setSending]         = useState(false);
  const [unreadCount,     setUnreadCount]     = useState(0);
  const [showNewMessage,  setShowNewMessage]  = useState(false);
  const [mobileView,      setMobileView]      = useState('list'); // 'list' | 'thread'
  const { isMobile } = useWindowSize();
  const messagesEndRef = useRef(null);

  // Auto-scroll when messages update
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Load conversations on mount
  useEffect(() => {
    fetchConversations();
  }, []); // eslint-disable-line

  // Open pre-selected conversation from sessionStorage (set by Message button)
  useEffect(() => {
    if (!conversations.length) return;
    const convId = sessionStorage.getItem('open_conversation');
    if (!convId) return;
    sessionStorage.removeItem('open_conversation');
    const conv = conversations.find(c => c.id === convId);
    if (conv) {
      setActiveConvId(conv.id);
      setActiveOtherUser(conv.otherUser);
      fetchMessages(conv.id);
    } else {
      // Conversation exists in DB but not loaded yet (e.g. brand-new)
      setActiveConvId(convId);
      fetchMessages(convId);
      fetchConversations(); // refresh to include the new conv
    }
  }, [conversations]); // eslint-disable-line

  // Real-time subscription for active conversation
  useEffect(() => {
    if (!activeConvId) return;

    const channel = supabase
      .channel(`messages:${activeConvId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: `conversation_id=eq.${activeConvId}`,
      }, (payload) => {
        setMessages(prev => {
          if (prev.some(m => m.id === payload.new.id)) return prev;
          return [...prev, payload.new];
        });
        // Mark as read if we're the recipient
        if (payload.new.sender_id !== user.id) {
          supabase.from('messages')
            .update({ read_at: new Date().toISOString() })
            .eq('id', payload.new.id);
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [activeConvId, user.id]);

  // Real-time: refresh conv list when a new conversation is created for us
  useEffect(() => {
    const channel = supabase
      .channel('conversations:me')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'conversations',
      }, () => { fetchConversations(); })
      .on('postgres_changes', {
        event: 'UPDATE',
        schema: 'public',
        table: 'conversations',
      }, () => { fetchConversations(); })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []); // eslint-disable-line

  const fetchConversations = async () => {
    const { data } = await supabase
      .from('conversations')
      .select(`
        id, last_message, last_message_at,
        user_id_a, user_id_b,
        profile_a:profiles!conversations_user_id_a_fkey(id, name, avatar_url, avatar_color, title),
        profile_b:profiles!conversations_user_id_b_fkey(id, name, avatar_url, avatar_color, title)
      `)
      .or(`user_id_a.eq.${user.id},user_id_b.eq.${user.id}`)
      .order('last_message_at', { ascending: false });

    const enriched = (data || []).map(conv => ({
      ...conv,
      otherUser: conv.user_id_a === user.id ? conv.profile_b : conv.profile_a,
    }));

    setConversations(enriched);
    setLoading(false);

    // Update unread count
    if (enriched.length > 0) {
      const ids = enriched.map(c => c.id);
      const { count } = await supabase
        .from('messages')
        .select('id', { count: 'exact', head: true })
        .in('conversation_id', ids)
        .neq('sender_id', user.id)
        .is('read_at', null);
      setUnreadCount(count || 0);
    } else {
      setUnreadCount(0);
    }
  };

  const fetchMessages = async (convId) => {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('conversation_id', convId)
      .order('created_at', { ascending: true });

    setMessages(data || []);

    // Mark received messages as read
    await supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('conversation_id', convId)
      .neq('sender_id', user.id)
      .is('read_at', null);
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !activeConvId || sending) return;
    setSending(true);
    const content = newMessage.trim();
    setNewMessage('');

    // Optimistic update
    const optimistic = {
      id: `temp-${Date.now()}`,
      conversation_id: activeConvId,
      sender_id: user.id,
      content,
      created_at: new Date().toISOString(),
      read_at: null,
    };
    setMessages(m => [...m, optimistic]);

    await supabase.from('messages').insert({
      conversation_id: activeConvId,
      sender_id: user.id,
      content,
    });

    await supabase.from('conversations').update({
      last_message: content.slice(0, 100),
      last_message_at: new Date().toISOString(),
    }).eq('id', activeConvId);

    await fetchMessages(activeConvId);
    await fetchConversations();
    setSending(false);
  };

  const openConversation = (conv) => {
    setActiveConvId(conv.id);
    setActiveOtherUser(conv.otherUser);
    fetchMessages(conv.id);
    setMobileView('thread');
  };

  const handleNewMessageSelect = useCallback(async (profile) => {
    setShowNewMessage(false);
    const convId = await startConversation(user.id, profile.id, supabase);
    if (!convId) return;
    setActiveConvId(convId);
    setActiveOtherUser(profile);
    fetchMessages(convId);
    fetchConversations();
    setMobileView('thread');
  }, [user.id]); // eslint-disable-line

  // On mobile, show only one panel at a time
  const showList   = !isMobile || mobileView === 'list';
  const showThread = !isMobile || mobileView === 'thread';

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Left panel — conversation list ── */}
      <div style={{
        width: isMobile ? '100%' : 280, flexShrink: 0,
        borderRight: isMobile ? 'none' : `1px solid ${T.bdr}`,
        display: showList ? 'flex' : 'none', flexDirection: 'column',
        background: T.w, overflow: 'hidden',
      }}>
        {showNewMessage ? (
          <NewMessagePanel
            user={user}
            onSelect={handleNewMessageSelect}
            onClose={() => setShowNewMessage(false)}
          />
        ) : (
          <>
            <div style={{
              padding: '14px 16px', borderBottom: `1px solid ${T.bdr}`,
              fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ flex: 1 }}>Messages</span>
              {unreadCount > 0 && (
                <span style={{
                  fontSize: 11, fontWeight: 700,
                  background: T.v, color: '#fff',
                  padding: '2px 7px', borderRadius: 20,
                }}>
                  {unreadCount}
                </span>
              )}
              {/* Compose button */}
              <button
                onClick={() => setShowNewMessage(true)}
                title="New message"
                style={{
                  width: 30, height: 30, borderRadius: '50%', border: 'none',
                  background: T.v2, color: T.v, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0, transition: 'background .15s, color .15s',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = T.v; e.currentTarget.style.color = '#fff'; }}
                onMouseLeave={e => { e.currentTarget.style.background = T.v2; e.currentTarget.style.color = T.v; }}
              >
                {/* Compose / pencil icon */}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none"
                  stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9" />
                  <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4 12.5-12.5z" />
                </svg>
              </button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto' }}>
              {loading && (
                <div style={{ display: 'flex', justifyContent: 'center', padding: 32 }}>
                  <Spinner />
                </div>
              )}
              {!loading && conversations.length === 0 && (
                <div style={{ padding: 24, textAlign: 'center', color: T.mu, fontSize: 13, lineHeight: 1.7 }}>
                  No messages yet.
                  <br />
                  <button
                    onClick={() => setShowNewMessage(true)}
                    style={{
                      marginTop: 8, fontSize: 13, color: T.v, fontWeight: 600,
                      background: T.v2, border: 'none', borderRadius: 20,
                      padding: '6px 14px', cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >
                    Write a new message
                  </button>
                </div>
              )}
              {conversations.map(conv => (
                <ConversationRow
                  key={conv.id}
                  conv={conv}
                  isActive={conv.id === activeConvId}
                  onClick={() => openConversation(conv)}
                />
              ))}
            </div>
          </>
        )}
      </div>

      {/* ── Right panel — message thread ── */}
      {showThread && (
        activeConvId ? (
          <MessageThread
            messages={messages}
            currentUserId={user.id}
            otherUser={activeOtherUser}
            newMessage={newMessage}
            setNewMessage={setNewMessage}
            onSend={sendMessage}
            sending={sending}
            messagesEndRef={messagesEndRef}
            onBack={isMobile ? () => setMobileView('list') : null}
            onViewProfile={
              activeOtherUser && onViewUser
                ? () => onViewUser(activeOtherUser.id)
                : null
            }
          />
        ) : (
          <div style={{
            flex: 1, display: 'flex', alignItems: 'center',
            justifyContent: 'center', color: T.mu,
            flexDirection: 'column', gap: 12,
          }}>
            <div style={{ fontSize: 32 }}>💬</div>
            <div style={{ fontSize: 14, fontFamily: "'DM Serif Display',serif", color: T.text }}>
              Your messages
            </div>
            <div style={{ fontSize: 13, textAlign: 'center', maxWidth: 240, lineHeight: 1.6 }}>
              Select a conversation or message someone from their profile.
            </div>
          </div>
        )
      )}
    </div>
  );
}
