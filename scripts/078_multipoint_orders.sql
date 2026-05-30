-- ============================================================
-- 078_multipoint_orders.sql
-- Sprint T-ORDER.3 (30.05.2026)
--
-- Multipoint orders — zamówienie może mieć kilka punktów dostawy,
-- pozycje przypisane do punktu (lub wspólne), dokumenty osobno albo
-- wspólne dla całości, zapisane punkty klienta + szablony zamówień.
--
-- TYLKO baza: schema + RLS. ZERO UI/code. Następny sprint = UI wiring.
--
-- Decyzje (z STEP 0 audit + plan):
--   - delivery_mode 'jeden' (default, back-compat) | 'kilka'
--   - documents_mode 'wspolna' (default, 1 proforma + 1 VAT na całość) | 'osobne'
--   - order_items.delivery_point_id NULL = legacy / wspólne
--   - order_items.qty zostaje INTEGER + unit_snapshot TEXT DEFAULT 'szt'
--     (jednostka frozen przy submit — przygotowanie pod przyszłe 'kg')
--   - client_delivery_points: lat/lng dla geokodowania Google Maps (NULL OK)
--   - source_branch_id → company_branches (041) opcjonalnie (jeśli z GUS)
--   - order_templates.utworzyl: klient (sam zapisał z formy) lub vadym (przygotował dla klienta)
--   - RLS: order_delivery_points + order_documents → service-role only (068 Option B)
--          client_delivery_points + order_templates → auth.uid()=owner_id (076 pattern)
--
-- CASCADE chain dla DELETE order:
--   orders → order_items (CASCADE z 068)
--   orders → order_delivery_points (CASCADE — tutaj)
--   orders → order_documents (CASCADE — tutaj)
--   order_delivery_points → order_documents.delivery_point_id (CASCADE — tutaj)
--   order_delivery_points → order_items.delivery_point_id (CASCADE — tutaj)
--   client_delivery_points → order_delivery_points.client_delivery_point_id (SET NULL —
--                            historyczny punkt zostaje, link się zerwie)
--   company_branches → client_delivery_points.source_branch_id (SET NULL)
-- ============================================================

-- ─── A) ALTER orders — flagi trybu ─────────────────────────────────
ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS delivery_mode TEXT NOT NULL DEFAULT 'jeden';

-- CHECK osobno (jeśli kolumna istniała wcześniej bez constraintu).
ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_delivery_mode_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_delivery_mode_check
  CHECK (delivery_mode IN ('jeden', 'kilka'));

ALTER TABLE orders
  ADD COLUMN IF NOT EXISTS documents_mode TEXT NOT NULL DEFAULT 'wspolna';

ALTER TABLE orders DROP CONSTRAINT IF EXISTS orders_documents_mode_check;
ALTER TABLE orders
  ADD CONSTRAINT orders_documents_mode_check
  CHECK (documents_mode IN ('wspolna', 'osobne'));

COMMENT ON COLUMN orders.delivery_mode IS
  'jeden = jeden punkt dostawy (legacy + back-compat, wszystkie istniejące orders) | kilka = N punktów (T-ORDER.3).';
COMMENT ON COLUMN orders.documents_mode IS
  'wspolna = 1 proforma + 1 VAT na całe zamówienie (legacy + back-compat) | osobne = osobne dokumenty per punkt dostawy.';

