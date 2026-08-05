-- scripts/090_dostepnosc.sql
-- Faza 1 DAGOLD — nowa oś dostępności produktu, NIEZALEŻNA od show_in_orders.
--   'w_magazynie'   → dostępny od ręki (domyślny)
--   'na_zamowienie' → widoczny, ale trzeba czekać (nadal zamawialny)
-- Zastosowane przez Management API; wszystkie istniejące 205 produktów → 'w_magazynie'.

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS dostepnosc text NOT NULL DEFAULT 'w_magazynie'
  CHECK (dostepnosc IN ('w_magazynie', 'na_zamowienie'));

COMMENT ON COLUMN products.dostepnosc IS
  'Oś dostępności (niezależna od show_in_orders): w_magazynie=od ręki, na_zamowienie=z opóźnieniem.';
