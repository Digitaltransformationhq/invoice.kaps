-- Bank account type
-- =============================================================================
-- Adds `bank_account_type` to public.companies, alongside the bank name, number,
-- IFSC and branch already held there.
--
-- Why it matters on an invoice: a customer paying by NEFT/RTGS is asked for the
-- account type by their bank, and a wrong guess between Savings and Current is a
-- common cause of a transfer bouncing back. The Bank Details block exists to let
-- a customer pay without asking, so the type belongs in it.
--
-- Free text rather than an enum or CHECK constraint: banks label these
-- inconsistently (Cash Credit / CC / CC A/c, Overdraft / OD), the app offers the
-- common set as a dropdown, and a company with something unusual should not be
-- blocked by the database. Existing rows get NULL and simply print no A/c Type
-- line, exactly as they do today.
--
-- Safe to run more than once.
-- =============================================================================

alter table public.companies
  add column if not exists bank_account_type text;

comment on column public.companies.bank_account_type is
  'Savings / Current / Cash Credit / Overdraft. Printed in the invoice bank block.';
