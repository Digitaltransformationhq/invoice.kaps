-- Invoice terms snapshot
-- =============================================================================
-- Adds `terms` to public.invoices so each invoice carries the Terms &
-- Conditions that were in force when it was issued.
--
-- Why a column instead of reading company_settings.terms at render time: an
-- invoice is a legal document. Reading the company's current terms when
-- reprinting would silently restate a 2024 invoice under 2026 terms. The
-- settings value is the *default* for new invoices; this column is the copy
-- that was actually issued.
--
-- Behaviour after this migration:
--   * New invoices snapshot the company's terms (editable per invoice on the
--     create form before saving).
--   * Existing rows get NULL — we cannot know what terms were in force when
--     they were issued, and inventing them would be worse than showing none.
--     Invoices with NULL/empty terms simply print no terms block, exactly as
--     they did before.
--
-- Safe to run more than once.
-- =============================================================================

alter table public.invoices
  add column if not exists terms text;

-- -----------------------------------------------------------------------------
-- IMPORTANT: auditors create invoices through the auditor_data_request() RPC,
-- which inserts with an explicit column list. That list has been updated to
-- carry `terms` and `due_date`, so re-run whichever auditor function file you
-- deployed or auditor-created invoices will silently save neither:
--     supabase_auditor_pgcrypto_fix.sql
--   (or supabase/auditors_bifurcation_migration.sql, whichever you deployed)
-- Owner-created invoices work immediately without any function change.
--
-- Note `due_date` itself needs no migration — the column has always existed on
-- public.invoices; the app just never wrote to it.
-- -----------------------------------------------------------------------------
