-- Sprint 2 / Phase 1: Suppliers + Products v2 + Deals v2
--
-- Idempotent. Safe to run on a DB where some columns from this set
-- already exist (e.g. supplier_id was added on deals/products in
-- Sprint 1's v2 ALTER) — IF NOT EXISTS skips those.
--
-- Note: ADD COLUMN IF NOT EXISTS does NOT add foreign key constraints
-- after the fact. If supplier_id existed without a FK, this script
-- won't add the FK; check pg_constraint before relying on cascading.

-- 1. SUPPLIERS
CREATE TABLE IF NOT EXISTS suppliers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  legal_name TEXT,
  nip TEXT,
  country TEXT DEFAULT 'PL',
  deal_type TEXT NOT NULL CHECK (deal_type IN ('reseller', 'agent', 'partner')),
  commission_pct NUMERIC(5,2),
  exclusivity_scope TEXT[],
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_suppliers_deal_type ON suppliers(deal_type);

-- 2. PRODUCTS v2 розширення
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS cost_eur NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS cost_pln NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS gramatura TEXT,
  ADD COLUMN IF NOT EXISTS ean TEXT,
  ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT 'szt',
  ADD COLUMN IF NOT EXISTS is_hero BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS seasonality_status TEXT CHECK (
    seasonality_status IN ('available', 'low_stock', 'out_of_stock', 'seasonal')
  ),
  ADD COLUMN IF NOT EXISTS shelf_life_days INTEGER,
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS price_maly_opt NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_sredni NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_duzy NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_duzi_gracze NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS price_min NUMERIC(10,2);
CREATE INDEX IF NOT EXISTS idx_products_supplier_id ON products(supplier_id);
CREATE INDEX IF NOT EXISTS idx_products_ean ON products(ean);
CREATE INDEX IF NOT EXISTS idx_products_seasonality_status ON products(seasonality_status);

-- 3. DEALS v2
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_type TEXT CHECK (deal_type IN ('reseller', 'agent')),
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS commission_income_pln NUMERIC(10,2);
CREATE INDEX IF NOT EXISTS idx_deals_supplier_id ON deals(supplier_id);

-- 4. SUPPLIERS SEED
INSERT INTO suppliers (name, legal_name, deal_type, commission_pct, notes) VALUES
  ('Czudowa Marka', 'Czudowa Marka Sp. z o.o.', 'reseller', NULL,
   'Główny dostawca kiszonek/surówek/buraków. Vadym kupuje i sprzedaje. 34 SKU.'),
  ('Mod-loszka', 'Mod-loszka (TR/Lwów)', 'reseller', NULL,
   'Med w lyzce. Vadym jako importer.'),
  ('Karol', 'Karol (wendliny)', 'agent', NULL,
   'Wendliny. Umowa nie podpisana - commission_pct placeholder.'),
  ('Gmurczyk', 'Gmurczyk (slodyczy)', 'agent', NULL,
   'Slodyczy. Umowa nie podpisana - commission_pct placeholder.'),
  ('Pikniko', 'Pikniko Sp. z o.o.', 'partner', NULL,
   'Bidirectional partner. Pelna logika kanalow = Sprint 2.5.')
ON CONFLICT DO NOTHING;
