-- ============================================================================
-- Follow-up to auditors_bifurcation_migration: drop created_by FKs
-- ============================================================================
-- After the bifurcation, auditor UUIDs live in public.auditors instead of
-- public.app_users. Any row an auditor inserts (invoice, line item, customer,
-- note, receipt, etc.) puts their UUID into `created_by`, which fails the
-- existing FK to app_users(id).
--
-- We follow the same pattern the bifurcation used for audit_logs.user_id:
-- keep `created_by` as a plain UUID column with no FK, since rows can be
-- created by either an owner (app_users) or an auditor (auditors).
--
-- Safe to re-run -- each drop is guarded with `if exists`.
-- ============================================================================

begin;

do $$
declare
  rec record;
begin
  for rec in
    select c.conname, n.nspname, t.relname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    join pg_namespace n on n.oid = t.relnamespace
    join pg_class ref on ref.oid = c.confrelid
    where c.contype = 'f'
      and n.nspname = 'public'
      and ref.relname = 'app_users'
      and t.relname in (
        'invoices',
        'invoice_items',
        'customers',
        'items',
        'credit_notes',
        'credit_note_items',
        'debit_notes',
        'debit_note_items',
        'receipts',
        'payment_vouchers'
      )
      and exists (
        select 1
        from unnest(c.conkey) k
        join pg_attribute a on a.attrelid = c.conrelid and a.attnum = k
        where a.attname = 'created_by'
      )
  loop
    execute format(
      'alter table %I.%I drop constraint %I',
      rec.nspname, rec.relname, rec.conname
    );
  end loop;
end $$;

commit;
