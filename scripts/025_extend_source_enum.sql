-- 025_extend_source_enum.sql
-- Hotfix: add 'ai' (provider-neutral) до product_attributes.source CHECK.
-- Original enum (023) included 'gemini' specifically. Swap до Claude Haiku
-- 4.5 — використовуємо 'ai' замість провайдер-specific tag. 'gemini' лишений
-- backward-compat (no rows existed з 'gemini' тому actual data migration не
-- потрібна).
--
-- Idempotent.

ALTER TABLE product_attributes DROP CONSTRAINT IF EXISTS product_attributes_source_check;
ALTER TABLE product_attributes ADD CONSTRAINT product_attributes_source_check
  CHECK (source IN ('family_default', 'off', 'gemini', 'ai', 'manual', 'override'));

COMMENT ON COLUMN product_attributes.source IS
  'family_default | off | ai | manual | override. Legacy "gemini" kept for backward compat — нові rows used "ai" (provider-neutral) since 2026-04-28 swap до Claude Haiku.';
