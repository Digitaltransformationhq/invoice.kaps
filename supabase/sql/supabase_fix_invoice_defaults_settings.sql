-- ============================================================================
-- FIX: Invoice Defaults toggle "not connected"
--
-- Root cause: later migrations (supabase_auditor_pgcrypto_fix.sql and
-- supabase/auditors_bifurcation_migration*.sql) re-created get_company_settings
-- WITHOUT returning `invoice_defaults_enabled`. Saving the flag still worked,
-- but reading it back always came out undefined, so the app defaulted the
-- toggle to ON every load — i.e. the setting looked disconnected.
--
-- This script restores the toggle-aware save/get functions. Run it LAST, in the
-- Supabase SQL Editor. Safe to run more than once.
--
-- SUPERSEDED: supabase_taxpayer_type.sql re-creates these same functions with an
-- extra p_taxpayer_type arg (10-arg save). Once you have run that file, DO NOT
-- re-run this one — it would recreate the older 9-arg save_company_settings and
-- break the client's 10-arg call. Run supabase_taxpayer_type.sql instead; it is
-- a strict superset of this file.
-- ============================================================================

-- 1. Make sure the column exists.
alter table public.company_settings
  add column if not exists invoice_defaults_enabled boolean not null default true;

-- 2. Drop the legacy 8-arg save signature so only the toggle-aware one remains.
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

-- 3. get_company_settings — return the flag. Auditor lookup uses public.auditors
--    (the bifurcated table).
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
      'invoice_defaults_enabled', v_settings.invoice_defaults_enabled
    )
  );
end;
$$;

grant execute on function public.get_company_settings(uuid) to anon, authenticated;

-- 4. Refresh PostgREST's schema cache so the RPC signatures are picked up now.
notify pgrst, 'reload schema';
