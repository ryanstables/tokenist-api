-- Tokenist D1 Schema
-- Run: wrangler d1 execute tokenist-db --file=./schema.sql

-- Usage tracking per user (current period)
CREATE TABLE IF NOT EXISTS usage (
  user_id TEXT NOT NULL,
  period_key TEXT NOT NULL DEFAULT 'default',
  input_tokens INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL NOT NULL DEFAULT 0,
  last_updated TEXT NOT NULL,
  PRIMARY KEY (user_id, period_key)
);

-- Per-user usage thresholds
CREATE TABLE IF NOT EXISTS thresholds (
  user_id TEXT PRIMARY KEY,
  max_cost_usd REAL,
  max_total_tokens INTEGER
);

-- Blocked users
CREATE TABLE IF NOT EXISTS blocklist (
  user_id TEXT PRIMARY KEY,
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
  key_hash TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
CREATE INDEX IF NOT EXISTS idx_usage_user_id ON usage(user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