-- ─── B) order_delivery_points ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS order_delivery_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  label TEXT,                              -- opcjonalna nazwa punktu (np. "Magazyn główny")
  -- Strukturyzowany adres — niezbędny dla geokodowania, kuriera, faktur.
  ulica TEXT,
  kod_pocztowy TEXT,
  miasto TEXT,
  typ TEXT NOT NULL DEFAULT 'dostawa' CHECK (typ IN ('dostawa', 'odbior')),
  -- Termin: 'najblizszy' = ASAP (klient akceptuje jak najszybciej) |
  -- 'data' = konkretna data wpisana w preferred_date.
  termin_typ TEXT NOT NULL DEFAULT 'najblizszy' CHECK (termin_typ IN ('najblizszy', 'data')),
  preferred_date DATE,
  odbiorca_imie TEXT,
  odbiorca_telefon TEXT,
  -- FK na client_delivery_points dodany NIŻEJ (po stworzeniu tabeli klienta) —
  -- na razie zwykła kolumna UUID NULL. Jeśli order utworzony bez saved point,
  -- zostaje NULL (klient wpisał ad-hoc).
  client_delivery_point_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_odp_order_id
  ON order_delivery_points(order_id);

COMMENT ON TABLE order_delivery_points IS
  'Punkty dostawy zamówienia (1:N z orders). Sprint T-ORDER.3. Dla delivery_mode=jeden — 0 lub 1 row (legacy ma delivery_address na orders). Dla kilka — N rows.';
COMMENT ON COLUMN order_delivery_points.termin_typ IS
  'najblizszy = ASAP | data = konkretna w preferred_date.';
COMMENT ON COLUMN order_delivery_points.client_delivery_point_id IS
  'Opcjonalne łącze do zapisanego punktu klienta (client_delivery_points). NULL = ad-hoc.';

-- ─── C) ALTER order_items — przypisanie do punktu + jednostka ─────
ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS delivery_point_id UUID
    REFERENCES order_delivery_points(id) ON DELETE CASCADE;

ALTER TABLE order_items
  ADD COLUMN IF NOT EXISTS unit_snapshot TEXT DEFAULT 'szt';

CREATE INDEX IF NOT EXISTS idx_order_items_delivery_point
  ON order_items(delivery_point_id)
  WHERE delivery_point_id IS NOT NULL;

COMMENT ON COLUMN order_items.delivery_point_id IS
  'Przypisanie pozycji do punktu dostawy (T-ORDER.3). NULL = wspólne / legacy (jeden punkt na orders.delivery_address). CASCADE z punktu.';
COMMENT ON COLUMN order_items.unit_snapshot IS
  'Jednostka frozen przy submit (T-ORDER.3). Domyślnie szt — na razie wszystko w sztukach. Przygotowanie pod przyszłe kg/g.';

-- ─── D) client_delivery_points ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS client_delivery_points (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nazwa TEXT NOT NULL,                     -- "Magazyn Poznań", "Sklep Wrocław"
  ulica TEXT,
  kod_pocztowy TEXT,
  miasto TEXT,
  -- Geokodowanie Google Maps (lazy fill — może być NULL na start).
  lat NUMERIC(10, 7),
  lng NUMERIC(10, 7),
  typ_punktu TEXT DEFAULT 'sklep' CHECK (typ_punktu IN ('sklep', 'magazyn')),
  odbiorca_imie TEXT,
  odbiorca_telefon TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  -- Opcjonalne źródło — gdy punkt został skopiowany z GUS oddziаł.
  source_branch_id UUID REFERENCES company_branches(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cdp_client_id
  ON client_delivery_points(client_id);
CREATE INDEX IF NOT EXISTS idx_cdp_owner_id
  ON client_delivery_points(owner_id);

COMMENT ON TABLE client_delivery_points IS
  'Zapisane punkty dostawy klienta (T-ORDER.3). Per-klient list re-usable w przyszłych zamówieniach. RLS auth.uid()=owner_id.';
COMMENT ON COLUMN client_delivery_points.is_active IS
  'FALSE = ukryty z listy (nie usuwamy, żeby historyczne order_delivery_points nie traciły linku przez SET NULL).';
COMMENT ON COLUMN client_delivery_points.source_branch_id IS
  'Opcjonalny pointer do company_branches (041) gdy punkt skopiowany z GUS oddziаł.';

-- ─── E) FK constraint order_delivery_points → client_delivery_points
-- Teraz gdy obie tabele istnieją, dodajemy FK.
ALTER TABLE order_delivery_points
  ADD CONSTRAINT fk_odp_client_point
  FOREIGN KEY (client_delivery_point_id)
  REFERENCES client_delivery_points(id) ON DELETE SET NULL;

-- ─── F) order_documents — proforma/VAT per-order lub per-point ────
CREATE TABLE IF NOT EXISTS order_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  -- NULL = dokument na całe zamówienie (wspólny dla documents_mode='wspolna').
  -- NOT NULL = dokument na konkretny punkt (documents_mode='osobne').
  delivery_point_id UUID REFERENCES order_delivery_points(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('proforma', 'vat')),
  scope TEXT NOT NULL DEFAULT 'order' CHECK (scope IN ('order', 'point')),
  -- Fakturownia tracking (paralel do orders.proforma_*/vat_* dla legacy).
  fakturownia_id BIGINT,
  fakturownia_number TEXT,
  pdf_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_documents_order_id
  ON order_documents(order_id);

