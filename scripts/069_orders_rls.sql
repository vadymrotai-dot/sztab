-- Sprint S-ORDER.1.B.1 (19.05.2026)
-- Enable RLS on orders/order_items + reset sequence
-- Per Decision Option B — service-role bypasses, anon-key fully denied
-- (no policies = deny by default).

ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_items ENABLE ROW LEVEL SECURITY;

-- Reset sequence — 2 numbers consumed by S-ORDER.1.B audit test (19.05.2026).
-- First real submission буде ZIO-2026-0001.
ALTER SEQUENCE orders_seq RESTART WITH 1;

COMMENT ON TABLE orders IS
  'Client orders. RLS enabled (Option B) — service-role only access. Public reads via API route + access_token validation.';
COMMENT ON TABLE order_items IS
  'Order line items. RLS enabled (Option B) — service-role only access.';
