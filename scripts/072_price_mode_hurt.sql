-- ============================================================
-- 072_price_mode_hurt.sql
-- Sprint S-CENNIK-WH.2 (26.05.2026)
--
-- Expand cennik feature: add price_mode column (auto|minimum) +
-- price_hurt_wh entry-tier для wielki_hurt + auto matrix cell.
--
-- Matrix 2x2 (cennik × mode):
--   standard + auto    → calcTier() iterate maly/sredni/duzy (CURRENT, unchanged)
--   standard + minimum → locked price_duzy (NEW)
--   wielki_hurt + auto → 10k threshold: <10k Hurt, >=10k Wielki Hurt (NEW)
--   wielki_hurt + min  → locked price_duzi_gracze (CURRENT z S-CENNIK-WH.1)
--
-- Backward compat:
--   Existing standard orders (15) → default 'auto' (no behavior change)
--   Existing wielki_hurt orders (1) → UPDATE до 'minimum' (locked WH, behavior z WH.1)
--
-- All атомарно у jednej migration file (single transaction via Management API).
-- ============================================================

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS price_mode TEXT NOT NULL DEFAULT 'auto';

-- Backward-compat backfill: existing wielki_hurt orders ran як "locked WH" w S-CENNIK-WH.1.
-- Aby zachować behavior, mark їх explicitly як 'minimum'.
UPDATE orders SET price_mode = 'minimum'
  WHERE cennik_tier = 'wielki_hurt' AND price_mode = 'auto';

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS price_hurt_wh NUMERIC;

COMMENT ON COLUMN orders.price_mode IS
  'Price mode: auto (threshold/iterate) | minimum (locked). Combined з cennik_tier daje matrix 2x2.';

COMMENT ON COLUMN products.price_hurt_wh IS
  'Entry-tier price дla wielki_hurt + auto poniżej 10k zł threshold. Above 10k → price_duzi_gracze. NULL if SKU not available w WH offering.';

-- Partial index — most orders pozostaną 'auto', WHERE clause keeps index small
CREATE INDEX IF NOT EXISTS orders_price_mode_idx
  ON orders(price_mode) WHERE price_mode != 'auto';

-- ============================================================
-- END 072
-- ============================================================
