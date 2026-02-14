-- Tokenist D1 Schema
-- Run: wrangler d1 execute tokenist-db --file=./schema.sql

-- Usage tracking per end user (current period)
CREATE TABLE IF NOT EXISTS usage (
  end_user_id TEXT NOT NULL,
  period_key TEXT NOT NULL DEFAULT 'default',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL,
  PRIMARY KEY (end_user_id, period_key)
);

-- Per-end-user usage thresholds
CREATE TABLE IF NOT EXISTS thresholds (
  end_user_id TEXT PRIMARY KEY,
  max_cost_usd REAL,
  max_total_tokens INTEGER
);

-- Blocked end users
CREATE TABLE IF NOT EXISTS blocklist (
  end_user_id TEXT PRIMARY KEY,
  reason TEXT,
  blocked_at TEXT NOT NULL,
  expires_at TEXT
);

-- User accounts
CREATE TABLE IF NOT EXISTS users (
  user_id TEXT PRIMARY KEY,
  org_id TEXT,
  email TEXT UNIQUE,
  password_hash TEXT,
  display_name TEXT,
  threshold_max_cost_usd REAL,
  threshold_max_total_tokens INTEGER,
  usage_window TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- API keys
CREATE TABLE IF NOT EXISTS api_keys (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  -- Legacy column name retained; stores full key for new keys.
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_usage_end_user_id ON usage(end_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- Request/response logs
CREATE TABLE IF NOT EXISTS request_logs (
  id TEXT PRIMARY KEY,
  end_user_id TEXT NOT NULL,
  org_id TEXT,
  end_user_email TEXT,
  end_user_name TEXT,
  conversation_id TEXT NOT NULL,
  model TEXT NOT NULL,
  request_body TEXT NOT NULL,
  response_body TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  latency_ms REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_logs_end_user_id ON request_logs(end_user_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_org_id ON request_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_conversation_id ON request_logs(conversation_id);
