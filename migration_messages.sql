-- Conversation threads between two users
create table if not exists conversations (
  id           uuid primary key default gen_random_uuid(),
  user_id_a    uuid references profiles(id) on delete cascade not null,
  user_id_b    uuid references profiles(id) on delete cascade not null,
  last_message text    default '',
  last_message_at timestamptz default now(),
  created_at   timestamptz default now(),
  unique(user_id_a, user_id_b)
);

-- Individual messages within a conversation
create table if not exists messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid references conversations(id) on delete cascade not null,
  sender_id       uuid references profiles(id) on delete cascade not null,
  content         text not null,
  read_at         timestamptz default null, -- null = unread
  created_at      timestamptz default now()
);

-- Indexes for performance
create index if not exists idx_messages_conversation
  on messages(conversation_id, created_at);
create index if not exists idx_messages_unread
  on messages(sender_id, read_at) where read_at is null;
create index if not exists idx_conversations_user_a
  on conversations(user_id_a, last_message_at desc);
create index if not exists idx_conversations_user_b
  on conversations(user_id_b, last_message_at desc);

-- RLS
alter table conversations enable row level security;
alter table messages enable row level security;

create policy "conv_select" on conversations for select
  using (auth.uid() = user_id_a or auth.uid() = user_id_b);
-- Either user may create (IDs are sorted before insert for canonical ordering)
create policy "conv_insert" on conversations for insert
  with check (auth.uid() = user_id_a or auth.uid() = user_id_b);
create policy "conv_update" on conversations for update
  using (auth.uid() = user_id_a or auth.uid() = user_id_b);

create policy "msg_select" on messages for select
  using (
    conversation_id in (
      select id from conversations
      where user_id_a = auth.uid() or user_id_b = auth.uid()
    )
  );
create policy "msg_insert" on messages for insert
  with check (auth.uid() = sender_id);
create policy "msg_update" on messages for update
  using (auth.uid() != sender_id); -- only recipient can mark as read
