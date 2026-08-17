-- =============================================================================
-- Repair owners stuck between signup and login.
-- =============================================================================
-- Symptoms this fixes:
--   • Signing up says "User already registered"
--   • Signing in with the right password says "Profile not found"
--
-- "Profile not found" has TWO causes, and this script fixes both:
--
--   (a) Missing rows. The `auth.users` row exists but the `public.companies` +
--       `public.app_users` rows do not, so the join in `get_current_profile()`
--       finds nothing. Those rows are created by the `on_auth_user_created`
--       trigger; if it was missing (or errored) when the account was created,
--       the account is half-made and neither signup nor login can recover.
--
--   (b) An oversized access token. Supabase embeds raw_user_meta_data in the
--       JWT, and signup stored the base64 company logo there — pushing tokens to
--       ~100 KB, well past the ~32 KB header limit. Cloudflare then rejects the
--       request (520) and the Authorization header never reaches PostgREST, so
--       the RPC runs with auth.uid() = NULL and reports "Profile not found"
--       even though the rows are perfectly fine. See step 3b.
--
-- This script:
--   1. (Re)installs the trigger, so new signups are complete.
--   2. Backfills companies / app_users / company_settings for every existing
--      auth user that has no owner profile, from the metadata captured at signup.
--   3. Reactivates owner/company rows that exist but are switched off, and
--      promotes a stray non-owner row back to 'owner' — those also read as
--      "Profile not found" at the login screen. NOTE: if you had deliberately
--      disabled an owner, this turns them back on; comment out step 3 if so.
--   4. Refreshes get_current_profile() itself, in case this database holds an
--      out-of-date copy.
--   5. Prints a per-account status report as the final result.
--
-- Safe to re-run. It never deletes, and existing company or user details are
-- left as they are.
--
-- Run supabase_mpin_central.sql before this one: the final report reads
-- public.user_mpins to show which accounts have quick sign-in set up.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

-- ---------------------------------------------------------------------------
-- 1. The signup trigger (same definition the app expects)
-- ---------------------------------------------------------------------------

create or replace function public.handle_new_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_company_id uuid;
begin
  insert into public.companies (
    owner_auth_user_id, company_name, gstin, pan, phone, email,
    address, city, state, pin_code, company_logo
  ) values (
    new.id,
    coalesce(nullif(new.raw_user_meta_data->>'company_name', ''), 'My Company'),
    nullif(new.raw_user_meta_data->>'gstin', ''),
    coalesce(
      nullif(new.raw_user_meta_data->>'pan', ''),
      case when length(coalesce(new.raw_user_meta_data->>'gstin', '')) >= 12
           then substring(new.raw_user_meta_data->>'gstin' from 3 for 10) end
    ),
    nullif(new.raw_user_meta_data->>'phone', ''),
    coalesce(nullif(new.email, ''), new.id::text || '@no-email.local'),
    nullif(new.raw_user_meta_data->>'address', ''),
    nullif(new.raw_user_meta_data->>'city', ''),
    nullif(new.raw_user_meta_data->>'state', ''),
    nullif(new.raw_user_meta_data->>'pin_code', ''),
    nullif(new.raw_user_meta_data->>'company_logo', '')
  )
  on conflict (owner_auth_user_id) do update
  set company_name = excluded.company_name,
      gstin        = excluded.gstin,
      pan          = excluded.pan,
      phone        = excluded.phone,
      email        = excluded.email,
      address      = excluded.address,
      city         = excluded.city,
      state        = excluded.state,
      pin_code     = excluded.pin_code,
      company_logo = excluded.company_logo
  returning id into v_company_id;

  insert into public.app_users (company_id, auth_user_id, email, full_name, role)
  values (
    v_company_id,
    new.id,
    coalesce(nullif(new.email, ''), new.id::text || '@no-email.local'),
    coalesce(
      nullif(new.raw_user_meta_data->>'full_name', ''),
      split_part(coalesce(nullif(new.email, ''), 'Owner'), '@', 1)
    ),
    'owner'
  )
  on conflict (auth_user_id) do update
  set company_id = excluded.company_id,
      email      = excluded.email,
      full_name  = excluded.full_name,
      role       = 'owner',
      is_active  = true;

  insert into public.company_settings (company_id, taxpayer_type)
  values (
    v_company_id,
    case when new.raw_user_meta_data->>'taxpayer_type' in ('regular', 'composition')
         then new.raw_user_meta_data->>'taxpayer_type'
         else 'regular' end
  )
  on conflict (company_id) do update
  set taxpayer_type = excluded.taxpayer_type;

  -- Keep the (large, base64) logo OUT of the JWT: it lives in public.companies.
  update auth.users
  set raw_user_meta_data = raw_user_meta_data - 'company_logo'
  where id = new.id;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_owner();

