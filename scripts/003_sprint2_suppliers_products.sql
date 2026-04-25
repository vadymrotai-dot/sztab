-- Sprint 2 / Phase 1 v2: extend existing suppliers schema (matches v0 export)
--
-- The suppliers table already exists from the v0 export with a richer
-- schema than the original Sprint 2 spec assumed: owner_id (FK to
-- auth.users, NOT NULL), name, nip, country, type (legacy taxonomy
-- 'producent'|'trader'|'posrednik'|'wlasna_marka'), verticals[],
-- exclusive_territory, exclusive_until, payment_terms, moq_value,
-- lead_time_days, reliability_score, notes, contract_files JSONB,
-- timestamps + an updated_at trigger.
--
-- This v2 of 003 ALTERs the existing table instead of CREATEing it,
-- and INSERTs seed rows with a non-null owner_id by reading the
-- single auth.users row at script time.
--
-- Idempotent. Safe to re-run.

-- 1. SUPPLIERS — add Sprint 2 columns to the existing v0 table.
--    Legacy 'type' (producent/trader/...) stays as taxonomy of WHAT
--    they make. New 'deal_type' is HOW Vadym transacts with them
--    (reseller / agent / partner) and drives DealModal logic.
ALTER TABLE suppliers
  ADD COLUMN IF NOT EXISTS legal_name TEXT,
  ADD COLUMN IF NOT EXISTS deal_type TEXT CHECK (
    deal_type IN ('reseller', 'agent', 'partner')
  ),
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS exclusivity_scope TEXT[];

CREATE INDEX IF NOT EXISTS idx_suppliers_deal_type ON suppliers(deal_type);

-- 2. PRODUCTS v2 — gramatura/EAN per SKU + 5 CM tiers + cost split.
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

-- 3. DEALS v2 — link to supplier + capture commission economics.
ALTER TABLE deals
  ADD COLUMN IF NOT EXISTS supplier_id UUID REFERENCES suppliers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS deal_type TEXT CHECK (deal_type IN ('reseller', 'agent')),
  ADD COLUMN IF NOT EXISTS commission_pct NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS commission_income_pln NUMERIC(10,2);
CREATE INDEX IF NOT EXISTS idx_deals_supplier_id ON deals(supplier_id);

-- 4. SUPPLIERS SEED — five known counterparties for Vadym.
--    owner_id is NOT NULL on the v0 schema, so we resolve it from
--    auth.users at script time. The script aborts loudly if there is
--    no user yet (sign up first, then re-run).
DO $$
DECLARE
  current_user_id UUID;
BEGIN
  SELECT id INTO current_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'No row in auth.users — sign up to Sztab first, then re-run this seed.';
  END IF;

  INSERT INTO suppliers (
    owner_id, name, legal_name, type, deal_type, commission_pct, notes
  )
  SELECT
    current_user_id,
    v.name,
    v.legal_name,
    v.legacy_type,
    v.deal_type,
    v.commission_pct,
    v.notes
  FROM (VALUES
    ('Czudowa Marka',
     'Czudowa Marka Sp. z o.o.',
     'producent',
     'reseller',
     NULL::numeric,
     'Główny dostawca kiszonek/surówek/buraków. Vadym kupuje i sprzedaje. 34 SKU.'),
    ('Mod-loszka',
     'Mod-loszka (TR/Lwów)',
     'producent',
     'reseller',
     NULL::numeric,
     'Med w lyzce. Vadym jako importer.'),
    ('Karol',
     'Karol (wendliny)',
     'producent',
     'agent',
     NULL::numeric,
     'Wendliny. Umowa nie podpisana - commission_pct placeholder.'),
    ('Gmurczyk',
     'Gmurczyk (slodyczy)',
     'producent',
     'agent',
     NULL::numeric,
     'Slodyczy. Umowa nie podpisana - commission_pct placeholder.'),
    ('Pikniko',
     'Pikniko Sp. z o.o.',
     'trader',
     'partner',
     NULL::numeric,
     'Bidirectional partner. Pelna logika kanalow = Sprint 2.5.')
  ) AS v(name, legal_name, legacy_type, deal_type, commission_pct, notes)
  WHERE NOT EXISTS (
    SELECT 1 FROM suppliers s
    WHERE s.name = v.name AND s.owner_id = current_user_id
  );
END $$;
