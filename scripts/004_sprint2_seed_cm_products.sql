-- ============================================================
-- Sprint 2 / Phase 2: Czudowa Marka seed — 34 SKU
--   Source: Ziomek_Fish_Cennik_B2B_PL.xlsx
--           + Ziomek_Fish_KALKULATOR_WEWNETRZNY.xlsx
--   New schema: cost_eur/cost_pln/gramatura/price_maly_opt/...
--   Idempotent: per-row WHERE NOT EXISTS check by ean + owner_id.
--                Re-running this script after a partial run inserts
--                only the missing SKUs.
--
-- Hero (push_tier=1) per Vadym's spec: Surówka tradycyjna (all sizes),
-- Surówka "Kapusta z burakami", Surówka z marchwi po koreańsku,
-- Sałatka z bakłażana, Kapusta kiszona z papryką słodką (fuzzy match
-- for "Surówka z kapusty z papryką"). Other 22 SKUs = push_tier=2.
--
-- Seasonality: Ogórki kiszone + Pomidory* = out_of_stock. Rest = available.
-- vat_rate not provided — DB default 0.05 applies.
-- ============================================================

DO $$
DECLARE
  current_user_id UUID;
  cm_id UUID;
  inserted_count INT;
BEGIN
  SELECT id INTO current_user_id FROM auth.users ORDER BY created_at LIMIT 1;
  IF current_user_id IS NULL THEN
    RAISE EXCEPTION 'No row in auth.users — sign up to Sztab first.';
  END IF;

  SELECT id INTO cm_id FROM suppliers
    WHERE name = 'Czudowa Marka' AND owner_id = current_user_id LIMIT 1;
  IF cm_id IS NULL THEN
    RAISE EXCEPTION 'Czudowa Marka supplier not found — run scripts/003 first.';
  END IF;

  INSERT INTO products (
    owner_id, supplier_id, name, gramatura, ean,
    cost_eur, cost_pln,
    price_maly_opt, price_sredni, price_duzy, price_duzi_gracze, price_min,
    category, shelf_life_days, seasonality_status, is_hero, unit, push_tier
  )
  SELECT
    current_user_id, cm_id, v.name, v.gramatura, v.ean,
    v.cost_eur, v.cost_pln,
    v.price_maly_opt, v.price_sredni, v.price_duzy, v.price_duzi_gracze, v.price_min,
    v.category, v.shelf_life_days, v.seasonality_status, v.is_hero, v.unit, v.push_tier
  FROM (VALUES
    -- Kapusta kiszona (3 sizes)
    ('Kapusta kiszona',                              '3000 g',         '4820116704311', 1.6,   7.88,  15.75, 13.13, 12.12, 11.59, 10.23, 'kiszonki_kapusty',   90, 'available',    false, 'szt', 2),
    ('Kapusta kiszona',                              '900 g',          '4820116702294', 1.08,  5.32,  10.63, 8.86,  8.18,  7.82,  6.91,  'kiszonki_kapusty',   90, 'available',    false, 'szt', 2),
    ('Kapusta kiszona',                              '400 g',          '4820116702300', 0.6,   2.95,  5.91,  4.92,  4.54,  4.34,  3.83,  'kiszonki_kapusty',   90, 'available',    false, 'szt', 2),
    -- Kapusta kiszona z żurawiną (3 sizes)
    ('Kapusta kiszona z żurawiną',                   '3000 g',         '4820116704632', 4.03,  19.84, 39.67, 33.06, 30.52, 29.18, 25.77, 'kiszonki_dodatki',   90, 'available',    false, 'szt', 2),
    ('Kapusta kiszona z żurawiną',                   '900 g',          '4820116702881', 1.3,   6.4,   12.8,  10.66, 9.84,  9.41,  8.31,  'kiszonki_dodatki',   90, 'available',    false, 'szt', 2),
    ('Kapusta kiszona z żurawiną',                   '400 g',          '4820116702850', 0.66,  3.25,  6.5,   5.41,  5,     4.78,  4.22,  'kiszonki_dodatki',   90, 'available',    false, 'szt', 2),
    -- Kapusta kiszona z papryką słodką (HERO — fuzzy match for "Surówka z kapusty z papryką")
    ('Kapusta kiszona z papryką słodką',             '3000 g',         '4820116704472', 4.03,  19.84, 39.67, 33.06, 30.52, 29.18, 25.77, 'kiszonki_dodatki',   90, 'available',    true,  'szt', 1),
    -- Kapusta kiszona z ogórkami
    ('Kapusta kiszona z ogórkami',                   '3000 g',         '4820116704465', 4.03,  19.84, 39.67, 33.06, 30.52, 29.18, 25.77, 'kiszonki_dodatki',   90, 'available',    false, 'szt', 2),
    -- Surówka tradycyjna (HERO, 4 sizes)
    ('Surówka tradycyjna (kapusta+papryka+marchew)', '3000 g',         '4820116704427', 3.35,  16.49, 32.98, 27.48, 25.37, 24.25, 21.42, 'surowki_marynowane', 30, 'available',    true,  'szt', 1),
    ('Surówka tradycyjna',                           '900 g',          '4820116705561', 1.04,  5.12,  10.24, 8.53,  7.88,  7.53,  6.65,  'surowki_marynowane', 30, 'available',    true,  'szt', 1),
    ('Surówka tradycyjna',                           '400 g',          '4820116702751', 0.7,   3.45,  6.89,  5.74,  5.3,   5.07,  4.48,  'surowki_marynowane', 30, 'available',    true,  'szt', 1),
    ('Surówka tradycyjna',                           '300 g',          '4820116705455', 0.41,  2.02,  4.04,  3.36,  3.1,   2.97,  2.62,  'surowki_marynowane', 30, 'available',    true,  'szt', 1),
    -- Surówka "Kapusta z burakami" (HERO, 2 sizes)
    ('Surówka "Kapusta z burakami"',                 '3000 g',         '4820116705639', 3.1,   15.26, 30.52, 25.43, 23.47, 22.44, 19.82, 'surowki_marynowane', 30, 'available',    true,  'szt', 1),
    ('Surówka "Kapusta z burakami"',                 '300 g',          '4820116705615', 0.44,  2.17,  4.33,  3.61,  3.33,  3.19,  2.82,  'surowki_marynowane', 30, 'available',    true,  'szt', 1),
    -- Surówka "Pełuska" (2 sizes)
    ('Surówka "Pełuska"',                            '3000g / ~2000g', '4820116705622', 2.3,   11.32, 22.64, 18.87, 17.42, 16.65, 14.7,  'surowki_marynowane', 30, 'available',    false, 'szt', 2),
    ('Surówka "Pełuska"',                            '350g / ~250g',   '4820116705592', 0.44,  2.17,  4.33,  3.61,  3.33,  3.19,  2.82,  'surowki_marynowane', 30, 'available',    false, 'szt', 2),
    -- Surówka ze świeżej kapusty w marynacie (2 sizes)
    ('Surówka ze świeżej kapusty w marynacie',       '3000 g',         '4820116704434', 4.2,   20.67, 41.34, 34.45, 31.8,  30.4,  26.84, 'surowki_marynowane', 30, 'available',    false, 'szt', 2),
    ('Surówka ze świeżej kapusty w marynacie',       '300 g',          '4820116705479', 0.42,  2.07,  4.13,  3.45,  3.18,  3.04,  2.69,  'surowki_marynowane', 30, 'available',    false, 'szt', 2),
    -- Surówka z marchwi po koreańsku (HERO, 3 sizes)
    ('Surówka z marchwi po koreańsku',               '3000 g',         '4820116704281', 3.35,  16.49, 32.98, 27.48, 25.37, 24.25, 21.42, 'surowka_marchew',    30, 'available',    true,  'szt', 1),
    ('Surówka z marchwi po koreańsku',               '900 g',          '4820116702768', 0.83,  4.09,  8.17,  6.81,  6.29,  6.01,  5.31,  'surowka_marchew',    30, 'available',    true,  'szt', 1),
    ('Surówka z marchwi po koreańsku',               '300 g',          '4820116705462', 0.47,  2.31,  4.63,  3.86,  3.56,  3.4,   3,     'surowka_marchew',    30, 'available',    true,  'szt', 1),
    -- Sałatka z buraków czerwonych (2 sizes)
    ('Sałatka z buraków czerwonych',                 '3000 g',         '4820116705660', 3.52,  17.33, 34.65, 28.88, 26.65, 25.49, 22.51, 'salatki_gotowe',     30, 'available',    false, 'szt', 2),
    ('Sałatka z buraków czerwonych',                 '300 g',          '4820116705486', 0.4,   1.97,  3.94,  3.28,  3.03,  2.9,   2.56,  'salatki_gotowe',     30, 'available',    false, 'szt', 2),
    -- Buraki gotowane sterylizowane (3 sizes, clean label)
    ('Buraki gotowane sterylizowane',                '1500 g',         '4820116704755', 1.584, 7.8,   15.59, 12.99, 11.99, 11.47, 10.13, 'buraki_clean_label', 60, 'available',    false, 'szt', 2),
    ('Buraki gotowane sterylizowane',                '500 g',          '4820116703529', 0.56,  2.76,  5.51,  4.59,  4.24,  4.06,  3.58,  'buraki_clean_label', 60, 'available',    false, 'szt', 2),
    ('Buraki gotowane sterylizowane',                '350 g',          '4820116704137', 0.36,  1.77,  3.54,  2.95,  2.73,  2.6,   2.3,   'buraki_clean_label', 60, 'available',    false, 'szt', 2),
    -- Ogórki kiszone (3 sizes, OUT OF STOCK)
    ('Ogórki kiszone',                               '5000g / ~3000g', '4820116704304', 3.75,  18.46, 36.92, 30.76, 28.4,  27.15, 23.97, 'ogorki_kiszone',     90, 'out_of_stock', false, 'szt', 2),
    ('Ogórki kiszone',                               '1000g / ~600g',  '4820116702386', 0.72,  3.54,  7.09,  5.91,  5.45,  5.21,  4.6,   'ogorki_kiszone',     90, 'out_of_stock', false, 'szt', 2),
    ('Ogórki kiszone',                               '500g / ~300g',   '4820116704397', 0.69,  3.4,   6.79,  5.66,  5.22,  5,     4.42,  'ogorki_kiszone',     90, 'out_of_stock', false, 'szt', 2),
    -- Pomidory w przyprawach (3 sizes, OUT OF STOCK)
    ('Pomidory w przyprawach',                       '5000g / ~3000g', '4820116704298', 2.8,   13.78, 27.56, 22.97, 21.2,  20.26, 17.9,  'pomidory',           90, 'out_of_stock', false, 'szt', 2),
    ('Pomidory w przyprawach',                       '1000g / ~600g',  '4820116702416', 0.62,  3.05,  6.1,   5.09,  4.69,  4.49,  3.96,  'pomidory',           90, 'out_of_stock', false, 'szt', 2),
    ('Pomidory cherry w przyprawach',                '500g / ~300g',   '4820116703208', 0.78,  3.84,  7.68,  6.4,   5.91,  5.65,  4.99,  'pomidory',           90, 'out_of_stock', false, 'szt', 2),
    -- Sałatka z bakłażana (HERO, 2 sizes)
    ('Sałatka z bakłażana',                          '3000 g',         '4820116704403', 4.76,  23.43, 46.86, 39.05, 36.04, 34.46, 30.43, 'salatka_baklazan',   30, 'available',    true,  'szt', 1),
    ('Sałatka z bakłażana',                          '300 g',          '4820116705523', 0.74,  3.64,  7.28,  6.07,  5.6,   5.35,  4.73,  'salatka_baklazan',   30, 'available',    true,  'szt', 1)
  ) AS v(
    name, gramatura, ean,
    cost_eur, cost_pln,
    price_maly_opt, price_sredni, price_duzy, price_duzi_gracze, price_min,
    category, shelf_life_days, seasonality_status, is_hero, unit, push_tier
  )
  WHERE NOT EXISTS (
    SELECT 1 FROM products
    WHERE ean = v.ean AND owner_id = current_user_id
  );

  GET DIAGNOSTICS inserted_count = ROW_COUNT;
  RAISE NOTICE 'Czudowa Marka seed: % new SKU rows inserted (target: 34)', inserted_count;
END $$;
