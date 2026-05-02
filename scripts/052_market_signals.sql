-- Sprint S-INTEL.1.2.1 — market_signals table (skeleton).
-- Derived signals з commodity_prices — generated weekly Sunday cron AFTER
-- price ingestion (separate step у app/api/cron/market-intelligence).
--
-- Skeleton у 1.2.1 — actual signal generators (lib/intelligence/signals.ts)
-- ship у S-INTEL.1.2.3.
--
-- Used by AI re-score (Protocol 15 Layer 2) для market context коли S6B
-- product analysis pipeline активований.

CREATE TABLE IF NOT EXISTS market_signals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cn_code TEXT,
  signal_type TEXT NOT NULL CHECK (
    signal_type IN ('price_trend', 'volatility', 'seasonality', 'shortage', 'spread')
  ),
  direction TEXT CHECK (
    direction IS NULL OR direction IN ('up', 'down', 'stable')
  ),
  magnitude NUMERIC(8,4),
  period_days INT NOT NULL,
  detected_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  observation_period_end DATE NOT NULL,
  description_pl TEXT,
  confidence NUMERIC(3,2)
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1)),
  source_count INT,
  category TEXT NOT NULL DEFAULT 'food',
  raw_data JSONB
);

CREATE INDEX IF NOT EXISTS market_signals_cn_code_idx
  ON market_signals(cn_code) WHERE cn_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS market_signals_detected_at_idx
  ON market_signals(detected_at DESC);
CREATE INDEX IF NOT EXISTS market_signals_signal_type_idx
  ON market_signals(signal_type);

ALTER TABLE market_signals ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "market_signals_authenticated_read" ON market_signals
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "market_signals_service_write" ON market_signals
    FOR ALL TO service_role USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE market_signals IS
  'Derived signals з commodity_prices — price trends, volatility, seasonality, shortages, spreads. Generated weekly cron job AFTER ingestion. SKELETON у S-INTEL.1.2.1; signal generators ship у S-INTEL.1.2.3 (lib/intelligence/signals.ts). Used by AI re-score (Protocol 15 Layer 2) для market context.';
COMMENT ON COLUMN market_signals.signal_type IS
  'price_trend = directional move SMA-based; volatility = stddev/mean ratio; seasonality = recurring pattern ACF-light; shortage = unusually low supply (relative deviation); spread = wholesale vs retail gap.';
COMMENT ON COLUMN market_signals.magnitude IS
  'NUMERIC e.g. 0.15 = 15% change. Sign carried у direction column для readability.';
COMMENT ON COLUMN market_signals.period_days IS
  'Window length у days (typically 7 / 30 / 90).';
COMMENT ON COLUMN market_signals.confidence IS
  '0..1 — алгоритмічний confidence (sample size, fit quality). Вище = більше довіряти.';
COMMENT ON COLUMN market_signals.source_count IS
  'Скільки rows commodity_prices агрегувалося у signal generation. Менше N → менше confidence.';
