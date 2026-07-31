-- ============================================================================
-- Add status tracking to the receipts table
-- ============================================================================
-- Run this once in the Supabase SQL editor before testing the new receipts UI.
--
-- Adds a `status` column to `public.receipts` so the UI can distinguish between
--   cleared:  payment confirmed (the default for instant modes — UPI, Cash, Card)
--   pending:  awaiting confirmation (typically Cheque until it clears)
-- ============================================================================

begin;

alter table public.receipts
  add column if not exists status text not null default 'cleared'
    check (status in ('cleared', 'pending'));

commit;
