-- 067_clients_ceidg_id.sql
-- Sprint S-CEIDG-DETAILS Day 1 (15.05.2026)
-- Wires CEIDG firma details into "Pełna re-analiza" pipeline для JDG клієнтів.
--
-- Two new columns на clients:
--   1. ceidg_id UUID — lazy cache CEIDG firma UUID. Resolved через
--      `GET /firmy?nip=...` при першому "full-analysis" run-i. Subsequent
--      runs skip search step, idą одразу до `GET /firma/{id}` для uprawnienia.
--   2. brand_aliases JSONB — discovered brand/trade names. Initially populated
--      від CEIDG uprawnienia[].opis (koncesje з brand markers like "BAR X",
--      "RESTAURACJA X"). Future expansion: GMaps title, website og:title,
--      Tavily highest-confidence brand match.
--
-- Both columns nullable (existing rows OK без backfill).
-- enrichment_log НЕ потребує source CHECK extension — already constraint-less
-- on source column (verified 15.05.2026: existing values include AI_business_analysis,
-- AI_match_rescore, AI_product_analysis, KRS_refresh — open enum).

-- ─── ceidg_id ──────────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS ceidg_id UUID;

CREATE INDEX IF NOT EXISTS idx_clients_ceidg_id
  ON clients (ceidg_id)
  WHERE ceidg_id IS NOT NULL;

COMMENT ON COLUMN clients.ceidg_id IS
  'CEIDG firma UUID — lazy populated на first JDG "Pełna re-analiza" via GET /firmy?nip=. Used by GET /firma/{id} для uprawnienia/koncesje extraction. NULL means not yet resolved (or not a JDG).';

-- ─── brand_aliases ─────────────────────────────────────────────────
ALTER TABLE clients ADD COLUMN IF NOT EXISTS brand_aliases JSONB DEFAULT '[]'::jsonb;

CREATE INDEX IF NOT EXISTS idx_clients_brand_aliases
  ON clients USING GIN (brand_aliases)
  WHERE jsonb_array_length(brand_aliases) > 0;

COMMENT ON COLUMN clients.brand_aliases IS
  'Commercial/trade names discovered from open sources. Each entry: {brand, kind, address, source}. Initial source: CEIDG koncesje (uprawnienia[].opis). Used by GMaps query fallback + AI business analysis context, де registry name ≠ public-facing brand.';
