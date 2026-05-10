-- 065_prediction_history.sql
-- Sprint S6D Day 3 (12.05.2026) — Day 4 prediction engine foundation.
--
-- Two tables:
--   1. menu_predictions — append-only history of monthly volume forecasts
--      per client. Each row = one prediction snapshot (source data + formula
--      + result). Якщо Vadym підтверджує real numbers — actual_data filled
--      → correction_factor computed для formula calibration.
--   2. dish_ingredient_mappings — canonical lookup from Polish dish names
--      до raw ingredient breakdown (grams per portion). AI-generated
--      initially (Haiku), validated by Vadym over time.
--
-- Idempotent. Safe to re-run.

-- ─────────────────────────────────────────────────────────────────────
-- 1. menu_predictions — prediction history per client
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS menu_predictions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES clients(id) ON DELETE CASCADE,

  -- Snapshot вхідних даних на момент прогнозу
  source_data JSONB NOT NULL,
  -- Expected shape:
  -- {
  --   reviews_count: 253,
  --   rating: 4.7,
  --   months_since_open: 24,
  --   client_type: 'gastronomia',
  --   client_subtype: 'sushi_bar',
  --   dishes_count: 32,
  --   dishes_source: 'www_menu' | 'wedo_pdf_menu' | 'gmaps_popular' | 'manual',
  --   coverage_tier: 'full_menu' | 'popular_only' | 'subtype_only',
  --   city: 'Piaseczno',
  --   voivodeship: 'mazowieckie',
  --   location_count: 1
  -- }

  -- Версія формули + параметри
  formula_version TEXT NOT NULL,                -- 'v1.0' для tracking
  formula_params JSONB,
  -- {conversion_factor, frequency_multiplier, subtype_factors}

  -- Прогноз результат
  prediction JSONB NOT NULL,
  -- {
  --   customers_low, customers_mid, customers_high,
  --   visits_mid,
  --   ingredients_kg: { 'losoś atlantycki': 30, 'ryż': 80 },
  --   confidence: 0.0-1.0
  -- }

  predicted_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  -- Заповнюється коли Vadym дізнається реальні цифри
  actual_data JSONB,
  -- {actual_orders_kg: {...}, source: 'invoice|client_call|estimate', confirmed_at}
  confirmed_at TIMESTAMPTZ,
  correction_factor NUMERIC,
  -- Audit
  notes TEXT
);

CREATE INDEX IF NOT EXISTS idx_menu_predictions_client
  ON menu_predictions(client_id);
CREATE INDEX IF NOT EXISTS idx_menu_predictions_date
  ON menu_predictions(predicted_at DESC);
CREATE INDEX IF NOT EXISTS idx_menu_predictions_confirmed
  ON menu_predictions(confirmed_at)
  WHERE confirmed_at IS NOT NULL;

COMMENT ON TABLE menu_predictions IS
  'Append-only prediction history per client. Day 4 engine writes тут;
   Vadym корегує actual_data via UI коли дізнається реальні обсяги.';

-- ─────────────────────────────────────────────────────────────────────
-- 2. dish_ingredient_mappings — Polish dish name → raw ingredients
-- ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dish_ingredient_mappings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Назва страви (унікальна для PL ринку)
  dish_name_pl TEXT NOT NULL,
  dish_name_normalized TEXT NOT NULL,           -- lowercased, deaccented
  cuisine_type TEXT,
  -- Enum-style (no DB constraint бо Vadym може додавати):
  -- 'sushi' | 'pizza' | 'polska' | 'kebab' | 'kawiarnia' | 'italian'
  -- | 'asian' | 'fast_food' | 'fine_dining' | 'inne'

  -- Розклад на інгредієнти (per portion)
  ingredients JSONB NOT NULL,
  -- Format: [{
  --   name: 'losoś atlantycki',
  --   name_normalized: 'losos_atlantycki',
  --   grams: 30,
  --   source: 'ai|manual',
  --   confidence: 0.0-1.0
  -- }]

  -- Audit + history
  created_by TEXT NOT NULL,                     -- 'ai_haiku' | 'vadym_manual'
  created_at TIMESTAMPTZ DEFAULT now(),
  ai_model TEXT,                                -- 'claude-haiku-4-5'
  ai_prompt_version TEXT,                       -- 'v1.0'
  validation_status TEXT DEFAULT 'unvalidated',
  -- 'unvalidated' | 'vadym_approved' | 'corrected'
  validation_notes TEXT,

  UNIQUE(dish_name_normalized, cuisine_type)
);

CREATE INDEX IF NOT EXISTS idx_dish_mappings_normalized
  ON dish_ingredient_mappings(dish_name_normalized);
CREATE INDEX IF NOT EXISTS idx_dish_mappings_cuisine
  ON dish_ingredient_mappings(cuisine_type);

COMMENT ON TABLE dish_ingredient_mappings IS
  'Canonical Polish dish → ingredient breakdown (per portion).
   AI-generated initially (Haiku), Vadym validates over time.
   Used by Day 4 prediction engine для aggregate kg/month.';

-- ─────────────────────────────────────────────────────────────────────
-- 3. RLS policies (mirror existing tables pattern — authenticated full access)
-- ─────────────────────────────────────────────────────────────────────
ALTER TABLE menu_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE dish_ingredient_mappings ENABLE ROW LEVEL SECURITY;

-- menu_predictions
DROP POLICY IF EXISTS "auth users select menu_predictions" ON menu_predictions;
DROP POLICY IF EXISTS "auth users insert menu_predictions" ON menu_predictions;
DROP POLICY IF EXISTS "auth users update menu_predictions" ON menu_predictions;

CREATE POLICY "auth users select menu_predictions"
  ON menu_predictions FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth users insert menu_predictions"
  ON menu_predictions FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth users update menu_predictions"
  ON menu_predictions FOR UPDATE TO authenticated USING (true);

-- dish_ingredient_mappings
DROP POLICY IF EXISTS "auth users select dish_mappings" ON dish_ingredient_mappings;
DROP POLICY IF EXISTS "auth users insert dish_mappings" ON dish_ingredient_mappings;
DROP POLICY IF EXISTS "auth users update dish_mappings" ON dish_ingredient_mappings;

CREATE POLICY "auth users select dish_mappings"
  ON dish_ingredient_mappings FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth users insert dish_mappings"
  ON dish_ingredient_mappings FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "auth users update dish_mappings"
  ON dish_ingredient_mappings FOR UPDATE TO authenticated USING (true);
