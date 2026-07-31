-- ============================================================================
-- Auditor access fixes
-- ============================================================================
-- Run this once in the Supabase SQL editor. Fixes a bug that has stopped
-- auditors creating invoices since the auditors bifurcation.
--
-- THE BUG
--   `invoices.created_by` carries `references public.app_users(id)`.
--   The bifurcation migration moved auditors into `public.auditors` and DELETED
--   their rows out of `public.app_users` — but only loosened the equivalent FK
--   on `audit_logs.user_id`; this one was missed.
--   auditor_data_request() inserts `created_by = v_auditor.id`, which is now an
--   id in public.auditors, so every auditor invoice insert violates the FK.
--
-- THE FIX
--   Drop the constraint and keep the column as a plain uuid — exactly what the
--   bifurcation did for audit_logs.user_id, and for the same reason: the value
--   can legitimately point at either table.
--
--   `public.auditors.created_by` KEEPS its FK to app_users on purpose. That
--   column records which OWNER created the auditor, and owners really do live in
--   app_users, so it is correct.
--
-- Safe to re-run — the drop is guarded and the constraint name is looked up
-- rather than assumed.
--
-- IMPORTANT: this file only fixes the schema. The auditor RPC also had no
-- branches for credit notes, debit notes or receipts, so those modules returned
-- 'Unsupported resource request' for auditors. Those branches were added to the
-- auditor function files, so re-run whichever you deployed AFTER this:
--     supabase_auditor_pgcrypto_fix.sql
--   (or supabase/auditors_bifurcation_migration.sql)
-- ============================================================================

begin;

do $$
declare
  v_fk text;
begin
  select conname into v_fk
  from pg_constraint
  where conrelid = 'public.invoices'::regclass
    and contype = 'f'
    and confrelid = 'public.app_users'::regclass
    -- Only the constraint covering created_by; nothing else on invoices points
    -- at app_users today, but be explicit rather than dropping by position.
    and conkey = array[
      (select attnum from pg_attribute
        where attrelid = 'public.invoices'::regclass and attname = 'created_by')
    ]::smallint[];

  if v_fk is not null then
    execute format('alter table public.invoices drop constraint %I', v_fk);
    raise notice 'Dropped invoices.created_by FK (%) — auditors can now create invoices', v_fk;
  else
    raise notice 'invoices.created_by has no FK to app_users — nothing to do';
  end if;
end $$;

commit;

-- ----------------------------------------------------------------------------
-- Verify: this should return no rows.
--
--   select conname
--   from pg_constraint
--   where conrelid = 'public.invoices'::regclass
--     and contype = 'f'
--     and confrelid = 'public.app_users'::regclass;
--
-- And this should now succeed for an auditor session (it previously raised
-- "insert or update on table invoices violates foreign key constraint"):
--
--   select public.auditor_data_request(
--     '<auditor-uuid>', 'invoices', 'invoices', 'insert',
--     jsonb_build_object('record', jsonb_build_object(
--       'invoice_number', 'TEST-1', 'invoice_date', current_date::text))
--   );
-- ----------------------------------------------------------------------------
