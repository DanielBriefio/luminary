import { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabase';
import { T } from '../lib/constants';
import Av from '../components/Av';
import Spinner from '../components/Spinner';
import { timeAgo } from '../lib/utils';

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
  setNewMessage, onSend, sending, messagesEndRef, onViewProfile,
}) {
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Thread header */}
      <div style={{
        padding: '12px 16px', borderBottom: `1px solid ${T.bdr}`,
        display: 'flex', alignItems: 'center', gap: 10,
        background: T.w, flexShrink: 0,
      }}>
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
  };

  return (
    <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

      {/* ── Left panel — conversation list ── */}
      <div style={{
        width: 280, flexShrink: 0,
        borderRight: `1px solid ${T.bdr}`,
        display: 'flex', flexDirection: 'column',
        background: T.w,
      }}>
        <div style={{
          padding: '14px 16px', borderBottom: `1px solid ${T.bdr}`,
          fontSize: 15, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8,
        }}>
          Messages
          {unreadCount > 0 && (
            <span style={{
              fontSize: 11, fontWeight: 700,
              background: T.v, color: '#fff',
              padding: '2px 7px', borderRadius: 20,
            }}>
              {unreadCount}
            </span>
          )}
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
              Visit someone's profile to send them a message.
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
      </div>

      {/* ── Right panel — message thread ── */}
      {activeConvId ? (
        <MessageThread
          messages={messages}
          currentUserId={user.id}
          otherUser={activeOtherUser}
          newMessage={newMessage}
          setNewMessage={setNewMessage}
          onSend={sendMessage}
          sending={sending}
          messagesEndRef={messagesEndRef}
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
      )}
    </div>
  );
}