-- ---------------------------------------------------------------------------
-- 2. Backfill the accounts that are already stuck
-- ---------------------------------------------------------------------------

do $$
declare
  v_user       record;
  v_company_id uuid;
  v_repaired   integer := 0;
  v_has_taxpayer_type boolean;
begin
  select exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name   = 'company_settings'
      and column_name  = 'taxpayer_type'
  ) into v_has_taxpayer_type;

  for v_user in
    select u.id, u.email, u.raw_user_meta_data as meta
    from auth.users u
    where not exists (
      select 1
      from public.app_users a
      where a.auth_user_id = u.id
        and a.role = 'owner'
    )
  loop
    insert into public.companies (
      owner_auth_user_id, company_name, gstin, pan, phone, email,
      address, city, state, pin_code, company_logo
    ) values (
      v_user.id,
      coalesce(nullif(v_user.meta->>'company_name', ''), 'My Company'),
      nullif(v_user.meta->>'gstin', ''),
      coalesce(
        nullif(v_user.meta->>'pan', ''),
        case when length(coalesce(v_user.meta->>'gstin', '')) >= 12
             then substring(v_user.meta->>'gstin' from 3 for 10) end
      ),
      nullif(v_user.meta->>'phone', ''),
      coalesce(nullif(v_user.email, ''), v_user.id::text || '@no-email.local'),
      nullif(v_user.meta->>'address', ''),
      nullif(v_user.meta->>'city', ''),
      nullif(v_user.meta->>'state', ''),
      nullif(v_user.meta->>'pin_code', ''),
      nullif(v_user.meta->>'company_logo', '')
    )
    -- A company may already exist from a partly-run signup; keep whatever is
    -- there rather than overwriting details the owner may have since edited.
    on conflict (owner_auth_user_id) do update
    set is_active = true
    returning id into v_company_id;

    -- A partly-run signup can leave an app_users row with no auth link. Adopt it,
    -- otherwise the insert below collides with unique(company_id, email).
    update public.app_users
    set auth_user_id = v_user.id,
        role         = 'owner',
        is_active    = true
    where company_id = v_company_id
      and auth_user_id is null
      and lower(email) = lower(coalesce(nullif(v_user.email, ''), v_user.id::text || '@no-email.local'));

    insert into public.app_users (company_id, auth_user_id, email, full_name, role)
    values (
      v_company_id,
      v_user.id,
      coalesce(nullif(v_user.email, ''), v_user.id::text || '@no-email.local'),
      coalesce(
        nullif(v_user.meta->>'full_name', ''),
        split_part(coalesce(nullif(v_user.email, ''), 'Owner'), '@', 1)
      ),
      'owner'
    )
    on conflict (auth_user_id) do update
    set company_id = excluded.company_id,
        role       = 'owner',
        is_active  = true;

    insert into public.company_settings (company_id)
    values (v_company_id)
    on conflict (company_id) do nothing;

    if v_has_taxpayer_type and v_user.meta->>'taxpayer_type' in ('regular', 'composition') then
      update public.company_settings
      set taxpayer_type = v_user.meta->>'taxpayer_type'
      where company_id = v_company_id;
    end if;

    -- Same JWT-size reason as the trigger.
    update auth.users
    set raw_user_meta_data = raw_user_meta_data - 'company_logo'
    where id = v_user.id
      and raw_user_meta_data ? 'company_logo';

    v_repaired := v_repaired + 1;
    raise notice 'Repaired owner profile for %', coalesce(v_user.email, v_user.id::text);
  end loop;

  raise notice 'Owner profiles repaired: %', v_repaired;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Wake up profiles that exist but can't sign in
-- ---------------------------------------------------------------------------
-- get_current_profile() also requires role = 'owner', app_users.is_active and
-- companies.is_active — so a row that exists but is switched off produces the
-- very same "Profile not found". Every auth.users row in this app is an owner
-- (auditors live in public.auditors), so anything else here is leftover state.

do $$
declare
  v_row   record;
  v_fixed integer := 0;
