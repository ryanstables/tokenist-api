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
  key_hash TEXT NOT NULL UNIQUE,
  key_hint TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL
);
-- Migration: ALTER TABLE api_keys ADD COLUMN key_hint TEXT NOT NULL DEFAULT '';

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
  feature TEXT,
  request_body TEXT NOT NULL,
  response_body TEXT,
  status TEXT NOT NULL DEFAULT 'success',
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  total_tokens INTEGER,
  -- Granular input token breakdown
  cached_input_tokens INTEGER,
  text_input_tokens INTEGER,
  audio_input_tokens INTEGER,
  image_input_tokens INTEGER,
  -- Granular output token breakdown
  text_output_tokens INTEGER,
  audio_output_tokens INTEGER,
  reasoning_tokens INTEGER,
  -- Per-request cost
  cost_usd REAL,
  latency_ms REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_request_logs_end_user_id ON request_logs(end_user_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_org_id ON request_logs(org_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_created_at ON request_logs(created_at);
CREATE INDEX IF NOT EXISTS idx_request_logs_conversation_id ON request_logs(conversation_id);
CREATE INDEX IF NOT EXISTS idx_request_logs_feature ON request_logs(feature);

-- Model registry
CREATE TABLE IF NOT EXISTS models (
  model_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL, -- 'flagship', 'mini', 'reasoning', 'realtime', 'audio', 'image', 'embedding', 'legacy', 'other'
  is_available INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Per-token-type pricing for each model
CREATE TABLE IF NOT EXISTS model_pricing (
  model_id TEXT NOT NULL,
  token_type TEXT NOT NULL, -- 'text-input', 'text-output', 'cached-text-input', 'audio-input', 'audio-output'
  processing_tier TEXT NOT NULL DEFAULT 'standard', -- 'standard', 'batch', 'flex', 'priority'
  price_per_million REAL NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (model_id, token_type, processing_tier),
  FOREIGN KEY (model_id) REFERENCES models(model_id)
);

CREATE INDEX IF NOT EXISTS idx_model_pricing_model_id ON model_pricing(model_id);

-- Aliases map date-suffixed or variant model IDs to their canonical model_id
CREATE TABLE IF NOT EXISTS model_aliases (
  alias TEXT PRIMARY KEY,
  model_id TEXT NOT NULL,
  FOREIGN KEY (model_id) REFERENCES models(model_id)
);

CREATE INDEX IF NOT EXISTS idx_model_aliases_model_id ON model_aliases(model_id);
