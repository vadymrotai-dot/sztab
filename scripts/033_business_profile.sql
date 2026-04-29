-- 033_business_profile.sql
-- Sprint L Phase 3 — business_profile JSONB column дla AI analysis output.
--
-- Stores Claude Haiku analysis of аккумулированных enrichment signals:
-- business_format / locations / categories / target / traits / summary +
-- buyer_strength_for_chm score + reasoning.
--
-- Idempotent.

ALTER TABLE clients ADD COLUMN IF NOT EXISTS business_profile JSONB;
ALTER TABLE ceidg_prospects ADD COLUMN IF NOT EXISTS business_profile JSONB;

CREATE INDEX IF NOT EXISTS idx_clients_business_profile_gin
  ON clients USING gin(business_profile);
CREATE INDEX IF NOT EXISTS idx_prospects_business_profile_gin
  ON ceidg_prospects USING gin(business_profile);

COMMENT ON COLUMN clients.business_profile IS
  'AI-generated business analysis (Claude Haiku 4.5). Shape:
   {business_format, estimated_locations, product_categories_pl[],
    target_demographics_pl[], special_traits_pl[], business_summary_pl,
    buyer_strength_for_chm (0-100), buyer_reasoning_pl,
    model_used, analyzed_at, input_sources[]}';
