-- 044_allegro_params.sql
-- Sprint S3 prep — Allegro REST API credentials storage в params.
-- 4 columns: client ID + client secret (user-supplied via /settings UI)
-- + cached OAuth access token + expiry (auto-managed by future
-- lib/allegro/client.ts у S3 sprint).
-- Idempotent.

ALTER TABLE params
  ADD COLUMN IF NOT EXISTS allegro_client_id        TEXT,
  ADD COLUMN IF NOT EXISTS allegro_client_secret    TEXT,
  ADD COLUMN IF NOT EXISTS allegro_access_token     TEXT,
  ADD COLUMN IF NOT EXISTS allegro_token_expires_at TIMESTAMPTZ;

COMMENT ON COLUMN params.allegro_client_id IS
  'Allegro Developer App Client ID (~32 chars)';
COMMENT ON COLUMN params.allegro_client_secret IS
  'Allegro Developer App Client Secret (~64 chars, sensitive)';
COMMENT ON COLUMN params.allegro_access_token IS
  'Cached OAuth token (auto-refreshed by lib/allegro/client.ts in S3)';
COMMENT ON COLUMN params.allegro_token_expires_at IS
  'Cached token expiry timestamp';
