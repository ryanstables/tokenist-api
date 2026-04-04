-- Migration 003: Add conversation lifecycle table
-- Run: wrangler d1 execute tokenist-db --file=./migrations/003_conversations.sql

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  end_user_id TEXT NOT NULL,
  org_id TEXT,
  end_user_email TEXT,
  end_user_name TEXT,
  model TEXT NOT NULL,
  feature TEXT,
  status TEXT NOT NULL DEFAULT 'active',  -- 'active' | 'ended'
  started_at TEXT NOT NULL,
  ended_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_conversations_end_user_id ON conversations(end_user_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org_id ON conversations(org_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);
