-- Invoice format (template) — company default + per-invoice snapshot
-- =============================================================================
-- Lets a company choose which layout its invoices print in, and records on each
-- invoice which layout it was actually issued with.
--
-- WHY TWO PLACES, exactly as with `terms` (supabase_invoice_terms.sql):
--   * company_settings.invoice_template is the DEFAULT a new invoice starts
--     from. Changing it must only affect invoices issued from then on.
--   * invoices.invoice_template is the COPY that went out. An invoice is a legal
--     document; a customer holding a printed Tally-style bill must get the same
--     thing back if it is reprinted two years later, whatever the company has
--     switched to since.
--
-- Behaviour after this migration:
--   * The company default becomes 'tally'. New invoices print in the Tally
--     format unless Settings → Invoice Settings says otherwise.
--   * Existing invoices get NULL. That is deliberate and it is NOT the same as
--     "use the current default": they were issued before formats existed, when
--     the app had exactly one layout — the classic ruled grid. The app maps NULL
--     to that legacy format (LEGACY_INVOICE_TEMPLATE_ID in
--     src/lib/invoiceTemplates.ts), so every invoice already in the system keeps
--     printing exactly as it does today.
--
-- No CHECK constraint on the value on purpose. Formats are added and retired in
-- the app, and a constraint here would mean a database migration every time one
-- is added — and would reject a value a newer client already wrote. The app
-- resolves an unknown id back to a working format instead (getInvoiceTemplate).
--
-- RUN THIS FILE LAST. save_company_settings and get_company_settings are
-- redefined by several files in this folder — supabase_taxpayer_type.sql,
-- supabase_invoice_defaults_toggle.sql, supabase_fix_invoice_defaults_settings.sql
-- and the auditor function files. Whichever runs last wins, and the older ones
-- do not know about invoice_template: re-running one of them afterwards drops
-- the column from the settings payload and the app silently falls back to the
-- default format for every company. If you do re-run one, re-run this after it.
--
-- Safe to run more than once.
-- =============================================================================

-- 1. Columns -----------------------------------------------------------------

alter table public.company_settings
  add column if not exists invoice_template text not null default 'tally';

alter table public.invoices
  add column if not exists invoice_template text;

comment on column public.company_settings.invoice_template is
  'Default invoice layout for NEW invoices. See src/lib/invoiceTemplates.ts.';
comment on column public.invoices.invoice_template is
  'The layout this invoice was issued with. NULL = issued before formats existed (classic).';

-- Companies that already existed were created before this column and carry its
-- default. That is what we want — they are opted in to Tally for new invoices —
-- but say so explicitly rather than relying on the DDL default having applied.
update public.company_settings
set invoice_template = 'tally'
where invoice_template is null or trim(invoice_template) = '';

-- -----------------------------------------------------------------------------
-- IMPORTANT: auditors create invoices through the auditor_data_request() RPC,
-- which inserts with an explicit column list. If auditor-created invoices are to
-- carry their format, that list must include `invoice_template` — re-run
-- whichever auditor function file you deployed:
--     supabase_auditor_pgcrypto_fix.sql
--   (or supabase/auditors_bifurcation_migration.sql, whichever you deployed)
-- Without that change an auditor-created invoice simply stores NULL and prints
-- in the legacy classic format. Owner-created invoices work immediately.
-- -----------------------------------------------------------------------------

-- 2. save_company_settings — now takes p_invoice_template as the 11th arg.
--    Drop the older signatures so only this one remains.
drop function if exists public.save_company_settings(text, integer, integer, text, text, numeric, text, boolean);
drop function if exists public.save_company_settings(text, integer, integer, text, text, numeric, text, boolean, boolean);
drop function if exists public.save_company_settings(text, integer, integer, text, text, numeric, text, boolean, boolean, text);

