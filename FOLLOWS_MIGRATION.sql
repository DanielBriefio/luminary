-- ============================================================
-- Luminary: Follow System Migration
-- Run in Supabase Dashboard → SQL Editor
-- ============================================================

-- Drop and recreate to ensure correct schema
DROP TABLE IF EXISTS follows CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;

-- 1. follows table
CREATE TABLE follows (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  target_type  TEXT NOT NULL CHECK (target_type IN ('user','paper','group')),
  target_id    TEXT NOT NULL,   -- user UUID, paper DOI, or group UUID (as text)
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(follower_id, target_type, target_id)
);

CREATE INDEX follows_follower_idx ON follows (follower_id);
CREATE INDEX follows_target_idx   ON follows (target_type, target_id);

ALTER TABLE follows ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read follows"
  ON follows FOR SELECT USING (true);

CREATE POLICY "Users can insert their own follows"
  ON follows FOR INSERT WITH CHECK (auth.uid() = follower_id);

CREATE POLICY "Users can delete their own follows"
  ON follows FOR DELETE USING (auth.uid() = follower_id);


-- 2. notifications table
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  actor_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  notif_type  TEXT NOT NULL,   -- 'new_post' | 'new_comment' | 'paper_comment' | 'new_follower' | 'group_announcement' | 'group_member_added'
  target_type TEXT,            -- 'post' | 'user' | 'group'
  target_id   TEXT,
  meta        JSONB DEFAULT '{}',
  read        BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX notifs_user_idx ON notifications (user_id, created_at DESC);

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notifications"
  ON notifications FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT WITH CHECK (true);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE USING (auth.uid() = user_id);


-- 3. Trigger: new post → notify all followers of the post author
CREATE OR REPLACE FUNCTION notify_followers_of_new_post()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO notifications (user_id, actor_id, notif_type, target_type, target_id, meta)
  SELECT
    f.follower_id,
    NEW.user_id,
    'new_post',
    'post',
    NEW.id::TEXT,
    jsonb_build_object('post_type', NEW.post_type)
  FROM follows f
  WHERE f.target_type = 'user'
    AND f.target_id    = NEW.user_id::TEXT
    AND f.follower_id != NEW.user_id;   -- don't notify yourself

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_new_post_notify_followers ON posts;
CREATE TRIGGER trg_new_post_notify_followers
  AFTER INSERT ON posts
  FOR EACH ROW EXECUTE FUNCTION notify_followers_of_new_post();


-- 4. Trigger: new comment → notify post author + followers of the paper
CREATE OR REPLACE FUNCTION notify_on_new_comment()
RETURNS TRIGGER AS $$
DECLARE
  p RECORD;
BEGIN
  SELECT * INTO p FROM posts WHERE id = NEW.post_id;

  -- Notify post author (unless they're the commenter)
  IF p.user_id != NEW.user_id THEN
    INSERT INTO notifications (user_id, actor_id, notif_type, target_type, target_id, meta)
    VALUES (
      p.user_id,
      NEW.user_id,
      'new_comment',
      'post',
      p.id::TEXT,
      jsonb_build_object('comment_id', NEW.id)
    );
  END IF;

  -- Notify followers of the paper (by DOI) — skip author and commenter
  IF p.post_type = 'paper' AND p.paper_doi IS NOT NULL AND p.paper_doi <> '' THEN
    INSERT INTO notifications (user_id, actor_id, notif_type, target_type, target_id, meta)
    SELECT
      f.follower_id,
      NEW.user_id,
      'paper_comment',
      'post',
      p.id::TEXT,
      jsonb_build_object('comment_id', NEW.id, 'paper_doi', p.paper_doi, 'paper_title', p.paper_title)
    FROM follows f
    WHERE f.target_type = 'paper'
      AND f.target_id    = p.paper_doi
      AND f.follower_id != NEW.user_id
      AND f.follower_id != p.user_id;   -- already handled above
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_new_comment_notify ON comments;
CREATE TRIGGER trg_new_comment_notify
  AFTER INSERT ON comments
  FOR EACH ROW EXECUTE FUNCTION notify_on_new_comment();


-- 5. Trigger: new follow on a user → notify that user
CREATE OR REPLACE FUNCTION notify_on_new_follow()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_type = 'user' AND NEW.target_id != NEW.follower_id::TEXT THEN
    INSERT INTO notifications (user_id, actor_id, notif_type, target_type, target_id, meta)
    VALUES (
      NEW.target_id::UUID,
      NEW.follower_id,
      'new_follower',
      'user',
      NEW.follower_id::TEXT,
      '{}'::JSONB
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_new_follow_notify ON follows;
CREATE TRIGGER trg_new_follow_notify
  AFTER INSERT ON follows
  FOR EACH ROW EXECUTE FUNCTION notify_on_new_follow();
