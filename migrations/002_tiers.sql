-- Migration 002: Premium account tiers
-- Run on existing databases:
--   Local:  wrangler d1 execute tokenist-db --local --file=./migrations/002_tiers.sql
--   Remote: wrangler d1 execute tokenist-db --remote --file=./migrations/002_tiers.sql

-- Add tier column to existing users (all existing users default to 'free')
-- NOTE: If you get "duplicate column name: tier", the column is already present — skip this line.
ALTER TABLE users ADD COLUMN tier TEXT NOT NULL DEFAULT 'free';

CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);

-- Monthly request count tracking per org (for tier quota enforcement)
CREATE TABLE IF NOT EXISTS tier_usage (
  org_id TEXT NOT NULL,
  period_key TEXT NOT NULL,  -- 'YYYY-MM' format
  request_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, period_key)
);