COMMENT ON TABLE order_documents IS
  'Dokumenty zamówienia (T-ORDER.3) — proforma/VAT w nowym modelu wielopunktowym. Wspólne (delivery_point_id NULL, scope=order) lub osobne (NOT NULL, scope=point). Stare orders.proforma_*/vat_* kolumny zostają dla back-compat (legacy single-doc orders).';
COMMENT ON COLUMN order_documents.scope IS
  'order = dokument na całość (jeden na zamówienie, delivery_point_id NULL) | point = dokument per-punkt.';

-- ─── G) order_templates — szablony zamówień ───────────────────────
CREATE TABLE IF NOT EXISTS order_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  nazwa TEXT NOT NULL,
  -- Kto utworzył: 'klient' = z istniejącej formy "Zapisz jako szablon" |
  -- 'vadym' = admin przygotował dla klienta z panelu.
  utworzyl TEXT NOT NULL DEFAULT 'klient'
    CHECK (utworzyl IN ('klient', 'vadym')),
  -- JSONB lista pozycji: [{product_id: uuid, qty: int}, ...]
  -- Nie zamrażamy ceny / nazwy — szablon jest dla qty, w momencie użycia
  -- aktualne ceny/snapshot z products. Jeśli product zniknie z bazy, UI
  -- skip-uje go z ostrzeżeniem.
  pozycje JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_order_templates_client_id
  ON order_templates(client_id);

COMMENT ON TABLE order_templates IS
  'Szablony zamówień klienta (T-ORDER.3). Zapisane listy pozycji dla szybkiego ponownego użycia. RLS auth.uid()=owner_id.';
COMMENT ON COLUMN order_templates.pozycje IS
  'JSONB tablica [{product_id, qty}]. Bez zamrożonych cen — przy użyciu szablonu UI pobiera aktualne snapshot z products.';

-- ─── H) RLS ─────────────────────────────────────────────────────────
-- Tier 1: service-role only (jak orders/068 Option B — public dostęp tylko
-- przez API route z access_token validation).
ALTER TABLE order_delivery_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_documents ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE order_delivery_points IS
  E'Punkty dostawy zamówienia (1:N z orders). Sprint T-ORDER.3. RLS enabled (Option B — service-role only access). Public reads via API route + access_token validation (mirror orders/069).';
COMMENT ON TABLE order_documents IS
  E'Dokumenty zamówienia (T-ORDER.3). RLS enabled (Option B — service-role only). Stare orders.proforma_*/vat_* kolumny zostają dla back-compat.';

-- Tier 2: auth.uid()=owner_id (jak client_notes/076 — client-owned tables).
ALTER TABLE client_delivery_points ENABLE ROW LEVEL SECURITY;
ALTER TABLE order_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY cdp_owner_all ON client_delivery_points
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE POLICY otpl_owner_all ON order_templates
  FOR ALL
  TO authenticated
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

-- ============================================================
-- END 078
-- ============================================================
