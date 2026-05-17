-- Repair Supabase Auth signup trigger for GSTInvoice Pro.
-- Run this in Supabase SQL Editor if signup returns:
-- AuthApiError: Database error saving new user

create extension if not exists pgcrypto;

alter table public.companies add column if not exists company_logo text;

-- Ensure existing databases have the app_users columns used by owner signup
-- and auditor login/management.
alter table public.app_users add column if not exists auth_user_id uuid;
alter table public.app_users add column if not exists password_hash text;
alter table public.app_users add column if not exists last_login timestamptz;
alter table public.app_users add column if not exists created_by uuid;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and conname = 'app_users_auth_user_id_key'
  ) then
    alter table public.app_users
      add constraint app_users_auth_user_id_key unique (auth_user_id);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and conname = 'app_users_auth_user_id_fkey'
  ) then
    alter table public.app_users
      add constraint app_users_auth_user_id_fkey
      foreign key (auth_user_id) references auth.users(id) on delete cascade;
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.app_users'::regclass
      and conname = 'app_users_created_by_fkey'
  ) then
    alter table public.app_users
      add constraint app_users_created_by_fkey
      foreign key (created_by) references public.app_users(id) on delete set null;
  end if;
end;
$$;

do $$
declare
  trigger_record record;
begin
  for trigger_record in
    select t.tgname
    from pg_trigger t
    join pg_proc p on p.oid = t.tgfoid
    join pg_namespace n on n.oid = p.pronamespace
    where t.tgrelid = 'auth.users'::regclass
      and not t.tgisinternal
      and n.nspname = 'public'
  loop
    execute format('drop trigger if exists %I on auth.users', trigger_record.tgname);
  end loop;
end;
$$;

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

  return new;
end;
$$;

create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_owner();

-- Optional verification. This should return one row named on_auth_user_created.
select
  t.tgname as trigger_name,
  p.proname as function_name
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
where t.tgrelid = 'auth.users'::regclass
  and not t.tgisinternal;

-- Make sure owner login returns current company details used by the sidebar.
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
