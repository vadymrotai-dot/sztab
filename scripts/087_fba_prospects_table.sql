-- 087_fba_prospects_table.sql
-- Окрема таблиця для FBA лідів (програмісти, дизайнери, фрілансери).
-- Відокремлена від ceidg_prospects (дистрибуція HoReCa/ЧМ).
-- Ідентична структура + FBA-специфічні поля з 085.
-- Idempotent.

CREATE TABLE IF NOT EXISTS fba_prospects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ceidg_id TEXT UNIQUE NOT NULL,
  nip TEXT,
  regon TEXT,
  name TEXT NOT NULL,
  owner_name TEXT,
  status TEXT NOT NULL,
  pkd_main TEXT,
  pkd_all TEXT[],
  wojewodztwo TEXT,
  powiat TEXT,
  gmina TEXT,
  miejscowosc TEXT,
  kod_pocztowy TEXT,
  ulica TEXT,
  budynek TEXT,
  lokal TEXT,
  adres_full TEXT,
  lat NUMERIC,
  lng NUMERIC,
  data_rozpoczecia DATE,
  email TEXT,
  telefon TEXT,
  www TEXT,
  source TEXT DEFAULT 'ceidg',
  raw_data JSONB,
  -- FBA-специфічні поля (з 085)
  source_pkd TEXT,
  zus_segment TEXT,
  obywatelstwo TEXT,
  fba_segment TEXT,
  fba_pitch TEXT,
  linkedin_url TEXT,
  apollo_enriched_at TIMESTAMPTZ,
  outreach_status TEXT DEFAULT 'NEW',
  outreach_channel TEXT,
  first_contact_at TIMESTAMPTZ,
  last_contact_at TIMESTAMPTZ,
  sent_to_fba_at TIMESTAMPTZ,
  fba_result TEXT,
  commission_paid BOOLEAN DEFAULT FALSE,
  campaign_id UUID REFERENCES fba_campaigns(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  last_synced_at TIMESTAMPTZ DEFAULT now()
);

-- Індекси
CREATE UNIQUE INDEX IF NOT EXISTS fba_prospects_ceidg_id_uniq ON fba_prospects(ceidg_id);
CREATE INDEX IF NOT EXISTS fba_prospects_status_idx ON fba_prospects(status);
CREATE INDEX IF NOT EXISTS fba_prospects_source_pkd_idx ON fba_prospects(source_pkd);
CREATE INDEX IF NOT EXISTS fba_prospects_zus_segment_idx ON fba_prospects(zus_segment);
CREATE INDEX IF NOT EXISTS fba_prospects_obywatelstwo_idx ON fba_prospects(obywatelstwo);
CREATE INDEX IF NOT EXISTS fba_prospects_outreach_status_idx ON fba_prospects(outreach_status);
CREATE INDEX IF NOT EXISTS fba_prospects_commission_paid_idx ON fba_prospects(commission_paid);
CREATE INDEX IF NOT EXISTS fba_prospects_campaign_id_idx ON fba_prospects(campaign_id);
CREATE INDEX IF NOT EXISTS fba_prospects_woj_status_idx ON fba_prospects(wojewodztwo, status);

-- updated_at trigger
CREATE OR REPLACE FUNCTION fba_prospects_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fba_prospects_updated_at ON fba_prospects;
CREATE TRIGGER fba_prospects_updated_at
  BEFORE UPDATE ON fba_prospects
  FOR EACH ROW
  EXECUTE FUNCTION fba_prospects_set_updated_at();

-- RLS
ALTER TABLE fba_prospects ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "fba_prospects_authenticated_all" ON fba_prospects
    FOR ALL TO authenticated
    USING (true) WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE fba_prospects IS
  'FBA лідогенерація — програмісти, дизайнери, фрілансери з CEIDG. Відокремлена від ceidg_prospects (дистрибуція).';
