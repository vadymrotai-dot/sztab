-- 089_price_segments.sql
-- Faza 1 DAGOLD — nowy model ceny: marża bazowa per produkt + segmenty cenowe A/B/C
-- + indywidualna zniżka per klient.
--
-- Cena dla klienta = segmentA_price(produkt) × (1 − znizka)
--   segmentA_price = cost_pln / (1 − products.marza_bazowa_pct)   [fallback: globalna marża z settings, gdy NULL]
--   znizka = clients.znizka_indywidualna_pct
--            ?? price_segments.znizka_pct (po clients.price_segment_code)
--            ?? 0  (segment A, bez obniżki)
--
-- UWAGA — deprecate-in-place:
--   Stare kolumny cenowe products.price_maly_opt / price_sredni / price_duzy /
--   price_duzi_gracze / price_hurt_wh ORAZ matryca lib/orders/tier-config.ts
--   NIE są kasowane. Nowy price-path przestaje je czytać; zostają jako fallback
--   (gdy marza_bazowa_pct = NULL) i dla starego order-flow do czasu pełnej migracji.
--   Stare clients.contracted_margin_katalog_pct / docel_pct — również nietknięte,
--   nieużywane w nowym flow.
--   clients.segment (maly/sredni/duzy/niesklasyfikowany) to INNA oś (rozmiar biznesu),
--   celowo NIE ruszana — nowe pole to price_segment_code.
--
-- Idempotent. Aplikuje Vadym ręcznie w Supabase Dashboard (SQL Editor).

-- 1. Tabela segmentów cenowych (edytowalna przez pracownika w /ustawienia/segmenty-cenowe)
CREATE TABLE IF NOT EXISTS price_segments (
  code       TEXT PRIMARY KEY,
  name       TEXT NOT NULL,
  znizka_pct NUMERIC(5,4) NOT NULL DEFAULT 0,   -- ułamek: 0.10 = 10% zniżki od ceny segmentu A
  sort_order INT  NOT NULL DEFAULT 0
);

-- 2. Klient: przypisanie segmentu + indywidualna zniżka (nadpisuje segment)
ALTER TABLE clients
  ADD COLUMN IF NOT EXISTS price_segment_code TEXT REFERENCES price_segments(code),
  ADD COLUMN IF NOT EXISTS znizka_indywidualna_pct NUMERIC(5,4);

-- 3. Produkt: marża bazowa per produkt (baza ceny segmentu A)
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS marza_bazowa_pct NUMERIC(5,4);  -- ułamek: 0.35 = 35%

-- 4. Domyślne 3 segmenty — znizka_pct=0 na start (Vadym uzupełni realne % w KROK D).
--    Segment A = cena bazowa referencyjna (zawsze 0% zniżki).
INSERT INTO price_segments (code, name, znizka_pct, sort_order) VALUES
  ('A', 'Segment A — cena bazowa', 0, 1),
  ('B', 'Segment B',               0, 2),
  ('C', 'Segment C',               0, 3)
ON CONFLICT (code) DO NOTHING;

-- 5. RLS — panel wewnętrzny, dostęp dla authenticated (jak fba_prospects i in.)
ALTER TABLE price_segments ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "price_segments_authenticated_all" ON price_segments
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE price_segments IS
  'Segmenty cenowe A/B/C — zniżka % od ceny segmentu A. Edytowalne w /ustawienia/segmenty-cenowe. INNA oś niż clients.segment (rozmiar biznesu).';
COMMENT ON COLUMN clients.price_segment_code IS
  'Przypisany segment cenowy (FK price_segments). NULL → segment A (0% zniżki).';
COMMENT ON COLUMN clients.znizka_indywidualna_pct IS
  'Indywidualna zniżka klienta (ułamek). Gdy ustawiona — nadpisuje znizka_pct segmentu.';
COMMENT ON COLUMN products.marza_bazowa_pct IS
  'Marża bazowa per produkt (ułamek). Baza ceny segmentu A = cost_pln/(1-marza). NULL → fallback na globalną marżę z settings.';
