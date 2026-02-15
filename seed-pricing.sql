-- Seed pricing data for OpenAI models
-- Prices are per 1M tokens (USD)
-- Run: wrangler d1 execute tokenist-db --file=./seed-pricing.sql

-- ============================================================
-- Models registry
-- ============================================================

-- GPT-5 Series
INSERT OR REPLACE INTO models (model_id, display_name, category, is_available, created_at, updated_at) VALUES
  ('gpt-5.2', 'GPT-5.2', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-5.1', 'GPT-5.1', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-5', 'GPT-5', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-5-mini', 'GPT-5 Mini', 'mini', 1, datetime('now'), datetime('now')),
  ('gpt-5-nano', 'GPT-5 Nano', 'mini', 1, datetime('now'), datetime('now')),
  ('gpt-5.2-pro', 'GPT-5.2 Pro', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-5-pro', 'GPT-5 Pro', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-5.2-codex', 'GPT-5.2 Codex', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-5.1-codex-max', 'GPT-5.1 Codex Max', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-5.1-codex', 'GPT-5.1 Codex', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-5-codex', 'GPT-5 Codex', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-5.1-codex-mini', 'GPT-5.1 Codex Mini', 'mini', 1, datetime('now'), datetime('now')),
  ('gpt-5-search-api', 'GPT-5 Search API', 'flagship', 1, datetime('now'), datetime('now'));

-- GPT-4.1 Series
INSERT OR REPLACE INTO models (model_id, display_name, category, is_available, created_at, updated_at) VALUES
  ('gpt-4.1', 'GPT-4.1', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-4.1-mini', 'GPT-4.1 Mini', 'mini', 1, datetime('now'), datetime('now')),
  ('gpt-4.1-nano', 'GPT-4.1 Nano', 'mini', 1, datetime('now'), datetime('now'));

-- GPT-4o Series
INSERT OR REPLACE INTO models (model_id, display_name, category, is_available, created_at, updated_at) VALUES
  ('gpt-4o', 'GPT-4o', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-4o-2024-05-13', 'GPT-4o (2024-05-13)', 'flagship', 1, datetime('now'), datetime('now')),
  ('gpt-4o-mini', 'GPT-4o Mini', 'mini', 1, datetime('now'), datetime('now')),
  ('gpt-4o-mini-search-preview', 'GPT-4o Mini Search Preview', 'mini', 1, datetime('now'), datetime('now')),
  ('gpt-4o-search-preview', 'GPT-4o Search Preview', 'flagship', 1, datetime('now'), datetime('now'));

-- Realtime Models
INSERT OR REPLACE INTO models (model_id, display_name, category, is_available, created_at, updated_at) VALUES
  ('gpt-realtime', 'GPT Realtime', 'realtime', 1, datetime('now'), datetime('now')),
  ('gpt-realtime-mini', 'GPT Realtime Mini', 'realtime', 1, datetime('now'), datetime('now')),
  ('gpt-4o-realtime-preview', 'GPT-4o Realtime Preview', 'realtime', 1, datetime('now'), datetime('now')),
  ('gpt-4o-mini-realtime-preview', 'GPT-4o Mini Realtime Preview', 'realtime', 1, datetime('now'), datetime('now'));

-- Audio Models
INSERT OR REPLACE INTO models (model_id, display_name, category, is_available, created_at, updated_at) VALUES
  ('gpt-audio', 'GPT Audio', 'audio', 1, datetime('now'), datetime('now')),
  ('gpt-audio-mini', 'GPT Audio Mini', 'audio', 1, datetime('now'), datetime('now')),
  ('gpt-4o-audio-preview', 'GPT-4o Audio Preview', 'audio', 1, datetime('now'), datetime('now')),
  ('gpt-4o-mini-audio-preview', 'GPT-4o Mini Audio Preview', 'audio', 1, datetime('now'), datetime('now')),
  ('gpt-4o-mini-tts', 'GPT-4o Mini TTS', 'audio', 1, datetime('now'), datetime('now'));

-- O-Series (Reasoning)
INSERT OR REPLACE INTO models (model_id, display_name, category, is_available, created_at, updated_at) VALUES
  ('o1', 'o1', 'reasoning', 1, datetime('now'), datetime('now')),
  ('o1-pro', 'o1 Pro', 'reasoning', 1, datetime('now'), datetime('now')),
  ('o1-mini', 'o1 Mini', 'reasoning', 1, datetime('now'), datetime('now')),
  ('o3-pro', 'o3 Pro', 'reasoning', 1, datetime('now'), datetime('now')),
  ('o3', 'o3', 'reasoning', 1, datetime('now'), datetime('now')),
  ('o3-deep-research', 'o3 Deep Research', 'reasoning', 1, datetime('now'), datetime('now')),
  ('o3-mini', 'o3 Mini', 'reasoning', 1, datetime('now'), datetime('now')),
  ('o4-mini', 'o4 Mini', 'reasoning', 1, datetime('now'), datetime('now')),
  ('o4-mini-deep-research', 'o4 Mini Deep Research', 'reasoning', 1, datetime('now'), datetime('now'));

-- Other / Codex
INSERT OR REPLACE INTO models (model_id, display_name, category, is_available, created_at, updated_at) VALUES
  ('codex-mini-latest', 'Codex Mini', 'other', 1, datetime('now'), datetime('now')),
  ('computer-use-preview', 'Computer Use Preview', 'other', 1, datetime('now'), datetime('now'));

-- Image Models
INSERT OR REPLACE INTO models (model_id, display_name, category, is_available, created_at, updated_at) VALUES
  ('gpt-image-1.5', 'GPT Image 1.5', 'image', 1, datetime('now'), datetime('now')),
  ('chatgpt-image-latest', 'ChatGPT Image', 'image', 1, datetime('now'), datetime('now')),
  ('gpt-image-1', 'GPT Image 1', 'image', 1, datetime('now'), datetime('now')),
  ('gpt-image-1-mini', 'GPT Image 1 Mini', 'image', 1, datetime('now'), datetime('now'));

-- Embedding Models
INSERT OR REPLACE INTO models (model_id, display_name, category, is_available, created_at, updated_at) VALUES
  ('text-embedding-3-small', 'Text Embedding 3 Small', 'embedding', 1, datetime('now'), datetime('now')),
  ('text-embedding-3-large', 'Text Embedding 3 Large', 'embedding', 1, datetime('now'), datetime('now')),
  ('text-embedding-ada-002', 'Text Embedding Ada 002', 'embedding', 1, datetime('now'), datetime('now'));

-- Legacy Models
INSERT OR REPLACE INTO models (model_id, display_name, category, is_available, created_at, updated_at) VALUES
  ('chatgpt-4o-latest', 'ChatGPT-4o Latest', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-4-turbo', 'GPT-4 Turbo', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-4-turbo-2024-04-09', 'GPT-4 Turbo (2024-04-09)', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-4-0125-preview', 'GPT-4 (0125 Preview)', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-4-1106-preview', 'GPT-4 (1106 Preview)', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-4-1106-vision-preview', 'GPT-4 Vision (1106 Preview)', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-4-0613', 'GPT-4 (0613)', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-4-0314', 'GPT-4 (0314)', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-4-32k', 'GPT-4 32K', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo', 'GPT-3.5 Turbo', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo-0125', 'GPT-3.5 Turbo (0125)', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo-1106', 'GPT-3.5 Turbo (1106)', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo-0613', 'GPT-3.5 Turbo (0613)', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-3.5-0301', 'GPT-3.5 (0301)', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo-instruct', 'GPT-3.5 Turbo Instruct', 'legacy', 1, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo-16k-0613', 'GPT-3.5 Turbo 16K (0613)', 'legacy', 1, datetime('now'), datetime('now')),
  ('davinci-002', 'Davinci 002', 'legacy', 1, datetime('now'), datetime('now')),
  ('babbage-002', 'Babbage 002', 'legacy', 1, datetime('now'), datetime('now'));

-- ============================================================
-- Model pricing (per 1M tokens, standard tier)
-- ============================================================

-- GPT-5.2
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5.2', 'text-input', 'standard', 1.75, datetime('now'), datetime('now')),
  ('gpt-5.2', 'text-output', 'standard', 14.0, datetime('now'), datetime('now')),
  ('gpt-5.2', 'cached-text-input', 'standard', 0.175, datetime('now'), datetime('now')),
  ('gpt-5.2', 'text-input', 'batch', 0.875, datetime('now'), datetime('now')),
  ('gpt-5.2', 'text-output', 'batch', 7.0, datetime('now'), datetime('now'));

-- GPT-5.1
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5.1', 'text-input', 'standard', 1.25, datetime('now'), datetime('now')),
  ('gpt-5.1', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-5.1', 'cached-text-input', 'standard', 0.125, datetime('now'), datetime('now'));

-- GPT-5
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5', 'text-input', 'standard', 1.25, datetime('now'), datetime('now')),
  ('gpt-5', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-5', 'cached-text-input', 'standard', 0.125, datetime('now'), datetime('now'));

-- GPT-5 Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5-mini', 'text-input', 'standard', 0.25, datetime('now'), datetime('now')),
  ('gpt-5-mini', 'text-output', 'standard', 2.0, datetime('now'), datetime('now')),
  ('gpt-5-mini', 'cached-text-input', 'standard', 0.025, datetime('now'), datetime('now'));

-- GPT-5 Nano
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5-nano', 'text-input', 'standard', 0.05, datetime('now'), datetime('now')),
  ('gpt-5-nano', 'text-output', 'standard', 0.4, datetime('now'), datetime('now')),
  ('gpt-5-nano', 'cached-text-input', 'standard', 0.005, datetime('now'), datetime('now'));

-- GPT-5.2 Pro
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5.2-pro', 'text-input', 'standard', 21.0, datetime('now'), datetime('now')),
  ('gpt-5.2-pro', 'text-output', 'standard', 168.0, datetime('now'), datetime('now'));

-- GPT-5 Pro
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5-pro', 'text-input', 'standard', 15.0, datetime('now'), datetime('now')),
  ('gpt-5-pro', 'text-output', 'standard', 120.0, datetime('now'), datetime('now'));

-- GPT-5.2 Codex (same as GPT-5.2)
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5.2-codex', 'text-input', 'standard', 1.75, datetime('now'), datetime('now')),
  ('gpt-5.2-codex', 'text-output', 'standard', 14.0, datetime('now'), datetime('now')),
  ('gpt-5.2-codex', 'cached-text-input', 'standard', 0.175, datetime('now'), datetime('now'));

-- GPT-5.1 Codex Max
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5.1-codex-max', 'text-input', 'standard', 1.25, datetime('now'), datetime('now')),
  ('gpt-5.1-codex-max', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-5.1-codex-max', 'cached-text-input', 'standard', 0.125, datetime('now'), datetime('now'));

-- GPT-5.1 Codex
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5.1-codex', 'text-input', 'standard', 1.25, datetime('now'), datetime('now')),
  ('gpt-5.1-codex', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-5.1-codex', 'cached-text-input', 'standard', 0.125, datetime('now'), datetime('now'));

-- GPT-5 Codex
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5-codex', 'text-input', 'standard', 1.25, datetime('now'), datetime('now')),
  ('gpt-5-codex', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-5-codex', 'cached-text-input', 'standard', 0.125, datetime('now'), datetime('now'));

-- GPT-5.1 Codex Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5.1-codex-mini', 'text-input', 'standard', 0.25, datetime('now'), datetime('now')),
  ('gpt-5.1-codex-mini', 'text-output', 'standard', 2.0, datetime('now'), datetime('now')),
  ('gpt-5.1-codex-mini', 'cached-text-input', 'standard', 0.025, datetime('now'), datetime('now'));

-- GPT-5 Search API
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-5-search-api', 'text-input', 'standard', 1.25, datetime('now'), datetime('now')),
  ('gpt-5-search-api', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-5-search-api', 'cached-text-input', 'standard', 0.125, datetime('now'), datetime('now'));

-- GPT-4.1
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4.1', 'text-input', 'standard', 2.0, datetime('now'), datetime('now')),
  ('gpt-4.1', 'text-output', 'standard', 8.0, datetime('now'), datetime('now')),
  ('gpt-4.1', 'cached-text-input', 'standard', 0.5, datetime('now'), datetime('now')),
  ('gpt-4.1', 'text-input', 'batch', 1.0, datetime('now'), datetime('now')),
  ('gpt-4.1', 'text-output', 'batch', 4.0, datetime('now'), datetime('now'));

-- GPT-4.1 Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4.1-mini', 'text-input', 'standard', 0.4, datetime('now'), datetime('now')),
  ('gpt-4.1-mini', 'text-output', 'standard', 1.6, datetime('now'), datetime('now')),
  ('gpt-4.1-mini', 'cached-text-input', 'standard', 0.1, datetime('now'), datetime('now')),
  ('gpt-4.1-mini', 'text-input', 'batch', 0.2, datetime('now'), datetime('now')),
  ('gpt-4.1-mini', 'text-output', 'batch', 0.8, datetime('now'), datetime('now'));

-- GPT-4.1 Nano
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4.1-nano', 'text-input', 'standard', 0.1, datetime('now'), datetime('now')),
  ('gpt-4.1-nano', 'text-output', 'standard', 0.4, datetime('now'), datetime('now')),
  ('gpt-4.1-nano', 'cached-text-input', 'standard', 0.025, datetime('now'), datetime('now')),
  ('gpt-4.1-nano', 'text-input', 'batch', 0.05, datetime('now'), datetime('now')),
  ('gpt-4.1-nano', 'text-output', 'batch', 0.2, datetime('now'), datetime('now'));

-- GPT-4o
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4o', 'text-input', 'standard', 2.5, datetime('now'), datetime('now')),
  ('gpt-4o', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-4o', 'cached-text-input', 'standard', 1.25, datetime('now'), datetime('now')),
  ('gpt-4o', 'text-input', 'batch', 1.25, datetime('now'), datetime('now')),
  ('gpt-4o', 'text-output', 'batch', 5.0, datetime('now'), datetime('now'));

-- GPT-4o (2024-05-13) - older snapshot with higher pricing
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4o-2024-05-13', 'text-input', 'standard', 5.0, datetime('now'), datetime('now')),
  ('gpt-4o-2024-05-13', 'text-output', 'standard', 15.0, datetime('now'), datetime('now'));

-- GPT-4o Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4o-mini', 'text-input', 'standard', 0.15, datetime('now'), datetime('now')),
  ('gpt-4o-mini', 'text-output', 'standard', 0.6, datetime('now'), datetime('now')),
  ('gpt-4o-mini', 'cached-text-input', 'standard', 0.075, datetime('now'), datetime('now')),
  ('gpt-4o-mini', 'text-input', 'batch', 0.075, datetime('now'), datetime('now')),
  ('gpt-4o-mini', 'text-output', 'batch', 0.3, datetime('now'), datetime('now'));

-- GPT-4o Mini Search Preview
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4o-mini-search-preview', 'text-input', 'standard', 0.15, datetime('now'), datetime('now')),
  ('gpt-4o-mini-search-preview', 'text-output', 'standard', 0.6, datetime('now'), datetime('now'));

-- GPT-4o Search Preview
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4o-search-preview', 'text-input', 'standard', 2.5, datetime('now'), datetime('now')),
  ('gpt-4o-search-preview', 'text-output', 'standard', 10.0, datetime('now'), datetime('now'));

-- GPT Realtime
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-realtime', 'text-input', 'standard', 4.0, datetime('now'), datetime('now')),
  ('gpt-realtime', 'text-output', 'standard', 16.0, datetime('now'), datetime('now')),
  ('gpt-realtime', 'cached-text-input', 'standard', 0.4, datetime('now'), datetime('now')),
  ('gpt-realtime', 'audio-input', 'standard', 32.0, datetime('now'), datetime('now')),
  ('gpt-realtime', 'audio-output', 'standard', 64.0, datetime('now'), datetime('now'));

-- GPT Realtime Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-realtime-mini', 'text-input', 'standard', 0.6, datetime('now'), datetime('now')),
  ('gpt-realtime-mini', 'text-output', 'standard', 2.4, datetime('now'), datetime('now')),
  ('gpt-realtime-mini', 'cached-text-input', 'standard', 0.06, datetime('now'), datetime('now')),
  ('gpt-realtime-mini', 'audio-input', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-realtime-mini', 'audio-output', 'standard', 20.0, datetime('now'), datetime('now'));

-- GPT-4o Realtime Preview
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4o-realtime-preview', 'text-input', 'standard', 5.0, datetime('now'), datetime('now')),
  ('gpt-4o-realtime-preview', 'text-output', 'standard', 20.0, datetime('now'), datetime('now')),
  ('gpt-4o-realtime-preview', 'cached-text-input', 'standard', 2.5, datetime('now'), datetime('now')),
  ('gpt-4o-realtime-preview', 'audio-input', 'standard', 100.0, datetime('now'), datetime('now')),
  ('gpt-4o-realtime-preview', 'audio-output', 'standard', 200.0, datetime('now'), datetime('now'));

-- GPT-4o Mini Realtime Preview
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4o-mini-realtime-preview', 'text-input', 'standard', 0.6, datetime('now'), datetime('now')),
  ('gpt-4o-mini-realtime-preview', 'text-output', 'standard', 2.4, datetime('now'), datetime('now')),
  ('gpt-4o-mini-realtime-preview', 'cached-text-input', 'standard', 0.3, datetime('now'), datetime('now')),
  ('gpt-4o-mini-realtime-preview', 'audio-input', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-4o-mini-realtime-preview', 'audio-output', 'standard', 20.0, datetime('now'), datetime('now'));

-- GPT Audio
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-audio', 'text-input', 'standard', 2.5, datetime('now'), datetime('now')),
  ('gpt-audio', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-audio', 'audio-input', 'standard', 32.0, datetime('now'), datetime('now')),
  ('gpt-audio', 'audio-output', 'standard', 64.0, datetime('now'), datetime('now'));

-- GPT Audio Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-audio-mini', 'text-input', 'standard', 0.6, datetime('now'), datetime('now')),
  ('gpt-audio-mini', 'text-output', 'standard', 2.4, datetime('now'), datetime('now')),
  ('gpt-audio-mini', 'audio-input', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-audio-mini', 'audio-output', 'standard', 20.0, datetime('now'), datetime('now'));

-- GPT-4o Audio Preview
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4o-audio-preview', 'text-input', 'standard', 2.5, datetime('now'), datetime('now')),
  ('gpt-4o-audio-preview', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-4o-audio-preview', 'audio-input', 'standard', 100.0, datetime('now'), datetime('now')),
  ('gpt-4o-audio-preview', 'audio-output', 'standard', 200.0, datetime('now'), datetime('now'));

-- GPT-4o Mini Audio Preview
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4o-mini-audio-preview', 'text-input', 'standard', 0.15, datetime('now'), datetime('now')),
  ('gpt-4o-mini-audio-preview', 'text-output', 'standard', 0.6, datetime('now'), datetime('now')),
  ('gpt-4o-mini-audio-preview', 'audio-input', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-4o-mini-audio-preview', 'audio-output', 'standard', 20.0, datetime('now'), datetime('now'));

-- GPT-4o Mini TTS
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4o-mini-tts', 'text-input', 'standard', 0.6, datetime('now'), datetime('now')),
  ('gpt-4o-mini-tts', 'audio-output', 'standard', 12.0, datetime('now'), datetime('now'));

-- o1
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('o1', 'text-input', 'standard', 15.0, datetime('now'), datetime('now')),
  ('o1', 'text-output', 'standard', 60.0, datetime('now'), datetime('now')),
  ('o1', 'cached-text-input', 'standard', 7.5, datetime('now'), datetime('now'));

-- o1 Pro
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('o1-pro', 'text-input', 'standard', 150.0, datetime('now'), datetime('now')),
  ('o1-pro', 'text-output', 'standard', 600.0, datetime('now'), datetime('now'));

-- o1 Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('o1-mini', 'text-input', 'standard', 1.1, datetime('now'), datetime('now')),
  ('o1-mini', 'text-output', 'standard', 4.4, datetime('now'), datetime('now')),
  ('o1-mini', 'cached-text-input', 'standard', 0.55, datetime('now'), datetime('now'));

-- o3 Pro
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('o3-pro', 'text-input', 'standard', 20.0, datetime('now'), datetime('now')),
  ('o3-pro', 'text-output', 'standard', 80.0, datetime('now'), datetime('now'));

-- o3
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('o3', 'text-input', 'standard', 2.0, datetime('now'), datetime('now')),
  ('o3', 'text-output', 'standard', 8.0, datetime('now'), datetime('now')),
  ('o3', 'cached-text-input', 'standard', 0.5, datetime('now'), datetime('now')),
  ('o3', 'text-input', 'batch', 1.0, datetime('now'), datetime('now')),
  ('o3', 'text-output', 'batch', 4.0, datetime('now'), datetime('now')),
  ('o3', 'cached-text-input', 'batch', 0.25, datetime('now'), datetime('now'));

-- o3 Deep Research
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('o3-deep-research', 'text-input', 'standard', 10.0, datetime('now'), datetime('now')),
  ('o3-deep-research', 'text-output', 'standard', 40.0, datetime('now'), datetime('now')),
  ('o3-deep-research', 'cached-text-input', 'standard', 2.5, datetime('now'), datetime('now'));

-- o3 Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('o3-mini', 'text-input', 'standard', 1.1, datetime('now'), datetime('now')),
  ('o3-mini', 'text-output', 'standard', 4.4, datetime('now'), datetime('now')),
  ('o3-mini', 'cached-text-input', 'standard', 0.55, datetime('now'), datetime('now')),
  ('o3-mini', 'text-input', 'batch', 0.55, datetime('now'), datetime('now')),
  ('o3-mini', 'text-output', 'batch', 2.2, datetime('now'), datetime('now'));

-- o4 Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('o4-mini', 'text-input', 'standard', 1.1, datetime('now'), datetime('now')),
  ('o4-mini', 'text-output', 'standard', 4.4, datetime('now'), datetime('now')),
  ('o4-mini', 'cached-text-input', 'standard', 0.275, datetime('now'), datetime('now')),
  ('o4-mini', 'text-input', 'batch', 0.55, datetime('now'), datetime('now')),
  ('o4-mini', 'text-output', 'batch', 2.2, datetime('now'), datetime('now'));

-- o4 Mini Deep Research
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('o4-mini-deep-research', 'text-input', 'standard', 2.0, datetime('now'), datetime('now')),
  ('o4-mini-deep-research', 'text-output', 'standard', 8.0, datetime('now'), datetime('now')),
  ('o4-mini-deep-research', 'cached-text-input', 'standard', 0.5, datetime('now'), datetime('now'));

-- Codex Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('codex-mini-latest', 'text-input', 'standard', 1.5, datetime('now'), datetime('now')),
  ('codex-mini-latest', 'text-output', 'standard', 6.0, datetime('now'), datetime('now')),
  ('codex-mini-latest', 'cached-text-input', 'standard', 0.375, datetime('now'), datetime('now'));

-- Computer Use Preview
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('computer-use-preview', 'text-input', 'standard', 3.0, datetime('now'), datetime('now')),
  ('computer-use-preview', 'text-output', 'standard', 12.0, datetime('now'), datetime('now'));

-- GPT Image 1.5
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-image-1.5', 'text-input', 'standard', 5.0, datetime('now'), datetime('now')),
  ('gpt-image-1.5', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-image-1.5', 'cached-text-input', 'standard', 1.25, datetime('now'), datetime('now'));

-- ChatGPT Image Latest
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('chatgpt-image-latest', 'text-input', 'standard', 5.0, datetime('now'), datetime('now')),
  ('chatgpt-image-latest', 'text-output', 'standard', 10.0, datetime('now'), datetime('now')),
  ('chatgpt-image-latest', 'cached-text-input', 'standard', 1.25, datetime('now'), datetime('now'));

-- GPT Image 1
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-image-1', 'text-input', 'standard', 5.0, datetime('now'), datetime('now')),
  ('gpt-image-1', 'cached-text-input', 'standard', 1.25, datetime('now'), datetime('now'));

-- GPT Image 1 Mini
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-image-1-mini', 'text-input', 'standard', 2.0, datetime('now'), datetime('now')),
  ('gpt-image-1-mini', 'cached-text-input', 'standard', 0.2, datetime('now'), datetime('now'));

-- Embedding Models (input tokens only)
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('text-embedding-3-small', 'text-input', 'standard', 0.02, datetime('now'), datetime('now')),
  ('text-embedding-3-small', 'text-input', 'batch', 0.01, datetime('now'), datetime('now')),
  ('text-embedding-3-large', 'text-input', 'standard', 0.13, datetime('now'), datetime('now')),
  ('text-embedding-3-large', 'text-input', 'batch', 0.065, datetime('now'), datetime('now')),
  ('text-embedding-ada-002', 'text-input', 'standard', 0.1, datetime('now'), datetime('now')),
  ('text-embedding-ada-002', 'text-input', 'batch', 0.05, datetime('now'), datetime('now'));

-- Legacy Models
INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('chatgpt-4o-latest', 'text-input', 'standard', 5.0, datetime('now'), datetime('now')),
  ('chatgpt-4o-latest', 'text-output', 'standard', 15.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4-turbo', 'text-input', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-4-turbo', 'text-output', 'standard', 30.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4-turbo-2024-04-09', 'text-input', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-4-turbo-2024-04-09', 'text-output', 'standard', 30.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4-0125-preview', 'text-input', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-4-0125-preview', 'text-output', 'standard', 30.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4-1106-preview', 'text-input', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-4-1106-preview', 'text-output', 'standard', 30.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4-1106-vision-preview', 'text-input', 'standard', 10.0, datetime('now'), datetime('now')),
  ('gpt-4-1106-vision-preview', 'text-output', 'standard', 30.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4-0613', 'text-input', 'standard', 30.0, datetime('now'), datetime('now')),
  ('gpt-4-0613', 'text-output', 'standard', 60.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4-0314', 'text-input', 'standard', 30.0, datetime('now'), datetime('now')),
  ('gpt-4-0314', 'text-output', 'standard', 60.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-4-32k', 'text-input', 'standard', 60.0, datetime('now'), datetime('now')),
  ('gpt-4-32k', 'text-output', 'standard', 120.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-3.5-turbo', 'text-input', 'standard', 0.5, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo', 'text-output', 'standard', 1.5, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-3.5-turbo-0125', 'text-input', 'standard', 0.5, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo-0125', 'text-output', 'standard', 1.5, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-3.5-turbo-1106', 'text-input', 'standard', 1.0, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo-1106', 'text-output', 'standard', 2.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-3.5-turbo-0613', 'text-input', 'standard', 1.5, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo-0613', 'text-output', 'standard', 2.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-3.5-0301', 'text-input', 'standard', 1.5, datetime('now'), datetime('now')),
  ('gpt-3.5-0301', 'text-output', 'standard', 2.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-3.5-turbo-instruct', 'text-input', 'standard', 1.5, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo-instruct', 'text-output', 'standard', 2.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('gpt-3.5-turbo-16k-0613', 'text-input', 'standard', 3.0, datetime('now'), datetime('now')),
  ('gpt-3.5-turbo-16k-0613', 'text-output', 'standard', 4.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('davinci-002', 'text-input', 'standard', 2.0, datetime('now'), datetime('now')),
  ('davinci-002', 'text-output', 'standard', 2.0, datetime('now'), datetime('now'));

INSERT OR REPLACE INTO model_pricing (model_id, token_type, processing_tier, price_per_million, created_at, updated_at) VALUES
  ('babbage-002', 'text-input', 'standard', 0.4, datetime('now'), datetime('now')),
  ('babbage-002', 'text-output', 'standard', 0.4, datetime('now'), datetime('now'));

-- ============================================================
-- Model aliases (date-suffixed and variant names → canonical model_id)
-- ============================================================

-- GPT-5 chat aliases
INSERT OR REPLACE INTO model_aliases (alias, model_id) VALUES
  ('gpt-5.2-chat-latest', 'gpt-5.2'),
  ('gpt-5.1-chat-latest', 'gpt-5.1'),
  ('gpt-5-chat-latest', 'gpt-5');

-- GPT-4o date snapshots
INSERT OR REPLACE INTO model_aliases (alias, model_id) VALUES
  ('gpt-4o-2024-08-06', 'gpt-4o'),
  ('gpt-4o-2024-11-20', 'gpt-4o');

-- GPT-4o Mini date snapshots
INSERT OR REPLACE INTO model_aliases (alias, model_id) VALUES
  ('gpt-4o-mini-2024-07-18', 'gpt-4o-mini');

-- Realtime date snapshots
INSERT OR REPLACE INTO model_aliases (alias, model_id) VALUES
  ('gpt-4o-realtime-preview-2024-10-01', 'gpt-4o-realtime-preview'),
  ('gpt-4o-realtime-preview-2024-12-17', 'gpt-4o-realtime-preview'),
  ('gpt-4o-mini-realtime-preview-2024-12-17', 'gpt-4o-mini-realtime-preview');

-- Audio date snapshots
INSERT OR REPLACE INTO model_aliases (alias, model_id) VALUES
  ('gpt-4o-audio-preview-2024-10-01', 'gpt-4o-audio-preview'),
  ('gpt-4o-audio-preview-2024-12-17', 'gpt-4o-audio-preview'),
  ('gpt-4o-mini-audio-preview-2024-12-17', 'gpt-4o-mini-audio-preview');

-- GPT-4 Turbo alias
INSERT OR REPLACE INTO model_aliases (alias, model_id) VALUES
  ('gpt-4-turbo-preview', 'gpt-4-0125-preview');

-- o1 date snapshots
INSERT OR REPLACE INTO model_aliases (alias, model_id) VALUES
  ('o1-2024-12-17', 'o1'),
  ('o1-preview', 'o1'),
  ('o1-preview-2024-09-12', 'o1'),
  ('o1-mini-2024-09-12', 'o1-mini');

-- o3 date snapshots
INSERT OR REPLACE INTO model_aliases (alias, model_id) VALUES
  ('o3-2025-04-16', 'o3'),
  ('o3-mini-2025-01-31', 'o3-mini');

-- o4 date snapshots
INSERT OR REPLACE INTO model_aliases (alias, model_id) VALUES
  ('o4-mini-2025-04-16', 'o4-mini');

-- Search preview date snapshots
INSERT OR REPLACE INTO model_aliases (alias, model_id) VALUES
  ('gpt-4o-search-preview-2025-03-11', 'gpt-4o-search-preview'),
  ('gpt-4o-mini-search-preview-2025-03-11', 'gpt-4o-mini-search-preview');
