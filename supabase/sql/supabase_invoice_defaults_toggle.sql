-- ============================================================================
-- Invoice Defaults on/off toggle, persisted per company so it follows the
-- account across devices.
--
-- Run this in the Supabase SQL Editor once. It:
--   1. adds company_settings.invoice_defaults_enabled (default true)
--   2. extends save_company_settings to accept/store the flag
--   3. extends get_company_settings to return the flag
-- ============================================================================

alter table public.company_settings
  add column if not exists invoice_defaults_enabled boolean not null default true;

-- ----------------------------------------------------------------------------
-- save_company_settings — now takes p_invoice_defaults_enabled as the 9th arg.
-- Drop the old 8-arg version so there's a single, unambiguous function.
-- ----------------------------------------------------------------------------
drop function if exists public.save_company_settings(text, integer, integer, text, text, numeric, text, boolean);

create or replace function public.save_company_settings(
  p_invoice_prefix text,
  p_invoice_next_number integer,
  p_default_due_days integer,
  p_currency text,
  p_terms text,
  p_default_gst_rate numeric,
  p_default_place_of_supply text,
  p_enable_reverse_charge boolean,
  p_invoice_defaults_enabled boolean
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
    invoice_defaults_enabled
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
    coalesce(p_invoice_defaults_enabled, true)
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
    invoice_defaults_enabled = excluded.invoice_defaults_enabled
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
      'invoice_defaults_enabled', v_settings.invoice_defaults_enabled
    )
  );
end;
$$;

grant execute on function public.save_company_settings(text, integer, integer, text, text, numeric, text, boolean, boolean) to authenticated;

-- ----------------------------------------------------------------------------
-- get_company_settings — return the new flag too.
-- ----------------------------------------------------------------------------
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
      'invoice_prefix',          v_settings.invoice_prefix,
      'invoice_next_number',     v_settings.invoice_next_number,
      'default_due_days',        v_settings.default_due_days,
      'currency',                v_settings.currency,
      'terms',                   v_settings.terms,
      'default_gst_rate',        v_settings.default_gst_rate,
      'default_place_of_supply', v_settings.default_place_of_supply,
      'enable_reverse_charge',   v_settings.enable_reverse_charge,
      'invoice_defaults_enabled', v_settings.invoice_defaults_enabled
    )
  );
end;
$$;

grant execute on function public.get_company_settings(uuid) to authenticated;

-- Force PostgREST (the REST/RPC layer) to refresh its schema cache immediately,
-- otherwise newly created functions may report "Could not find the function ...
-- in the schema cache" for a short while.
notify pgrst, 'reload schema';
