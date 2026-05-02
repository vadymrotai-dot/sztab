-- Sprint S-INTEL.1.2.1 (post-ship FIX 2) — fix UNIQUE INDEX matching for
-- PostgREST upsert.
--
-- Issue: migration 051 створила expression-based UNIQUE INDEX:
--   ON commodity_prices(source, COALESCE(market, ''), product_label, observation_date)
--
-- PostgREST upsert з onConflict='source,market,product_label,observation_date'
-- НЕ matches expression index → error 42P10:
--   "there is no unique or exclusion constraint matching the ON CONFLICT
--   specification"
--
-- Verified live 02.05.2026 під час manual trigger ZSRIR ingest на dataset
-- 1024 (mleko).
--
-- Solution: replace expression index з 2 partial indices —
--  - WHERE market IS NOT NULL → matches (source, market, product_label, date)
--  - WHERE market IS NULL → matches (source, product_label, date)
--
-- Code (lib/intelligence/zsrir.ts) updates onConflict choice based на
-- market presence у inserted rows. For ZSRIR specifically all rows have
-- market=NULL (national aggregate), тому use no-market onConflict.

DROP INDEX IF EXISTS commodity_prices_uniq_observation;

CREATE UNIQUE INDEX IF NOT EXISTS commodity_prices_uniq_with_market
  ON commodity_prices(source, market, product_label, observation_date)
  WHERE market IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS commodity_prices_uniq_no_market
  ON commodity_prices(source, product_label, observation_date)
  WHERE market IS NULL;

COMMENT ON INDEX commodity_prices_uniq_with_market IS
  'Partial UNIQUE для rows з market specified (fresh-market.pl, EU per-MS). PostgREST onConflict: source,market,product_label,observation_date.';
COMMENT ON INDEX commodity_prices_uniq_no_market IS
  'Partial UNIQUE для rows з market=NULL (ZSRIR national aggregate, EU avg). PostgREST onConflict: source,product_label,observation_date.';
