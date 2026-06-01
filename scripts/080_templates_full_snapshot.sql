-- ============================================================
-- 080_templates_full_snapshot.sql
-- Przejście 1A (T-ORDER.5) — BACKEND systemu zamówień
--
-- Rozszerzenie order_templates o pełny snapshot zamówienia:
-- nie tylko produkty (pozycje), ale też tryb dostawy, tryb dokumentów,
-- punkty dostawy i wspólny termin. Dzięki temu szablon (i "Powtórz
-- zamówienie") odtwarza CAŁOŚĆ, nie tylko koszyk.
--
-- TYLKO baza: ADD COLUMN IF NOT EXISTS (idempotent). ZERO zmian danych.
-- Stare szablony (078) bez tych pól → defaulty zapewniają back-compat:
--   delivery_mode='jeden', documents_mode='wspolna', delivery_points='[]'.
--
-- Decyzje (z STEP 0 audit Przejście 1A):
--   - delivery_mode / documents_mode — mirror orders (078 §A), te same CHECK.
--   - delivery_points JSONB — snapshot punktów w kształcie payloadu submit
--     (DeliveryPointSchema): [{label,ulica,kod_pocztowy,miasto,typ,termin_typ,
--     preferred_date,odbiorca_imie,odbiorca_telefon,delivery_point_index?}].
--     Bez zamrażania cen — przy użyciu UI pobiera świeże snapshot z products
--     (jak pozycje, 078 §G).
--   - wspolna_data / wspolny_termin_typ / wspolny_preferred_date — gdy klient
--     ustawia jeden wspólny termin dla całego zamówienia (zamiast per-punkt).
--   - pozycje JSONB zostaje BEZ ZMIAN (078 §G).
--   - RLS bez zmian — order_templates ma już otpl_owner_all (078 §H).
-- ============================================================

-- ─── Tryby (mirror orders.delivery_mode / documents_mode z 078) ────
ALTER TABLE order_templates
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'jeden';

ALTER TABLE order_templates DROP CONSTRAINT IF EXISTS order_templates_delivery_mode_check;
ALTER TABLE order_templates
  ADD CONSTRAINT order_templates_delivery_mode_check
  CHECK (delivery_mode IN ('jeden', 'kilka'));

ALTER TABLE order_templates
  ADD COLUMN IF NOT EXISTS documents_mode TEXT NOT NULL DEFAULT 'wspolna';

ALTER TABLE order_templates DROP CONSTRAINT IF EXISTS order_templates_documents_mode_check;
ALTER TABLE order_templates
  ADD CONSTRAINT order_templates_documents_mode_check
  CHECK (documents_mode IN ('wspolna', 'osobne'));

-- ─── Snapshot punktów dostawy (kształt jak payload submit) ─────────
ALTER TABLE order_templates
  ADD COLUMN IF NOT EXISTS delivery_points JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ─── Wspólny termin (gdy jeden termin dla całości, nie per-punkt) ──
ALTER TABLE order_templates
  ADD COLUMN IF NOT EXISTS wspolna_data BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE order_templates
  ADD COLUMN IF NOT EXISTS wspolny_termin_typ TEXT;

ALTER TABLE order_templates DROP CONSTRAINT IF EXISTS order_templates_wspolny_termin_typ_check;
ALTER TABLE order_templates
  ADD CONSTRAINT order_templates_wspolny_termin_typ_check
  CHECK (wspolny_termin_typ IS NULL OR wspolny_termin_typ IN ('najblizszy', 'data'));

ALTER TABLE order_templates
  ADD COLUMN IF NOT EXISTS wspolny_preferred_date DATE;

-- ─── Komentarze ────────────────────────────────────────────────────
COMMENT ON COLUMN order_templates.delivery_mode IS
  'jeden = jeden punkt (legacy + back-compat) | kilka = N punktów. Mirror orders.delivery_mode (078).';
COMMENT ON COLUMN order_templates.documents_mode IS
  'wspolna = 1 proforma + 1 VAT na całość | osobne = per-punkt. Mirror orders.documents_mode (078).';
COMMENT ON COLUMN order_templates.delivery_points IS
  'JSONB snapshot punktów dostawy w kształcie payloadu submit (DeliveryPointSchema). Bez zamrożonych cen. Stare szablony (078) = [].';
COMMENT ON COLUMN order_templates.wspolna_data IS
  'TRUE = jeden wspólny termin dla całego zamówienia (wspolny_termin_typ/wspolny_preferred_date) zamiast per-punkt.';
COMMENT ON COLUMN order_templates.wspolny_termin_typ IS
  'najblizszy = ASAP | data = wspolny_preferred_date. NULL gdy wspolna_data=FALSE (termin per-punkt).';

-- ============================================================
-- END 080
-- ============================================================
