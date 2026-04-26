-- Phase 3: multi-product deals via deal_items child table.
-- deals=0 у production, тому hard DROP single-product колонок безпечний.
-- Idempotent.

-- 1. deal_items child table
CREATE TABLE IF NOT EXISTS deal_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deals(id) ON DELETE CASCADE,
  product_id UUID REFERENCES products(id) ON DELETE SET NULL,
  product_name_snapshot TEXT,
  product_gramatura_snapshot TEXT,
  product_ean_snapshot TEXT,
  quantity NUMERIC(10,2) NOT NULL CHECK (quantity > 0),
  unit TEXT DEFAULT 'szt',
  unit_price_buy NUMERIC(10,2),
  unit_price_sell NUMERIC(10,2) NOT NULL CHECK (unit_price_sell >= 0),
  unit_price_override BOOLEAN DEFAULT false,
  line_total NUMERIC(12,2) GENERATED ALWAYS AS (quantity * unit_price_sell) STORED,
  line_margin_pln NUMERIC(12,2),
  line_margin_pct NUMERIC(5,2),
  vat_rate NUMERIC(4,3) DEFAULT 0.05,
  notes TEXT,
  position INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deal_items_deal_id_idx ON deal_items(deal_id);
CREATE INDEX IF NOT EXISTS deal_items_product_id_idx ON deal_items(product_id);

ALTER TABLE deal_items ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "deal_items_owner_access" ON deal_items
    FOR ALL TO authenticated
    USING (deal_id IN (SELECT id FROM deals WHERE owner_id = auth.uid()))
    WITH CHECK (deal_id IN (SELECT id FROM deals WHERE owner_id = auth.uid()));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. DROP single-product колонок з deals (deals=0, безпечно)
ALTER TABLE deals
  DROP COLUMN IF EXISTS product_id,
  DROP COLUMN IF EXISTS quantity,
  DROP COLUMN IF EXISTS unit,
  DROP COLUMN IF EXISTS unit_price_buy,
  DROP COLUMN IF EXISTS unit_price_sell,
  DROP COLUMN IF EXISTS margin_amount,
  DROP COLUMN IF EXISTS margin_pct;

-- 3. total_value тепер обчислюється як SUM(deal_items.line_total). Оновимо comment.
COMMENT ON COLUMN deals.total_value IS 'Sum of all deal_items.line_total. Updated via trigger on deal_items insert/update/delete.';

-- 4. Trigger: автоматично пересчитує deals.total_value при змінах deal_items
CREATE OR REPLACE FUNCTION recompute_deal_total()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE deals
  SET total_value = (
    SELECT COALESCE(SUM(line_total), 0) FROM deal_items WHERE deal_id = COALESCE(NEW.deal_id, OLD.deal_id)
  ),
  updated_at = now()
  WHERE id = COALESCE(NEW.deal_id, OLD.deal_id);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS deal_items_recompute_total ON deal_items;
CREATE TRIGGER deal_items_recompute_total
AFTER INSERT OR UPDATE OR DELETE ON deal_items
FOR EACH ROW EXECUTE FUNCTION recompute_deal_total();

-- 5. deal_type CHECK fix: додаємо 'partner'
ALTER TABLE deals DROP CONSTRAINT IF EXISTS deals_deal_type_check;
ALTER TABLE deals ADD CONSTRAINT deals_deal_type_check
  CHECK (deal_type IS NULL OR deal_type IN ('reseller', 'agent', 'partner'));

-- 6. Auto-seed testing strategic partner client
DO $$
DECLARE
  current_user_id UUID;
BEGIN
  SELECT id INTO current_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF current_user_id IS NULL THEN
    RAISE NOTICE 'Skipping strategic partner seed — no auth.users.';
    RETURN;
  END IF;

  INSERT INTO clients (
    title, nip, client_type,
    contracted_margin_katalog_pct, contracted_margin_docel_pct,
    owner_id, segment, status, notes
  )
  SELECT
    'Test Strategic Partner Sp. z o.o.',
    '0000000000',
    'strategic_partner',
    0.32,
    0.23,
    current_user_id,
    'duzi_gracze',
    'aktywny',
    'Auto-seeded для тестування DealModal v2 strategic partner logic. Видали коли підпишеш реального duzi gracze.'
  WHERE NOT EXISTS (
    SELECT 1 FROM clients WHERE nip = '0000000000' AND owner_id = current_user_id
  );
END $$;
