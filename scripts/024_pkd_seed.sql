-- 024_pkd_seed.sql
-- Sprint E / Commit 3: PKD-2007 + PKD-2025 + mapping seed.
--
-- Source: GUS Klasyfikacja Działalności (https://stat.gov.pl/klasyfikacje).
-- Subset: HoReCa-relevant divisions:
--   • 10.x produkcja artykułów spożywczych
--   • 11.x produkcja napojów
--   • 46.x handel hurtowy (incl. specialized food wholesale 46.21–46.39)
--   • 47.x handel detaliczny (47.11–47.29 grocery + general retail)
--   • 49.41 / 52.10 logistics support
--   • 56.x działalność gastronomiczna
--
-- PKD-2025 NOTE: GUS official 2007↔2025 mapping CSV not yet published as of
-- 2026-04-28. PKD-2025 rows тут є placeholders з identical codes — реальна
-- structure збережиться, тільки notes column documents this. Update post-CSV.
-- mapping_type='exact' для всіх current placeholder pairs; refine коли
-- GUS опублікує real revision data.
--
-- Idempotent: ON CONFLICT DO NOTHING.

-- ─────── PKD-2007 sections (parents) ───────
INSERT INTO pkd_2007 (code, description, parent_code) VALUES
  ('10', 'Produkcja artykułów spożywczych', NULL),
  ('11', 'Produkcja napojów', NULL),
  ('46', 'Handel hurtowy, z wyłączeniem handlu pojazdami samochodowymi', NULL),
  ('47', 'Handel detaliczny, z wyłączeniem handlu detalicznego pojazdami samochodowymi', NULL),
  ('49', 'Transport lądowy oraz transport rurociągowy', NULL),
  ('52', 'Magazynowanie i działalność usługowa wspomagająca transport', NULL),
  ('56', 'Działalność usługowa związana z wyżywieniem', NULL)
ON CONFLICT (code) DO NOTHING;

-- ─────── PKD-2007 detailed codes ───────
INSERT INTO pkd_2007 (code, description, parent_code) VALUES
  -- Produkcja artykułów spożywczych (10.x)
  ('10.11.Z', 'Przetwarzanie i konserwowanie mięsa, z wyłączeniem mięsa z drobiu', '10'),
  ('10.12.Z', 'Przetwarzanie i konserwowanie mięsa z drobiu', '10'),
  ('10.13.Z', 'Produkcja wyrobów z mięsa, włączając wyroby z mięsa drobiowego', '10'),
  ('10.20.Z', 'Przetwarzanie i konserwowanie ryb, skorupiaków i mięczaków', '10'),
  ('10.31.Z', 'Przetwarzanie i konserwowanie ziemniaków', '10'),
  ('10.32.Z', 'Produkcja soków z owoców i warzyw', '10'),
  ('10.39.Z', 'Pozostałe przetwarzanie i konserwowanie owoców i warzyw', '10'),
  ('10.41.A', 'Produkcja olejów i pozostałych tłuszczów płynnych', '10'),
  ('10.41.B', 'Produkcja margaryny i podobnych tłuszczów jadalnych', '10'),
  ('10.51.Z', 'Przetwórstwo mleka i wyrób serów', '10'),
  ('10.52.Z', 'Produkcja lodów', '10'),
  ('10.61.Z', 'Wytwarzanie produktów przemiału zbóż', '10'),
  ('10.71.Z', 'Produkcja pieczywa; produkcja świeżych wyrobów ciastkarskich', '10'),
  ('10.72.Z', 'Produkcja sucharów i herbatników; konserwowanych wyrobów ciastkarskich', '10'),
  ('10.81.Z', 'Produkcja cukru', '10'),
  ('10.82.Z', 'Produkcja kakao, czekolady i wyrobów cukierniczych', '10'),
  ('10.83.Z', 'Przetwórstwo herbaty i kawy', '10'),
  ('10.84.Z', 'Produkcja przypraw', '10'),
  ('10.85.Z', 'Wytwarzanie gotowych posiłków i dań', '10'),
  ('10.86.Z', 'Produkcja artykułów spożywczych homogenizowanych i żywności dietetycznej', '10'),
  ('10.89.Z', 'Produkcja pozostałych artykułów spożywczych, gdzie indziej niesklasyfikowana', '10'),
  -- Produkcja napojów (11.x)
  ('11.01.Z', 'Destylowanie, rektyfikowanie i mieszanie alkoholi', '11'),
  ('11.02.Z', 'Produkcja win gronowych', '11'),
  ('11.03.Z', 'Produkcja cydru i pozostałych win owocowych', '11'),
  ('11.05.Z', 'Produkcja piwa', '11'),
  ('11.06.Z', 'Produkcja słodu', '11'),
  ('11.07.Z', 'Produkcja napojów bezalkoholowych; produkcja wód mineralnych', '11'),
  -- Handel hurtowy (46.21–46.39)
  ('46.21.Z', 'Sprzedaż hurtowa zboża, nieprzetworzonego tytoniu, nasion i pasz dla zwierząt', '46'),
  ('46.31.Z', 'Sprzedaż hurtowa owoców i warzyw', '46'),
  ('46.32.Z', 'Sprzedaż hurtowa mięsa i wyrobów z mięsa', '46'),
  ('46.33.Z', 'Sprzedaż hurtowa mleka, wyrobów mleczarskich, jaj, olejów', '46'),
  ('46.34.A', 'Sprzedaż hurtowa napojów alkoholowych', '46'),
  ('46.34.B', 'Sprzedaż hurtowa napojów bezalkoholowych', '46'),
  ('46.36.Z', 'Sprzedaż hurtowa cukru, czekolady, wyrobów cukierniczych i piekarskich', '46'),
  ('46.37.Z', 'Sprzedaż hurtowa herbaty, kawy, kakao i przypraw', '46'),
  ('46.38.Z', 'Sprzedaż hurtowa pozostałej żywności, włączając ryby, skorupiaki i mięczaki', '46'),
  ('46.39.Z', 'Sprzedaż hurtowa niewyspecjalizowana żywności, napojów i wyrobów tytoniowych', '46'),
  -- Handel detaliczny (47.x)
  ('47.11.Z', 'Sprzedaż detaliczna prowadzona w niewyspecjalizowanych sklepach z przewagą żywności', '47'),
  ('47.19.Z', 'Pozostała sprzedaż detaliczna w niewyspecjalizowanych sklepach', '47'),
  ('47.21.Z', 'Sprzedaż detaliczna owoców i warzyw prowadzona w wyspecjalizowanych sklepach', '47'),
  ('47.22.Z', 'Sprzedaż detaliczna mięsa i wyrobów z mięsa prowadzona w wyspecjalizowanych sklepach', '47'),
  ('47.23.Z', 'Sprzedaż detaliczna ryb, skorupiaków i mięczaków', '47'),
  ('47.24.Z', 'Sprzedaż detaliczna pieczywa, ciast, wyrobów ciastkarskich i cukierniczych', '47'),
  ('47.25.Z', 'Sprzedaż detaliczna napojów alkoholowych i bezalkoholowych', '47'),
  ('47.29.Z', 'Sprzedaż detaliczna pozostałej żywności prowadzona w wyspecjalizowanych sklepach', '47'),
  ('47.81.Z', 'Sprzedaż detaliczna żywności, napojów i wyrobów tytoniowych prowadzona w niestałych miejscach', '47'),
  ('47.91.Z', 'Sprzedaż detaliczna prowadzona przez domy sprzedaży wysyłkowej lub Internet', '47'),
  ('47.99.Z', 'Pozostała sprzedaż detaliczna prowadzona poza siecią sklepową', '47'),
  -- Logistics support
  ('49.41.Z', 'Transport drogowy towarów', '49'),
  ('52.10.B', 'Magazynowanie i przechowywanie pozostałych towarów', '52'),
  -- Działalność gastronomiczna (56.x)
  ('56.10.A', 'Restauracje i inne stałe placówki gastronomiczne', '56'),
  ('56.10.B', 'Ruchome placówki gastronomiczne', '56'),
  ('56.21.Z', 'Przygotowywanie i dostarczanie żywności dla odbiorców zewnętrznych (catering)', '56'),
  ('56.29.Z', 'Pozostała usługowa działalność gastronomiczna', '56'),
  ('56.30.Z', 'Przygotowywanie i podawanie napojów (bary, kawiarnie, puby)', '56')
ON CONFLICT (code) DO NOTHING;

-- ─────── PKD-2025 (placeholder, identical codes) ───────
-- See header note. Real revision codes pending GUS CSV publication.
INSERT INTO pkd_2025 (code, description, parent_code)
SELECT code, description, parent_code FROM pkd_2007
ON CONFLICT (code) DO NOTHING;

-- ─────── pkd_mapping (2007 ↔ 2025, currently 1:1 placeholder) ───────
INSERT INTO pkd_mapping (pkd_2007_code, pkd_2025_code, mapping_type, notes)
SELECT
  p7.code,
  p25.code,
  'exact'::TEXT,
  'Placeholder mapping pre GUS PKD-2025 official CSV (2026-04-28).'::TEXT
FROM pkd_2007 p7
JOIN pkd_2025 p25 ON p25.code = p7.code
WHERE NOT EXISTS (
  SELECT 1 FROM pkd_mapping m
  WHERE m.pkd_2007_code = p7.code AND m.pkd_2025_code = p25.code
);
