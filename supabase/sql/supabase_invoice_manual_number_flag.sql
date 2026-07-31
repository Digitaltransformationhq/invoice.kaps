-- Invoice manual-number flag
-- =============================================================================
-- Adds `is_manual_number` to public.invoices so that manually-numbered invoices
-- can be excluded from the automatic invoice-number sequence.
--
-- Behaviour after this migration:
--   * Auto numbering counts ONLY invoices where is_manual_number = false, so a
--     manually-numbered invoice created in between never advances the automatic
--     sequence — the next auto invoice continues from the last *automatic* one.
--   * Existing rows default to false (treated as automatic). We cannot know in
--     hindsight which historical invoices were typed manually; adjust any of
--     them by hand if needed (see the optional UPDATE at the bottom).
--
-- Safe to run more than once.
-- =============================================================================

alter table public.invoices
  add column if not exists is_manual_number boolean not null default false;

-- -----------------------------------------------------------------------------
-- IMPORTANT: auditors create invoices through the auditor_data_request() RPC,
-- which uses an explicit column list. Re-run the current auditor function file
-- so it persists the new flag for auditor-created invoices:
--     supabase_auditor_pgcrypto_fix.sql
--   (or supabase/auditors_bifurcation_migration.sql, whichever you deployed)
-- Owner-created invoices work immediately without any function change.
-- -----------------------------------------------------------------------------

-- Optional: if you know specific historical invoices were entered with a manual
-- number, flag them so they drop out of the automatic sequence, e.g.
--   update public.invoices
--   set is_manual_number = true
--   where invoice_number in ('INV-500', 'CUSTOM-01');
