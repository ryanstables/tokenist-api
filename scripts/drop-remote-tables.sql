-- Drop all Tokenist D1 tables (remote only – use when resetting to re-apply schema).
-- Run: wrangler d1 execute tokenist-db --remote --file=./scripts/drop-remote-tables.sql
-- Then: wrangler d1 execute tokenist-db --remote --file=./schema.sql

DROP TABLE IF EXISTS model_aliases;
DROP TABLE IF EXISTS model_pricing;
DROP TABLE IF EXISTS models;
DROP TABLE IF EXISTS request_logs;
DROP TABLE IF EXISTS api_keys;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS blocklist;
DROP TABLE IF EXISTS thresholds;
DROP TABLE IF EXISTS usage;
