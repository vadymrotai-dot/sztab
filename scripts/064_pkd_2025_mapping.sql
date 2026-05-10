-- 064_pkd_2025_mapping.sql
-- Sprint S6D Day 0 (10.05.2026) — PKD 2007 → PKD 2025 mapping + HoReCa fit scoring.
--
-- WHY: PKD 2025 weszła w życie 1 stycznia 2025. Перехідне okno do
-- 31 grudnia 2026 (від 2027-01-01 GUS/KRS/CEIDG автоматично remapują).
-- Sztab DB має MIX kodów PKD 2007 (старі firms) + PKD 2025 (нові 2025+),
-- тому потрібна mapping table щоб segmentation не вибухала.
--
-- Migration зі ALSO seed-ить HoReCa fit scoring per code (0-10 scale),
-- разом з category tag (restaurant/hotel/wholesale/retail/...).
-- Використовується в `lib/pkd/mapping-2007-2025.ts` для UI badges + algo
-- scoring.
--
-- Idempotent. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────
-- 1. PKD 2007 → PKD 2025 mapping (тільки HoReCa-relevant codes для MVP)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pkd_2007_to_2025 (
  pkd_2007 TEXT PRIMARY KEY,
  pkd_2025 TEXT NOT NULL,
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE pkd_2007_to_2025 IS
  'PKD 2007 → PKD 2025 mapping. Source: GUS klucze powiązań PDF (2024).';

-- Seed з GUS official mapping (HoReCa subset)
INSERT INTO pkd_2007_to_2025 (pkd_2007, pkd_2025, notes) VALUES
  -- Section 56 — Działalność usługowa związana z wyżywieniem
  ('56.10.A', '56.11.Z', 'Restauracje (zmiana w PKD 2025)'),
  ('56.10.B', '56.12.Z', 'Ruchome placówki gastronomiczne (zmiana w PKD 2025)'),
  ('56.21.Z', '56.21.Z', 'Catering imprez (bez zmiany)'),
  ('56.29.Z', '56.29.Z', 'Catering pozostały (bez zmiany)'),
  ('56.30.Z', '56.30.Z', 'Bary i puby (bez zmiany)'),
  -- Section 47 — Sprzedaż detaliczna
  ('47.11.Z', '47.11.Z', 'Sklepy spożywcze niewyspecjalizowane'),
  ('47.21.Z', '47.21.Z', 'Sklepy z owocami i warzywami'),
  ('47.22.Z', '47.22.Z', 'Sklepy z mięsem'),
  ('47.23.Z', '47.23.Z', 'Sklepy z rybami i owocami morza'),
  ('47.24.Z', '47.24.Z', 'Sklepy piekarnia/cukiernia'),
  ('47.29.Z', '47.29.Z', 'Pozostała sprzedaż detaliczna żywności'),
  -- Section 46 — Sprzedaż hurtowa
  ('46.31.Z', '46.31.Z', 'Hurt warzyw'),
  ('46.32.Z', '46.32.Z', 'Hurt mięsa'),
  ('46.34.A', '46.34.A', 'Hurt napojów alkoholowych'),
  ('46.38.Z', '46.38.Z', 'Hurt pozostałej żywności (w tym ryby)'),
  ('46.39.Z', '46.39.Z', 'Hurt niewyspecjalizowany (cash & carry)'),
  -- Section 55 — Hotele
  ('55.10.Z', '55.10.Z', 'Hotele i podobne obiekty zakwaterowania'),
  ('55.20.Z', '55.20.Z', 'Pensjonaty, hostele, agroturystyki'),
  ('55.30.Z', '55.30.Z', 'Pola kempingowe'),
  ('55.90.Z', '55.90.Z', 'Pozostałe zakwaterowanie (akademiki, internaty)'),
  -- Section 93 — Sport, rekreacja
  ('93.11.Z', '93.11.Z', 'Obiekty sportowe (z restauracjami)'),
  ('93.21.Z', '93.21.Z', 'Parki rozrywki'),
  ('93.29.Z', '93.29.Z', 'Pozostała rozrywka (kasyna z barami)'),
  -- Section 86/87 — Health/social (institutional catering)
  ('86.10.Z', '86.10.Z', 'Szpitale'),
  ('87.30.Z', '87.30.Z', 'Pomoc społeczna z zakwaterowaniem (DPS-y)'),
  -- Section 85 — Edukacja
  ('85.10.Z', '85.10.Z', 'Wychowanie przedszkolne'),
  ('85.20.Z', '85.20.Z', 'Szkoły podstawowe'),
  ('85.31.Z', '85.31.Z', 'Gimnazja, licea ogólnokształcące'),
  ('85.32.Z', '85.32.Z', 'Szkoły zawodowe')
ON CONFLICT (pkd_2007) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 2. HoReCa fit scoring per PKD 2025 code (canonical)
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pkd_horeca_fit (
  pkd_code TEXT PRIMARY KEY,            -- canonical PKD 2025 code
  fit_score INTEGER NOT NULL CHECK (fit_score BETWEEN 0 AND 10),
  category TEXT NOT NULL CHECK (category IN (
    'restaurant',         -- restauracje, kebabnie, bary
    'food_service',       -- food trucks, ruchome
    'hotel',              -- hotele, pensjonaty
    'catering',           -- imprezowy, kontraktowy, instytucjonalny
    'retail',             -- sklepy detaliczne
    'wholesale',          -- hurtownie B2B
    'institution',        -- szpitale, szkoły, DPS-y
    'production',         -- producenci spożywczy
    'recreation',         -- obiekty sportowe, parki rozrywki
    'other'
  )),
  notes TEXT,
  added_at TIMESTAMPTZ DEFAULT now()
);

COMMENT ON TABLE pkd_horeca_fit IS
  'HoReCa fit scoring per PKD 2025 code. 10 = direct fish supplier sweet spot,
   0 = irrelevant. Used by lib/pkd/mapping-2007-2025.ts + scoring engine.';

INSERT INTO pkd_horeca_fit (pkd_code, fit_score, category, notes) VALUES
  -- Restaurant tier — core target dla fish supplier
  ('56.11.Z', 9, 'restaurant', 'Core target — restauracje stałe'),
  ('56.12.Z', 3, 'food_service', 'Food trucks — limited fresh fish viability (chłodnia logistics)'),
  ('56.30.Z', 4, 'food_service', 'Bary i puby — przekąski rybne low-volume'),
  -- Catering tier
  ('56.21.Z', 8, 'catering', 'Wesela, bankiety = łosoś, dorsz premium'),
  ('56.29.Z', 6, 'catering', 'Stołówki — volume + low margin, ryba mrożona'),
  -- Hotel tier
  ('55.10.Z', 9, 'hotel', 'Hotele premium F&B'),
  ('55.20.Z', 5, 'hotel', 'Pensjonaty — variable F&B model'),
  ('55.30.Z', 1, 'hotel', 'Pola kempingowe — minimal F&B'),
  ('55.90.Z', 5, 'hotel', 'Akademiki, internaty z stołówkami'),
  -- Retail tier
  ('47.23.Z', 10, 'retail', 'Direct fish reseller — top target'),
  ('47.29.Z', 8, 'retail', 'Delicatesy — kawior, śledzie, wędzony łosoś'),
  ('47.22.Z', 5, 'retail', 'Mięso retail — czasem wędzone ryby'),
  ('47.11.Z', 4, 'retail', 'Sklepy spożywcze ogólne'),
  ('47.21.Z', 2, 'retail', 'Owoce/warzywa retail — niski fit'),
  ('47.24.Z', 3, 'retail', 'Piekarnia/cukiernia retail'),
  -- Wholesale tier (potential reseller / co-distribution / competition)
  ('46.38.Z', 7, 'wholesale', 'Hurt rybny — partner lub konkurent'),
  ('46.39.Z', 6, 'wholesale', 'Cash & carry — Makro, Selgros'),
  ('46.32.Z', 4, 'wholesale', 'Hurt mięsa — czasem wędzone ryby'),
  ('46.31.Z', 3, 'wholesale', 'Hurt warzyw — minimal cross'),
  ('46.34.A', 2, 'wholesale', 'Hurt alkoholu — minimal cross'),
  -- Institutional tier
  ('86.10.Z', 5, 'institution', 'Szpitale — institutional catering'),
  ('87.30.Z', 5, 'institution', 'DPS-y, hospicja'),
  ('85.10.Z', 4, 'institution', 'Przedszkola — outsourced catering'),
  ('85.20.Z', 4, 'institution', 'Szkoły podstawowe'),
  ('85.31.Z', 4, 'institution', 'Licea, gimnazja'),
  ('85.32.Z', 4, 'institution', 'Szkoły zawodowe'),
  -- Recreation tier
  ('93.11.Z', 5, 'recreation', 'Obiekty sportowe (kluby з restauracjami)'),
  ('93.21.Z', 4, 'recreation', 'Parki rozrywki — catering wewnętrzny'),
  ('93.29.Z', 3, 'recreation', 'Kasyna, kręgielnie з barami')
ON CONFLICT (pkd_code) DO NOTHING;

-- ─────────────────────────────────────────────────────────────────────
-- 3. Helper view — для query convenience
-- ─────────────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW pkd_lookup AS
SELECT
  COALESCE(m.pkd_2007, f.pkd_code) AS code_input,
  COALESCE(m.pkd_2025, f.pkd_code) AS code_canonical,
  f.fit_score,
  f.category,
  COALESCE(m.notes, f.notes) AS notes
FROM pkd_horeca_fit f
LEFT JOIN pkd_2007_to_2025 m ON m.pkd_2025 = f.pkd_code;

COMMENT ON VIEW pkd_lookup IS
  'Convenience view: input PKD code (2007 or 2025) → canonical 2025 + fit_score + category.';
