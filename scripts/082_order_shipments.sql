-- ============================================================
-- 082_order_shipments.sql
-- Sprint 3C-2 (03.06.2026)
--
-- Przesyłki Apaczka per zamówienie (lub per punkt dostawy przy osobne).
-- NIE przechowujemy PDF etykiety — pobieramy z getWaybill(apaczka_order_id)
-- na żądanie.
--
-- RLS: Option B (jak order_documents/order_delivery_points z 078) —
--      RLS enabled, BEZ policy → dostęp tylko service-role (API route).
--
-- CASCADE / SET NULL:
--   orders → order_shipments (ON DELETE CASCADE — usuń zamówienie, znikają przesyłki)
--   order_delivery_points → order_shipments.delivery_point_id (ON DELETE SET NULL —
--     realna przesyłka Apaczka (waybill, koszt, tracking) to fakt: rekord shipment
--     ZOSTAJE dla audytu nawet po usunięciu punktu, tylko link się zeruje)
-- ============================================================

CREATE TABLE IF NOT EXISTS order_shipments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- NULL = wspólna wysyłka całości | NOT NULL = przesyłka per punkt (osobne).
  -- ON DELETE SET NULL — shipment zostaje dla audytu po usunięciu punktu.
  delivery_point_id UUID REFERENCES order_delivery_points(id) ON DELETE SET NULL,
  -- Apaczka tracking.
  apaczka_order_id TEXT,                 -- id zlecenia w Apaczka (getWaybill/tracking)
  service_id INTEGER,                    -- serwis Apaczka (np. 21 = DPD Kurier)
  service_name TEXT,
  waybill_number TEXT,                   -- numer listu przewozowego
  tracking_url TEXT,
  -- Koszty w GROSZACH (Apaczka zwraca w groszach) — integer, bez błędów float.
  koszt_netto INTEGER,
  koszt_brutto INTEGER,
  -- Parametry wpisane przez operatora.
  weight NUMERIC(6, 1),                  -- kg (max 99999.9)
  shipment_type TEXT,                    -- 'PACZKA' | 'paleta' (wybór operatora)
  status TEXT NOT NULL DEFAULT 'created',-- stan przesyłki
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── Indeksy ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_order_shipments_order_id
  ON order_shipments(order_id);
CREATE INDEX IF NOT EXISTS idx_order_shipments_delivery_point
  ON order_shipments(delivery_point_id)
  WHERE delivery_point_id IS NOT NULL;

-- ─── Komentarze ────────────────────────────────────────────────────
COMMENT ON TABLE order_shipments IS
  E'Przesyłki Apaczka (3C-2). 1:N z orders. delivery_point_id NULL = wspólna wysyłka całości, NOT NULL = per punkt (osobne). ON DELETE SET NULL — shipment zostaje dla audytu po usunięciu punktu. PDF etykiety NIE przechowujemy — getWaybill(apaczka_order_id) na żądanie. RLS enabled (Option B — service-role only, mirror order_documents/078).';
COMMENT ON COLUMN order_shipments.apaczka_order_id IS
  'ID zlecenia w Apaczka — klucz do getWaybill() i trackingu.';
COMMENT ON COLUMN order_shipments.koszt_netto IS
  'Koszt netto w GROSZACH (Apaczka zwraca w groszach). 1234 = 12,34 zł.';
COMMENT ON COLUMN order_shipments.koszt_brutto IS
  'Koszt brutto w GROSZACH.';
COMMENT ON COLUMN order_shipments.shipment_type IS
  'Typ wybrany przez operatora: PACZKA | paleta.';
COMMENT ON COLUMN order_shipments.status IS
  'Stan przesyłki. Default created. Bez CHECK — vocabulary statusów Apaczka do ustalenia (dodamy constraint gdy znane).';

-- ─── RLS (Option B — service-role only, BEZ policy) ────────────────
ALTER TABLE order_shipments ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- END 082
-- ============================================================
