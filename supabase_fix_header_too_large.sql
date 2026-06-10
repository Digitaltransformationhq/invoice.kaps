-- ============================================================================
-- FIX: "REQUEST_HEADER_TOO_LARGE" on login
-- ----------------------------------------------------------------------------
-- Cause: signup stored the company logo (a base64 image) in the user's auth
-- metadata. Supabase embeds auth metadata into the JWT access token, so after
-- login every request sent "Authorization: Bearer <huge JWT>" — exceeding the
-- hosting header limit (~32KB) and getting rejected before reaching the server.
--
-- The logo is ALSO stored in public.companies.company_logo (where the app
-- actually reads it from), so removing it from auth metadata is safe and does
-- NOT affect the UI.
--
-- HOW TO RUN: Supabase Dashboard -> SQL Editor -> paste this whole file -> Run.
-- Run it ONCE. Then sign in again (it will work).
-- ============================================================================

-- 1) Safety backfill: if any company is missing its logo, copy it from the
--    user's metadata before we strip it.
update public.companies c
set company_logo = nullif(u.raw_user_meta_data->>'company_logo', '')
from auth.users u
where u.id = c.owner_auth_user_id
  and coalesce(c.company_logo, '') = ''
  and nullif(u.raw_user_meta_data->>'company_logo', '') is not null;

-- 2) Remove the heavy logo from EXISTING users' metadata. This shrinks their
--    JWT; their next login issues a small token and succeeds.
update auth.users
set raw_user_meta_data = raw_user_meta_data - 'company_logo'
where raw_user_meta_data ? 'company_logo';

-- 3) Update the signup trigger so FUTURE signups never reintroduce the bloat:
--    copy the logo into public.companies (as before), then strip it from the
--    auth metadata so the access token stays small.
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

  insert into public.company_settings (company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;

  -- Keep the (large, base64) logo OUT of the JWT. It now lives in
  -- public.companies; strip it from auth metadata so the access token stays small.
  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'company_logo'
  where id = new.id;

  return new;
end;
$$;

-- 4) Verify: this should return 0 rows once the fix has run.
select id, email
from auth.users
where raw_user_meta_data ? 'company_logo';
