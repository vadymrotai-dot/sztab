-- Phase 2.5a: settings table + strategic partner support on clients.
-- Idempotent: safe to re-run.

-- 1. Settings (key/value) для глобальних параметрів типу kurs EUR/PLN, overhead.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- RLS: settings глобальні (не per-user), але читати тільки авторизованим.
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "settings_read_authenticated" ON settings
    FOR SELECT TO authenticated USING (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE POLICY "settings_write_authenticated" ON settings
    FOR ALL TO authenticated USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Seed основних параметрів (з Ziomek_Fish_KALKULATOR_WEWNETRZNY Parametry sheet)
INSERT INTO settings (key, value, description) VALUES
  ('kurs_eur_pln', '4.28', 'Aktualny kurs walutowy EUR → PLN do kalkulacji kosztu_PLN'),
  ('overhead_multiplier', '1.15', 'Narzut logistyka/magazyn/obsługa — 15%'),
  ('margin_maly_opt', '0.50', 'Marża dla zamówień <1000 PLN (Mały opt, cena podstawowa)'),
  ('margin_sredni_opt', '0.40', 'Marża dla zamówień 1000-2500 PLN (Średni opt)'),
  ('margin_duzy_opt', '0.35', 'Marża dla zamówień >2500 PLN (Duży opt)'),
  ('margin_strategic_katalog', '0.32', 'Marża startowa dla Duzi Gracze (Katalog)'),
  ('margin_strategic_docel', '0.23', 'Marża minimalna dla Duzi Gracze po negocjacjach (Docel)'),
  ('threshold_sredni_pln', '1000', 'Próg total_value w PLN dla przejścia na Średni opt'),
  ('threshold_duzy_pln', '2500', 'Próg total_value w PLN dla przejścia na Duży opt')
ON CONFLICT (key) DO NOTHING;

-- 2. Strategic partner support на clients.
ALTER TABLE clients ADD COLUMN IF NOT EXISTS client_type TEXT NOT NULL DEFAULT 'standard';

DO $$ BEGIN
  ALTER TABLE clients ADD CONSTRAINT clients_client_type_check
    CHECK (client_type IN ('standard', 'strategic_partner'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE clients ADD COLUMN IF NOT EXISTS contracted_margin_katalog_pct NUMERIC(5,4);
ALTER TABLE clients ADD COLUMN IF NOT EXISTS contracted_margin_docel_pct NUMERIC(5,4);

DO $$ BEGIN
  ALTER TABLE clients ADD CONSTRAINT clients_contracted_margins_check
    CHECK (
      (client_type = 'standard' AND contracted_margin_katalog_pct IS NULL AND contracted_margin_docel_pct IS NULL)
      OR
      (client_type = 'strategic_partner'
        AND contracted_margin_katalog_pct IS NOT NULL
        AND contracted_margin_docel_pct IS NOT NULL
        AND contracted_margin_docel_pct <= contracted_margin_katalog_pct
        AND contracted_margin_docel_pct >= 0
        AND contracted_margin_katalog_pct <= 1)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS clients_client_type_idx ON clients(client_type)
  WHERE client_type = 'strategic_partner';