begin
  for v_row in
    select a.id as app_user_id, a.company_id, a.email, a.role,
           a.is_active as user_active, c.is_active as company_active
    from public.app_users a
    join auth.users  u on u.id = a.auth_user_id
    join public.companies c on c.id = a.company_id
    where a.role <> 'owner'
       or a.is_active is not true
       or c.is_active is not true
  loop
    update public.app_users
    set role = 'owner', is_active = true
    where id = v_row.app_user_id;

    update public.companies
    set is_active = true
    where id = v_row.company_id;

    v_fixed := v_fixed + 1;
    raise notice 'Re-enabled owner profile for % (was role=%, user_active=%, company_active=%)',
      v_row.email, v_row.role, v_row.user_active, v_row.company_active;
  end loop;

  raise notice 'Owner profiles re-enabled: %', v_fixed;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3b. Shrink oversized access tokens (the other cause of "Profile not found")
-- ---------------------------------------------------------------------------
-- Supabase embeds raw_user_meta_data in every JWT. Signup put the base64 company
-- logo there, which produced access tokens of ~100 KB — far past the ~32 KB
-- header limit, so Cloudflare answers 520 and the Authorization header never
-- reaches PostgREST. The RPC then runs with no user: auth.uid() is NULL and
-- get_current_profile() correctly reports "Profile not found" even though the
-- rows are perfectly fine. The rows above only fix half the problem; this fixes
-- the other half, for every account rather than just repaired ones.
--
-- Same statements as supabase_fix_header_too_large.sql. The logo lives in
-- public.companies (where the app reads it), so stripping it changes no UI.

update public.companies c
set company_logo = nullif(u.raw_user_meta_data->>'company_logo', '')
from auth.users u
where u.id = c.owner_auth_user_id
  and coalesce(c.company_logo, '') = ''
  and nullif(u.raw_user_meta_data->>'company_logo', '') is not null;

update auth.users
set raw_user_meta_data = raw_user_meta_data - 'company_logo'
where raw_user_meta_data ? 'company_logo';

-- ---------------------------------------------------------------------------
-- 4. Refresh get_current_profile() to the definition the app expects
-- ---------------------------------------------------------------------------
-- Same shape as supabase_fresh_start.sql / supabase_signup_repair.sql (they are
-- identical), and AuthContext is its only caller — so this cannot change any
-- field the app reads. It just rules out an out-of-date copy in this database.

create or replace function public.get_current_profile()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile jsonb;
begin
  select jsonb_build_object(
    'id', u.id,
    'email', u.email,
    'full_name', u.full_name,
    'role', u.role,
    'company_id', c.id,
    'company_name', c.company_name,
    'company_gstin', c.gstin,
    'company_logo', c.company_logo,
    'is_active', u.is_active
  )
  into v_profile
  from public.app_users u
  join public.companies c on c.id = u.company_id
  where u.auth_user_id = auth.uid()
    and u.role = 'owner'
    and u.is_active = true
    and c.is_active = true;

  if v_profile is null then
    return jsonb_build_object('success', false, 'error', 'Profile not found');
  end if;

  return jsonb_build_object('success', true, 'profile', v_profile);
end;
$$;

grant execute on function public.get_current_profile() to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Status report — every auth account and whether it can now sign in
-- ---------------------------------------------------------------------------
-- `status` = 'ok' means get_current_profile() will succeed for that account.
-- If a row says 'ok' and the app still shows "Profile not found", the function
-- itself is out of date in this database — check it with:
--   select pg_get_functiondef(p.oid)
--   from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public' and p.proname = 'get_current_profile';

select
  u.email,
  u.email_confirmed_at is not null as email_confirmed,
  a.id is not null                 as has_app_user,
  c.id is not null                 as has_company,
  -- Should be false and small (~a few hundred bytes) for everyone. A large
  -- number here means the JWT is oversized and requests will be rejected
  -- upstream, which also surfaces as "Profile not found".
  u.raw_user_meta_data ? 'company_logo'        as logo_in_jwt,
  octet_length(u.raw_user_meta_data::text)     as metadata_bytes,
  exists (select 1 from public.user_mpins m where m.auth_user_id = u.id) as mpin_set,
  case
    when a.id is null                then 'MISSING app_users row'
    when c.id is null                then 'MISSING company row'
    when a.is_active is not true     then 'owner deactivated'
    when c.is_active is not true     then 'company deactivated'
    else 'ok'
  end as status
from auth.users u
left join public.app_users a on a.auth_user_id = u.id and a.role = 'owner'
left join public.companies c on c.id = a.company_id
order by u.created_at desc;
