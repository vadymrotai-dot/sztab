-- 020_view_includes_vat.sql
-- Update scored_prospects view to include vat_* columns added in 017.
-- Switched from explicit column list to p.* — future column adds on
-- ceidg_prospects auto-propagate without needing view update.

DROP VIEW IF EXISTS scored_prospects;

CREATE VIEW scored_prospects
WITH (security_invoker = true)
AS
SELECT
  p.*,
  s.sklep_score,
  s.restaurant_score,
  s.catering_score,
  s.cafe_score,
  s.horeca_meta_score,
  s.dominant_channel,
  s.is_chain_franchise,
  s.chain_brand,
  s.filter_passed,
  s.filter_exclusion_reason,
  s.score_breakdown,
  s.scored_at,
  s.scoring_version,
  (p.email IS NOT NULL OR p.telefon IS NOT NULL) AS has_contact
FROM ceidg_prospects p
LEFT JOIN ceidg_prospect_scores s ON s.prospect_id = p.id;

COMMENT ON VIEW scored_prospects IS
  'Convenience JOIN ceidg_prospects + ceidg_prospect_scores z computed has_contact. Uses p.* — future column adds auto-propagate. security_invoker=true → RLS z base tables aplikowane.';
