-- 045_params_tavily_key.sql
-- Sprint S5C — Tavily API key migration з process.env до params table.
-- Mirror pattern dla pozostałych API keys (gemini, apify, krs, allegro):
-- single TEXT column, RLS owner-scoped, zarządzane przez Settings UI.
-- Idempotent.

ALTER TABLE params
  ADD COLUMN IF NOT EXISTS tavily_api_key TEXT;

COMMENT ON COLUMN params.tavily_api_key IS
  'Tavily Search API key (tvly-...) — wymagane dla web-search w intelligence/lookup STEP 4.5';
