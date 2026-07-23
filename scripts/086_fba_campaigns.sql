-- 086_fba_campaigns.sql
-- FBA workspace: таблиця кампаній лідогенерації.
-- Idempotent.

CREATE TABLE IF NOT EXISTS fba_campaigns (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,
  filter_pkd TEXT[],
  filter_zus TEXT[],
  filter_obyw TEXT[],
  filter_wojewodztwo TEXT,
  filter_status TEXT DEFAULT 'AKTYWNY',
  status TEXT NOT NULL DEFAULT 'DRAFT'
    CHECK (status IN ('DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED')),
  leads_count INTEGER DEFAULT 0,
  enriched_count INTEGER DEFAULT 0,
  sent_count INTEGER DEFAULT 0,
  replied_count INTEGER DEFAULT 0,
  converted_count INTEGER DEFAULT 0,
  instantly_campaign_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ
);

ALTER TABLE ceidg_prospects
  ADD COLUMN IF NOT EXISTS campaign_id UUID REFERENCES fba_campaigns(id) ON DELETE SET NULL;

COMMENT ON COLUMN ceidg_prospects.campaign_id IS
  'Кампанія до якої належить лід. NULL = не прив''язаний.';

CREATE INDEX IF NOT EXISTS fba_campaigns_status_idx ON fba_campaigns(status);
CREATE INDEX IF NOT EXISTS fba_campaigns_created_at_idx ON fba_campaigns(created_at DESC);
CREATE INDEX IF NOT EXISTS ceidg_prospects_campaign_id_idx ON ceidg_prospects(campaign_id);

CREATE OR REPLACE FUNCTION fba_campaigns_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS fba_campaigns_updated_at ON fba_campaigns;
CREATE TRIGGER fba_campaigns_updated_at
  BEFORE UPDATE ON fba_campaigns
  FOR EACH ROW
  EXECUTE FUNCTION fba_campaigns_set_updated_at();

ALTER TABLE fba_campaigns ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  CREATE POLICY "fba_campaigns_authenticated_all" ON fba_campaigns
    FOR ALL TO authenticated
    USING (true)
    WITH CHECK (true);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

COMMENT ON TABLE fba_campaigns IS
  'FBA лідогенераційні кампанії з фільтрами аудиторії і статистикою.';