create or replace function public.save_company_settings(
  p_invoice_prefix text,
  p_invoice_next_number integer,
  p_default_due_days integer,
  p_currency text,
  p_terms text,
  p_default_gst_rate numeric,
  p_default_place_of_supply text,
  p_enable_reverse_charge boolean,
  p_invoice_defaults_enabled boolean,
  p_taxpayer_type text,
  p_invoice_template text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
  v_settings public.company_settings;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'Only an active owner can update settings');
  end if;

  insert into public.company_settings (
    company_id,
    invoice_prefix,
    invoice_next_number,
    default_due_days,
    currency,
    terms,
    default_gst_rate,
    default_place_of_supply,
    enable_reverse_charge,
    invoice_defaults_enabled,
    taxpayer_type,
    invoice_template
  ) values (
    v_company_id,
    coalesce(nullif(trim(p_invoice_prefix), ''), 'INV'),
    greatest(coalesce(p_invoice_next_number, 1), 1),
    greatest(coalesce(p_default_due_days, 15), 0),
    coalesce(nullif(trim(p_currency), ''), 'INR'),
    nullif(trim(coalesce(p_terms, '')), ''),
    coalesce(p_default_gst_rate, 0),
    nullif(trim(coalesce(p_default_place_of_supply, '')), ''),
    coalesce(p_enable_reverse_charge, false),
    coalesce(p_invoice_defaults_enabled, true),
    case when p_taxpayer_type in ('regular', 'composition') then p_taxpayer_type else 'regular' end,
    coalesce(nullif(trim(p_invoice_template), ''), 'tally')
  )
  on conflict (company_id) do update
  set
    invoice_prefix = excluded.invoice_prefix,
    invoice_next_number = excluded.invoice_next_number,
    default_due_days = excluded.default_due_days,
    currency = excluded.currency,
    terms = excluded.terms,
    default_gst_rate = excluded.default_gst_rate,
    default_place_of_supply = excluded.default_place_of_supply,
    enable_reverse_charge = excluded.enable_reverse_charge,
    invoice_defaults_enabled = excluded.invoice_defaults_enabled,
    taxpayer_type = excluded.taxpayer_type,
    invoice_template = excluded.invoice_template
  returning * into v_settings;

  return jsonb_build_object(
    'success', true,
    'settings', jsonb_build_object(
      'invoice_prefix', v_settings.invoice_prefix,
      'invoice_next_number', v_settings.invoice_next_number,
      'default_due_days', v_settings.default_due_days,
      'currency', v_settings.currency,
      'terms', v_settings.terms,
      'default_gst_rate', v_settings.default_gst_rate,
      'default_place_of_supply', v_settings.default_place_of_supply,
      'enable_reverse_charge', v_settings.enable_reverse_charge,
      'invoice_defaults_enabled', v_settings.invoice_defaults_enabled,
      'taxpayer_type', v_settings.taxpayer_type,
      'invoice_template', v_settings.invoice_template
    )
  );
end;
$$;

grant execute on function public.save_company_settings(text, integer, integer, text, text, numeric, text, boolean, boolean, text, text) to authenticated;

-- 3. get_company_settings — return invoice_template too.
create or replace function public.get_company_settings(p_auditor_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
  v_settings public.company_settings;
begin
  v_company_id := public.current_company_id();

  if v_company_id is null and p_auditor_id is not null then
    select company_id into v_company_id
    from public.auditors
    where id = p_auditor_id and is_active = true
    limit 1;
  end if;

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'Company settings profile not found');
  end if;

  insert into public.company_settings (company_id) values (v_company_id)
  on conflict (company_id) do nothing;

  select * into v_settings from public.company_settings
  where company_id = v_company_id limit 1;

  return jsonb_build_object(
    'success', true,
    'settings', jsonb_build_object(
      'invoice_prefix',           v_settings.invoice_prefix,
      'invoice_next_number',      v_settings.invoice_next_number,
      'default_due_days',         v_settings.default_due_days,
      'currency',                 v_settings.currency,
      'terms',                    v_settings.terms,
      'default_gst_rate',         v_settings.default_gst_rate,
      'default_place_of_supply',  v_settings.default_place_of_supply,
      'enable_reverse_charge',    v_settings.enable_reverse_charge,
      'invoice_defaults_enabled', v_settings.invoice_defaults_enabled,
      'taxpayer_type',            v_settings.taxpayer_type,
      'invoice_template',         v_settings.invoice_template
    )
  );
end;
$$;

grant execute on function public.get_company_settings(uuid) to anon, authenticated;
