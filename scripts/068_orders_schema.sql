-- Sprint S-ORDER.1.A (19.05.2026) — orders + order_items + products extension
-- Web-форма замовлень для клієнтів cohort UC_HURT_WARZYWA_OWOCE (Czudowа Marka).
--
-- Scope:
--   1. ALTER products: +display_name, +show_in_orders, +order_form_sort
--   2. CREATE orders + order_items tables з access_token-based public access
--   3. CREATE order_number generator (ZIO-YYYY-NNNN)
--
-- RLS configuration defer до S-ORDER.1.B (public form anon SELECT/INSERT
-- policies коли API route ready). For now — service-role only.

-- ── 1. products table extension ──────────────────────────────────────────────
ALTER TABLE products ADD COLUMN IF NOT EXISTS display_name TEXT;
ALTER TABLE products ADD COLUMN IF NOT EXISTS show_in_orders BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE products ADD COLUMN IF NOT EXISTS order_form_sort INTEGER;

CREATE INDEX IF NOT EXISTS idx_products_show_in_orders
  ON products(show_in_orders) WHERE show_in_orders = TRUE;

COMMENT ON COLUMN products.display_name IS
  'Short user-facing name for client cennik/form. NULL → fallback to products.name.';
COMMENT ON COLUMN products.show_in_orders IS
  'Visible in public client order form /zamowienie/[token]. Set TRUE for 17 SKU cennik v9.';
COMMENT ON COLUMN products.order_form_sort IS
  'Display order in client form (1-17). NULL skipped.';

-- ── 2. orders table ──────────────────────────────────────────────────────────
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id),
  cohort_id UUID REFERENCES cohorts(id),
  order_number TEXT NOT NULL UNIQUE,

  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft','submitted','confirmed','in_realization','shipped','invoiced','cancelled'
  )),

  -- Submitter contact (filled by client при submission)
  contact_person TEXT,
  contact_phone TEXT,
  contact_email TEXT,

  -- Delivery details
  delivery_address TEXT,
  preferred_delivery_date DATE,

  -- Notes
  customer_notes TEXT,
  internal_notes TEXT,

  -- Pricing snapshot
  tier_at_submit TEXT CHECK (tier_at_submit IN ('maly','sredni','duzy')),
  total_net NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_vat NUMERIC(10,2) NOT NULL DEFAULT 0,
  total_brutto NUMERIC(10,2) NOT NULL DEFAULT 0,
  vat_rate NUMERIC(5,4) NOT NULL DEFAULT 0.05,

  -- Timestamps
  link_opened_at TIMESTAMPTZ,
  submitted_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by_user_id UUID
);

CREATE INDEX idx_orders_client_id ON orders(client_id);
CREATE INDEX idx_orders_cohort_id ON orders(cohort_id);
CREATE INDEX idx_orders_status ON orders(status);
CREATE INDEX idx_orders_access_token ON orders(access_token);

COMMENT ON TABLE orders IS
  'Client orders submitted via public /zamowienie/[token] form. S-ORDER.1.A.';
COMMENT ON COLUMN orders.access_token IS
  'Unique UUID embedded in public link. Used to load order draft + identify client. Revocable per row.';
COMMENT ON COLUMN orders.tier_at_submit IS
  'Price tier client saw at submission (maly/sredni/duzy). Stored для audit + bonus calculations.';

-- ── 3. order_items table ─────────────────────────────────────────────────────
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id UUID NOT NULL REFERENCES products(id),

  -- Snapshots — frozen at submit time (do not change retroactively)
  product_name_snapshot TEXT NOT NULL,
  gramatura_snapshot TEXT,

  qty INTEGER NOT NULL CHECK (qty > 0),
  unit_price NUMERIC(10,2) NOT NULL CHECK (unit_price >= 0),
  line_total NUMERIC(10,2) NOT NULL CHECK (line_total >= 0),

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_order_items_order_id ON order_items(order_id);
CREATE INDEX idx_order_items_product_id ON order_items(product_id);

COMMENT ON TABLE order_items IS
  'Order line items. Snapshots name+gramatura+price at submit (do not change retroactively).';

-- ── 4. order_number sequence + helper ────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS orders_seq START 1;

CREATE OR REPLACE FUNCTION generate_order_number() RETURNS TEXT AS $$
BEGIN
  RETURN 'ZIO-' || TO_CHAR(NOW(), 'YYYY') || '-' || LPAD(nextval('orders_seq')::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION generate_order_number() IS
  'Generate order_number у формат ZIO-YYYY-NNNN. Sequence shared across years.';
