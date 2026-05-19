-- ============================================================
-- 070_fakturownia_notification.sql
-- Sprint S-ORDER.2.A.1 (19.05.2026)
--
-- Adds:
--   1. Fakturownia tracking columns to `orders` (proforma + VAT invoice IDs)
--   2. `notification_log` audit table для email/sms/whatsapp/telegram
--
-- Proforma → створюється на submit (status='submitted').
-- VAT fakture → створюється на shipped (status='shipped').
-- Notification log — RLS Option B (enabled, no policies, service-role only).
-- ============================================================

-- ── 1. Fakturownia tracking columns ──────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS proforma_fakturownia_id BIGINT,
  ADD COLUMN IF NOT EXISTS proforma_fakturownia_number TEXT,
  ADD COLUMN IF NOT EXISTS proforma_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS proforma_created_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS vat_fakturownia_id BIGINT,
  ADD COLUMN IF NOT EXISTS vat_fakturownia_number TEXT,
  ADD COLUMN IF NOT EXISTS vat_pdf_url TEXT,
  ADD COLUMN IF NOT EXISTS vat_created_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_orders_proforma_fakturownia_id
  ON orders(proforma_fakturownia_id)
  WHERE proforma_fakturownia_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_orders_vat_fakturownia_id
  ON orders(vat_fakturownia_id)
  WHERE vat_fakturownia_id IS NOT NULL;

COMMENT ON COLUMN orders.proforma_fakturownia_id IS 'Fakturownia internal invoice ID for proforma created on submit';
COMMENT ON COLUMN orders.proforma_fakturownia_number IS 'Human-readable proforma number assigned by Fakturownia';
COMMENT ON COLUMN orders.proforma_pdf_url IS 'Public PDF URL від Fakturownia для proforma';
COMMENT ON COLUMN orders.vat_fakturownia_id IS 'Fakturownia internal invoice ID for VAT invoice created on shipped';
COMMENT ON COLUMN orders.vat_fakturownia_number IS 'Human-readable VAT invoice number';
COMMENT ON COLUMN orders.vat_pdf_url IS 'Public PDF URL від Fakturownia для VAT invoice';

-- ── 2. notification_log audit table ──────────────────────────
CREATE TABLE IF NOT EXISTS notification_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Context
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  client_id UUID REFERENCES clients(id) ON DELETE SET NULL,

  -- Channel + recipient
  channel TEXT NOT NULL CHECK (channel IN ('email', 'sms', 'whatsapp', 'telegram')),
  recipient TEXT NOT NULL,

  -- Template + payload
  template TEXT NOT NULL,
  subject TEXT,
  payload_summary TEXT,

  -- Status tracking
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'sent', 'failed', 'bounced', 'opened', 'clicked')),
  provider_id TEXT,
  provider_response JSONB,
  error_message TEXT,

  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  sent_at TIMESTAMPTZ,
  delivered_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_notification_log_order_id
  ON notification_log(order_id)
  WHERE order_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_log_client_id
  ON notification_log(client_id)
  WHERE client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notification_log_status_created
  ON notification_log(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_log_channel_template
  ON notification_log(channel, template);

-- RLS Option B (enabled + zero policies = anon denied, service-role bypasses)
ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE notification_log IS
  'Audit log of all client notifications across channels (email/sms/whatsapp/telegram). Service-role only via RLS Option B.';

-- ============================================================
-- END 070
-- ============================================================
