-- ============================================================
-- 071_cennik_tier.sql
-- Sprint S-CENNIK-WH.1 (26.05.2026)
--
-- Adds orders.cennik_tier — locked at offer-send time.
-- Values:
--   'standard'    — existing 3-tier auto (maly/sredni/duzy via calcTier)
--   'wielki_hurt' — single locked tier (price_duzi_gracze, no calcTier)
--
-- Backward compat: existing orders get DEFAULT 'standard' (no logic change).
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS cennik_tier TEXT NOT NULL DEFAULT 'standard';

COMMENT ON COLUMN orders.cennik_tier IS
  'Cennik tier locked at offer-send time: standard (3-tier auto) | wielki_hurt (single locked tier).';

-- Partial index — most orders will be 'standard', WHERE clause keeps index small
CREATE INDEX IF NOT EXISTS orders_cennik_tier_idx
  ON orders(cennik_tier)
  WHERE cennik_tier != 'standard';

-- ============================================================
-- END 071
-- ============================================================
