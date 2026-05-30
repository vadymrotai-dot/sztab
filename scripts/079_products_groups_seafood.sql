-- ============================================================
-- 079_products_groups_seafood.sql
-- Sprint T-ORDER.4a-DB (30.05.2026)
--
-- A) ALTER products — dodaje 3 kolumny:
--      grupa     'czudowa_marka' | 'owoce_morza'
--      podgrupa  'kiszonki' | 'surowki' | 'warzywa_gotowane'
--                'kalmary' | 'filety_rybne'
--      in_stock  BOOLEAN dostępność (FALSE = chwilowo brak)
--
-- B) UPDATE istniejących 17 SKU ЧМ — grupa+podgrupa wg mapy category→podgrupa
--    (potwierdzona przez Vadyma w STEP 0).
--
-- C) INSERT 15 owoców morza (9 kalmary + 6 filety_rybne) jako szkice:
--      show_in_orders = FALSE (placeholder dopóki nie ma cen klienta)
--      wszystkie price_* = 0 (placeholder)
--      vat_rate = default 0.05 (z products schema, scripts/005)
--      unit = 'szt', gramatura = '1 kg', category = podgrupa
--      owner_id = ten sam co istniejące SKU (subquery)
--      order_form_sort = MAX(order_form_sort) + 1, +2, ... +15
--      in_stock — per lista Vadyma
--
-- NON-GOALS:
--   - NIE ruszamy cen ани logiki tier (price_* zostaje, dla seafood placeholder 0)
--   - NIE ruszamy orders/order_items
--   - ZERO UI
-- ============================================================

-- ─── A) ALTER products — 3 nowe kolumny ─────────────────────────────
ALTER TABLE products
  ADD COLUMN IF NOT EXISTS grupa TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS podgrupa TEXT;

ALTER TABLE products
  ADD COLUMN IF NOT EXISTS in_stock BOOLEAN NOT NULL DEFAULT TRUE;

COMMENT ON COLUMN products.grupa IS
  'Sprint T-ORDER.4a-DB (30.05.2026) — top-level grupa w formie zamówienia: czudowa_marka | owoce_morza. NULL dla legacy SKU które nie weszły do formy.';
COMMENT ON COLUMN products.podgrupa IS
  'Sprint T-ORDER.4a-DB — podgrupa wewnątrz grupy. ЧМ: kiszonki | surowki | warzywa_gotowane. Owoce morza: kalmary | filety_rybne. NULL gdy grupa NULL.';
COMMENT ON COLUMN products.in_stock IS
  'Sprint T-ORDER.4a-DB — dostępność produktu. TRUE = na stanie, FALSE = chwilowo brak (UI pokazuje wygaszony). Niezależne od show_in_orders (które decyduje czy SKU w ogóle widać w formie).';

-- ─── B) UPDATE 17 istniejących ЧМ — przypisanie grupa+podgrupa ─────
-- Mapa potwierdzona w STEP 0 audit:
--   kiszonki_kapusty + kiszonki_dodatki + ogorki_kiszone + pomidory → kiszonki (8 SKU)
--   surowki_marynowane + surowka_marchew + salatki_gotowe       → surowki (8 SKU)
--   buraki_clean_label                                          → warzywa_gotowane (1 SKU)

UPDATE products SET grupa = 'czudowa_marka', podgrupa = 'kiszonki'
  WHERE category IN ('kiszonki_kapusty', 'kiszonki_dodatki', 'ogorki_kiszone', 'pomidory');

UPDATE products SET grupa = 'czudowa_marka', podgrupa = 'surowki'
  WHERE category IN ('surowki_marynowane', 'surowka_marchew', 'salatki_gotowe');

UPDATE products SET grupa = 'czudowa_marka', podgrupa = 'warzywa_gotowane'
  WHERE category = 'buraki_clean_label';

-- ─── C) INSERT 15 owoców morza ──────────────────────────────────────
-- Pattern: CTE params resolves owner_id + max_sort raz, potem VALUES list
-- z 15 SKU. order_form_sort = max_sort + idx.
--
-- Wszystkie price_* explicit = 0 (placeholder, klient nie widzi bo
-- show_in_orders=FALSE). price_hurt_wh + price_min NIE są wymieniane —
-- zostają NULL (default z schemy 003).
--
-- vat_rate NIE wymieniany — default 0.05 z scripts/005.
-- brand NULL — Vadym uzupełni potem (nazwa nowego brandu owoców morza).

WITH params AS (
  SELECT
    (SELECT owner_id FROM products WHERE show_in_orders = TRUE LIMIT 1) AS owner,
    (SELECT COALESCE(MAX(order_form_sort), 0) FROM products) AS max_sort
),
seafood_list (idx, podgrupa, name_pl, in_stock_flag) AS (
  VALUES
    -- ── KALMARY (9 SKU) ────────────────────────────────────────────
    (1, 'kalmary', 'Kalmary suszone, rozdrobnione', TRUE),
    (2, 'kalmary', 'Kalmary suszone, solone, paski', FALSE),
    (3, 'kalmary', 'Kalmary czerwone suszone, rozdrobnione', FALSE),
    (4, 'kalmary', 'Suszony filet z kalmara o smaku kraba, krojony', TRUE),
    (5, 'kalmary', 'Skrzydła kalmara z chili w kawałkach', TRUE),
    (6, 'kalmary', 'Kalmary suszone, w paskach (skrzydła)', FALSE),
    (7, 'kalmary', 'Kalmary suszone, filety (skrzydła)', TRUE),
    (8, 'kalmary', 'Kalmary suszone, rozdrobnione z chili i sezamem', TRUE),
    (9, 'kalmary', 'Kalmary suszone, ośmiornica (kółka)', FALSE),
    -- ── FILETY RYBNE (6 SKU) ──────────────────────────────────────
    (10, 'filety_rybne', 'Suszony błękitek w plastrach bez skóry, solony', TRUE),
    (11, 'filety_rybne', 'Suszony błękitek w plastrach bez skóry, solony z chili', TRUE),
    (12, 'filety_rybne', 'Suszony błękitek w kawałkach, solony z chili', TRUE),
    (13, 'filety_rybne', 'Paski suszonego, solonego błękitka', FALSE),
    (14, 'filety_rybne', 'Paski suszonego, solonego błękitka z chili', TRUE),
    (15, 'filety_rybne', 'Karaś żółtosmugi, suszony, solony', FALSE)
)
INSERT INTO products (
  name, display_name, owner_id,
  grupa, podgrupa, category,
  gramatura, unit, in_stock,
  show_in_orders, order_form_sort,
  price_maly_opt, price_sredni, price_duzy, price_duzi_gracze
)
SELECT
  s.name_pl,
  s.name_pl,
  p.owner,
  'owoce_morza',
  s.podgrupa,
  s.podgrupa,           -- category = podgrupa dla spójności (wg planu Vadyma)
  '1 kg',
  'szt',
  s.in_stock_flag,
  FALSE,                -- show_in_orders — szkic, klient jeszcze nie widzi
  p.max_sort + s.idx,
  0, 0, 0, 0            -- price_* placeholder (klient nie widzi bo show_in_orders=FALSE)
FROM params p, seafood_list s;

-- ============================================================
-- END 079
-- ============================================================
