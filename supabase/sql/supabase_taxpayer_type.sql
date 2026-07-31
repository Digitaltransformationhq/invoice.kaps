-- ============================================================================
-- Taxpayer type (Regular vs Composition)
-- ----------------------------------------------------------------------------
-- Adds company_settings.taxpayer_type so each company can be marked as a
-- regular GST taxpayer or a Composition-scheme dealer. Collected at signup and
-- editable in Settings -> Invoice Settings.
--
--   * Column + check constraint (values: 'regular' | 'composition').
--   * save_company_settings / get_company_settings extended to carry the value.
--   * handle_new_owner seeds it from the signup metadata.
--
-- Run this in the Supabase SQL Editor. Run it LAST (it re-creates the settings
-- functions, matching supabase_fix_invoice_defaults_settings.sql plus the new
-- field). Safe to run more than once.
-- ============================================================================

-- 1. Column + constraint.
alter table public.company_settings
  add column if not exists taxpayer_type text not null default 'regular';

alter table public.company_settings
  drop constraint if exists company_settings_taxpayer_type_check;
alter table public.company_settings
  add constraint company_settings_taxpayer_type_check
  check (taxpayer_type in ('regular', 'composition'));

-- 2. save_company_settings — now takes p_taxpayer_type as the 10th arg.
--    Drop the older 8-arg and 9-arg signatures so only this one remains.
drop function if exists public.save_company_settings(text, integer, integer, text, text, numeric, text, boolean);
drop function if exists public.save_company_settings(text, integer, integer, text, text, numeric, text, boolean, boolean);

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
  p_taxpayer_type text
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
    taxpayer_type
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
    case when p_taxpayer_type in ('regular', 'composition') then p_taxpayer_type else 'regular' end
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
    taxpayer_type = excluded.taxpayer_type
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
      'taxpayer_type', v_settings.taxpayer_type
    )
  );
end;
$$;

grant execute on function public.save_company_settings(text, integer, integer, text, text, numeric, text, boolean, boolean, text) to authenticated;

-- 3. get_company_settings — return taxpayer_type too.
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
      'taxpayer_type',            v_settings.taxpayer_type
    )
  );
end;
$$;

grant execute on function public.get_company_settings(uuid) to anon, authenticated;

-- 4. handle_new_owner — seed taxpayer_type from the signup metadata. Mirrors the
--    current trigger in supabase_fix_header_too_large.sql, only the
--    company_settings seed changed.
create or replace function public.handle_new_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
  v_user_id uuid;
begin
  insert into public.companies (
    owner_auth_user_id,
    company_name,
    gstin,
    pan,
    phone,
    email,
    address,
    city,
    state,
    pin_code,
    company_logo
  ) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'company_name', ''), 'My Company'),
    nullif(new.raw_user_meta_data->>'gstin', ''),
    coalesce(nullif(new.raw_user_meta_data->>'pan', ''), case when length(coalesce(new.raw_user_meta_data->>'gstin', '')) >= 12 then substring(new.raw_user_meta_data->>'gstin' from 3 for 10) else null end),
    nullif(new.raw_user_meta_data->>'phone', ''),
    coalesce(nullif(new.email, ''), new.id::text || '@no-email.local'),
    nullif(new.raw_user_meta_data->>'address', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    nullif(new.raw_user_meta_data->>'state', ''),
    nullif(new.raw_user_meta_data->>'pin_code', ''),
    nullif(new.raw_user_meta_data->>'company_logo', '')
  )
  on conflict (owner_auth_user_id) do update
  set
    company_name = excluded.company_name,
    gstin = excluded.gstin,
    pan = excluded.pan,
    phone = excluded.phone,
    email = excluded.email,
    address = excluded.address,
    city = excluded.city,
    state = excluded.state,
    pin_code = excluded.pin_code,
    company_logo = excluded.company_logo
  returning id into v_company_id;

  insert into public.app_users (
    company_id,
    auth_user_id,
    email,
    full_name,
    role
  ) values (
    v_company_id,
    new.id,
    coalesce(nullif(new.email, ''), new.id::text || '@no-email.local'),
    coalesce(nullif(new.raw_user_meta_data->>'full_name', ''), split_part(coalesce(nullif(new.email, ''), 'Owner'), '@', 1)),
    'owner'
  )
  on conflict (auth_user_id) do update
  set
    company_id = excluded.company_id,
    email = excluded.email,
    full_name = excluded.full_name,
    role = 'owner',
    is_active = true
  returning id into v_user_id;

  insert into public.company_settings (company_id, taxpayer_type)
  values (
    v_company_id,
    case when new.raw_user_meta_data->>'taxpayer_type' in ('regular', 'composition')
         then new.raw_user_meta_data->>'taxpayer_type'
         else 'regular' end
  )
  on conflict (company_id) do update
  set taxpayer_type = excluded.taxpayer_type;

  -- Keep the (large, base64) logo OUT of the JWT. It now lives in
  -- public.companies; strip it from auth metadata so the access token stays small.
  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'company_logo'
  where id = new.id;

  return new;
end;
$$;

-- 5. Refresh PostgREST's schema cache so the new RPC signature is available now.
notify pgrst, 'reload schema';
