-- Sprint S-INTEL.1.2.1 — commodity_prices table.
-- External wholesale + commodity prices з ZSRIR (dane.gov.pl), fresh-market.pl,
-- EU Agri-food (agridata.ec.europa.eu). Bridge до products через cn_code.
--
-- Decisions locked Vadym 02.05.2026:
--  - food-first з category column ready-for-extension
--  - PL primary market (ZSRIR), EU benchmarks, retail wholesale (fresh-market.pl)
--  - Sunday 06:00 UTC weekly cron (after matching-refresh)
--  - Service-role write через cron job; authenticated read
--  - cn_code NULLABLE — "intake first, map later" (commodity_to_cn_map bridge)
--
-- Idempotency: UNIQUE INDEX на (source, market, product_label, observation_date) —
-- ON CONFLICT DO NOTHING при re-run. Re-run safe.

CREATE TABLE IF NOT EXISTS commodity_prices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cn_code TEXT,
  source TEXT NOT NULL CHECK (
    source IN ('zsrir', 'fresh_market_pl', 'eu_agri', 'manual')
  ),
  market TEXT,
  product_label TEXT NOT NULL,
  price_pln NUMERIC(10,2),
  price_eur NUMERIC(10,2),
  currency_native TEXT NOT NULL CHECK (currency_native IN ('PLN', 'EUR')),
  unit TEXT NOT NULL,
  observation_date DATE NOT NULL,
  category TEXT NOT NULL DEFAULT 'food',
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS commodity_prices_cn_code_idx
  ON commodity_prices(cn_code) WHERE cn_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS commodity_prices_observation_date_idx
  ON commodity_prices(observation_date DESC);
CREATE INDEX IF NOT EXISTS commodity_prices_source_market_idx
  ON commodity_prices(source, market, observation_date DESC);
CREATE INDEX IF NOT EXISTS commodity_prices_category_idx
  ON commodity_prices(category);

-- Idempotency guard. COALESCE для market — щоб NULL і empty string були equal.
CREATE UNIQUE INDEX IF NOT EXISTS commodity_prices_uniq_observation
  ON commodity_prices(source, COALESCE(market, ''), product_label, observation_date);

ALTER TABLE commodity_prices ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "commodity_prices_authenticated_read" ON commodity_prices
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "commodity_prices_service_write" ON commodity_prices
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE commodity_prices IS
  'External wholesale + commodity prices (ZSRIR / fresh-market.pl / EU Agri-food). Bridge до products через cn_code. Populated via Sunday cron (app/api/cron/market-intelligence) + on-demand. cn_code NULLABLE дозволяє "intake first, map later" — commodity_to_cn_map bridge resolves source labels post-hoc.';
COMMENT ON COLUMN commodity_prices.cn_code IS
  'NULLABLE bridge до products.cn_code. NULL коли source row category не direct match (e.g. ZSRIR "kapusta biała" → потрібен mapping table до 20059990).';
COMMENT ON COLUMN commodity_prices.source IS
  'zsrir = dane.gov.pl ZSRIR datasets, fresh_market_pl = scraped wholesale markets, eu_agri = agridata.ec.europa.eu observatories, manual = Vadym manual entry.';
COMMENT ON COLUMN commodity_prices.market IS
  'Specific market когда source має multiple markets (Bronisze, WGRO Poznań, EU avg, PL national). NULL допустимий коли single-source data.';
COMMENT ON COLUMN commodity_prices.product_label IS
  'Raw label з source (e.g. "Kapusta biała głowiasta"). Не нормалізується. Bridge до CN через commodity_to_cn_map.';
COMMENT ON COLUMN commodity_prices.unit IS
  'Нормалізована unit: kg / ton / 100kg / liter / piece. Conversion happens at ingestion time.';
COMMENT ON COLUMN commodity_prices.category IS
  'Decision Framework 02.05.2026 ready-for-extension. category=food для Phase 1.';
COMMENT ON COLUMN commodity_prices.raw_payload IS
  'JSONB original source row для debug + post-mortem без re-fetch (sheet_name, row_index, raw_cells).';
