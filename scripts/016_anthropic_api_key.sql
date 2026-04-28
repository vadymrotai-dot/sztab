-- 016_anthropic_api_key.sql
-- Phase 2.6 Hotfix: Replace Gemini API z Anthropic Claude API.
--
-- Powód: Gemini free tier (250 req/dzień gemini-2.5-flash, 1000/dzień
-- flash-lite) wyczerpany podczas testów 27-28.04. Częste 503/429
-- zatrzymywały production workflows (Analiza potencjału klienta, AI
-- Discovery deep_discovery runs). Vadym kupił Anthropic API key
-- (paid usage), migration jest "Claude only" — bez fallback hybrydy.
--
-- Idempotent. ALTER bezpieczny dla istniejących wierszy params.
-- gemini_key column NIE jest usunięta — zostaje na wypadek przyszłej
-- potrzeby (np. specific Gemini grounding feature). Kod NIE czyta
-- gemini_key — wszystkie 4 routes + lib/ai/intelligence.ts czytają
-- anthropic_api_key.

ALTER TABLE params ADD COLUMN IF NOT EXISTS anthropic_api_key TEXT;
COMMENT ON COLUMN params.anthropic_api_key IS
  'Anthropic Claude API key (sk-ant-api03-...). Used by lib/ai-providers.ts callClaude(). Manage via Supabase Dashboard SQL Editor — UI w /settings → Klucze API zostanie zaktualizowane w następnym sprincie.';

-- ──────────────────────────────────────────────────────────
-- IMPORTANT: After running ALTER above, manually run UPDATE
-- below z prawdziwym kluczem (key NIE jest w git per security).
-- Vadym dostarcza klucz one-shot przez channel poza repo.
--
-- Wzorzec (zamień <KEY> na sk-ant-api03-... value):
--
-- UPDATE params SET anthropic_api_key = '<KEY>';
--
-- (UPDATE bez WHERE — params jest single-user table, jeden row.)
-- ──────────────────────────────────────────────────────────
