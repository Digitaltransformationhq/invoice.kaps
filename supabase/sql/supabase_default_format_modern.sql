-- Default invoice format: Modern
-- =============================================================================
-- Supersedes the default set by supabase_invoice_template.sql, which made every
-- company default to 'tally'. The default is now 'modern'.
--
-- Three places pin the default and all three move together, or a company ends
-- up with a different format depending on which path created its settings row:
--   1. the column default on company_settings.invoice_template
--   2. the fallback inside save_company_settings, used when the client sends
--      nothing for the field
--   3. DEFAULT_INVOICE_TEMPLATE_ID in src/lib/invoiceTemplates.ts, used when the
--      settings row cannot be read at all
--
-- WHAT THIS CHANGES: the format NEW invoices are created in.
--
-- WHAT IT DOES NOT TOUCH: invoices.invoice_template. Every invoice already
-- issued keeps the format it went out in — Tally invoices raised since the last
-- migration stay Tally, and pre-format invoices stay classic. That is the whole
-- point of the per-invoice snapshot; see supabase_invoice_template.sql.
--
-- The row update below moves companies still sitting on the previous default
-- across to 'modern'. A company that has deliberately chosen something else in
-- Settings -> Invoice Settings is left alone, and any company can switch back to
-- Tally there at any time.
--
-- RUN THIS FILE LAST, for the same reason supabase_invoice_template.sql says so:
-- several files in this folder redefine save_company_settings, and whichever
-- runs last wins. Re-running an older one restores the old fallback.
--
-- Safe to run more than once.
-- =============================================================================

-- 1. Column default -----------------------------------------------------------

alter table public.company_settings
  alter column invoice_template set default 'modern';

-- 2. Move companies still on the previous default ------------------------------
--    Scoped to 'tally' (and blanks) on purpose: this is a change of DEFAULT, not
--    an instruction to overwrite a choice someone made deliberately.

update public.company_settings
set invoice_template = 'modern'
where invoice_template is null
   or trim(invoice_template) = ''
   or invoice_template = 'tally';

-- 3. save_company_settings — same 11-arg signature, fallback now 'modern' ------

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
    coalesce(nullif(trim(p_invoice_template), ''), 'modern')
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
