-- ============================================================================
-- Bifurcation migration: move auditors into their own table
-- ============================================================================
-- Run this once in the Supabase SQL editor (after the credit/debit notes
-- migration if you haven't already).
--
-- What it does:
--   1. Creates a dedicated `auditors` table
--   2. Copies existing auditor rows from `app_users` (preserving UUIDs)
--   3. Re-targets the `auditor_permissions.auditor_id` FK to point at `auditors`
--   4. Deletes the auditor rows out of `app_users` so it only contains owners
--   5. Locks the `app_users.role` check to `'owner'` going forward
--   6. Drops any audit_logs FK that still pointed at app_users (auditor ids
--      now live in a different table; we keep the user_id column as a plain
--      uuid since logs can come from either side)
--   7. Replaces every RPC that touched app_users for auditor purposes:
--        verify_auditor_login, create_auditor, update_auditor, delete_auditor,
--        refresh_auditor_session, get_auditor_profile, update_auditor_profile,
--        update_auditor_password, get_company_settings, auditor_data_request
--
-- Safe to re-run — table creation is idempotent; existing rows are skipped
-- via on conflict do nothing; FK retarget guards against missing constraints.
-- ============================================================================

begin;

-- 1. New table ---------------------------------------------------------------

create table if not exists public.auditors (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  email text not null,
  full_name text not null,
  password_hash text,
  is_active boolean not null default true,
  last_login timestamptz,
  created_by uuid references public.app_users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, email)
);

create index if not exists idx_auditors_company on public.auditors(company_id);
create index if not exists idx_auditors_email_lower on public.auditors(lower(email));

drop trigger if exists auditors_touch_updated on public.auditors;
create trigger auditors_touch_updated
  before update on public.auditors
  for each row execute function public.touch_updated_at();

-- 2. Copy existing auditor rows out of app_users -----------------------------
-- Preserve the original UUID so sessions, audit_log entries and the
-- auditor_permissions.auditor_id values keep their identity.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_users'
      and column_name = 'role'
  ) then
    insert into public.auditors (
      id, company_id, email, full_name, password_hash,
      is_active, last_login, created_by, created_at, updated_at
    )
    select
      id, company_id, email, full_name, password_hash,
      is_active, last_login, created_by, created_at, updated_at
    from public.app_users
    where role = 'auditor'
    on conflict (id) do nothing;
  end if;
end $$;

-- 3. Retarget auditor_permissions FK ----------------------------------------
-- Drop any existing FK that points at app_users and add a new one to auditors.

do $$
declare
  v_fk text;
begin
  select conname into v_fk
  from pg_constraint
  where conrelid = 'public.auditor_permissions'::regclass
    and contype  = 'f'
    and confrelid = 'public.app_users'::regclass;

  if v_fk is not null then
    execute format('alter table public.auditor_permissions drop constraint %I', v_fk);
  end if;
end $$;

alter table public.auditor_permissions
  drop constraint if exists auditor_permissions_auditor_id_fkey;

alter table public.auditor_permissions
  add constraint auditor_permissions_auditor_id_fkey
  foreign key (auditor_id) references public.auditors(id) on delete cascade;

-- 4. Remove auditor rows from app_users -------------------------------------

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_users'
      and column_name = 'role'
  ) then
    delete from public.app_users where role = 'auditor';
  end if;
end $$;

-- 5. Lock app_users.role to 'owner' so it can't drift back ------------------

do $$
declare
  v_fk text;
begin
  select conname into v_fk
  from pg_constraint
  where conrelid = 'public.app_users'::regclass
    and contype  = 'c'
    and conname like '%role%';

  if v_fk is not null then
    execute format('alter table public.app_users drop constraint %I', v_fk);
  end if;
end $$;

alter table public.app_users
  add constraint app_users_role_check check (role = 'owner');

-- 6. Loosen audit_logs.user_id FK if it pointed at app_users ----------------
-- (Auditor ids now live in a different table; we keep the column as a free
-- uuid so log rows from either side can coexist.)

do $$
declare
  v_fk text;
begin
  select conname into v_fk
  from pg_constraint
  where conrelid = 'public.audit_logs'::regclass
    and contype  = 'f'
    and confrelid = 'public.app_users'::regclass;

  if v_fk is not null then
    execute format('alter table public.audit_logs drop constraint %I', v_fk);
  end if;
exception
  when undefined_table then null;  -- audit_logs may not exist yet
end $$;

-- 7. RLS ---------------------------------------------------------------------

alter table public.auditors enable row level security;

drop policy if exists "owner auditors access" on public.auditors;
create policy "owner auditors access" on public.auditors
  for all
  using (company_id = public.current_company_id())
  with check (company_id = public.current_company_id());

-- And re-do the owner policy on auditor_permissions to traverse the new table

drop policy if exists "owner auditor permissions access" on public.auditor_permissions;
create policy "owner auditor permissions access" on public.auditor_permissions
  for all
  using (
    exists (
      select 1 from public.auditors a
      where a.id = auditor_id
        and a.company_id = public.current_company_id()
    )
  )
  with check (
    exists (
      select 1 from public.auditors a
      where a.id = auditor_id
        and a.company_id = public.current_company_id()
    )
  );

commit;

-- =============================================================================
-- Rebuild the RPCs to query public.auditors instead of public.app_users
-- =============================================================================

create or replace function public.verify_auditor_login(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.auditors;
  v_permissions jsonb;
begin
  select *
  into v_auditor
  from public.auditors
  where lower(email) = lower(p_email)
    and is_active = true
    and password_hash = crypt(p_password, password_hash)
  limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Invalid email or password');
  end if;

  update public.auditors set last_login = now() where id = v_auditor.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'permission_name', permission_name,
    'can_view',   can_view,
    'can_create', can_create,
    'can_edit',   can_edit,
    'can_delete', can_delete
  )), '[]'::jsonb)
  into v_permissions
  from public.auditor_permissions
  where auditor_id = v_auditor.id;

  return jsonb_build_object(
    'success', true,
    'auditor', jsonb_build_object(
      'id',           v_auditor.id,
      'email',        v_auditor.email,
      'full_name',    v_auditor.full_name,
      'role',         'auditor',
      'company_id',   v_auditor.company_id,
      'company_name', (select company_name from public.companies where id = v_auditor.company_id),
      'company_gstin',(select gstin        from public.companies where id = v_auditor.company_id),
      'company_logo', (select company_logo from public.companies where id = v_auditor.company_id),
      'permissions',  v_permissions
    )
  );
end;
$$;

create or replace function public.refresh_auditor_session(p_auditor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.auditors;
  v_permissions jsonb;
begin
  select *
  into v_auditor
  from public.auditors
  where id = p_auditor_id
    and is_active = true
  limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Auditor session is no longer active');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'permission_name', permission_name,
    'can_view',   can_view,
    'can_create', can_create,
    'can_edit',   can_edit,
    'can_delete', can_delete
  )), '[]'::jsonb)
  into v_permissions
  from public.auditor_permissions
  where auditor_id = v_auditor.id;

  return jsonb_build_object(
    'success', true,
    'auditor', jsonb_build_object(
      'id',           v_auditor.id,
      'email',        v_auditor.email,
      'full_name',    v_auditor.full_name,
      'role',         'auditor',
      'company_id',   v_auditor.company_id,
      'company_name', (select company_name from public.companies where id = v_auditor.company_id),
      'company_gstin',(select gstin        from public.companies where id = v_auditor.company_id),
      'company_logo', (select company_logo from public.companies where id = v_auditor.company_id),
      'permissions',  v_permissions
    )
  );
end;
$$;

create or replace function public.create_auditor(
  p_full_name text,
  p_email text,
  p_password text,
  p_permissions text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
  v_owner_id uuid;
  v_auditor_id uuid;
  v_permission text;
begin
  select id, company_id
  into v_owner_id, v_company_id
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner'
    and is_active = true
  limit 1;

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'Only an active owner can create auditors');
  end if;

  insert into public.auditors (
    company_id, email, full_name, password_hash, created_by
  ) values (
    v_company_id,
    lower(p_email),
    p_full_name,
    crypt(p_password, gen_salt('bf')),
    v_owner_id
  )
  returning id into v_auditor_id;

  foreach v_permission in array p_permissions loop
    insert into public.auditor_permissions (
      auditor_id, permission_name, can_view, can_create, can_edit, can_delete
    ) values (
      v_auditor_id, v_permission, true, true, true, false
    )
    on conflict (auditor_id, permission_name) do nothing;
  end loop;

  return jsonb_build_object('success', true, 'auditor_id', v_auditor_id);
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'An auditor with this email already exists');
end;
$$;

create or replace function public.update_auditor(
  p_auditor_id uuid,
  p_full_name text,
  p_email text,
  p_password text default null,
  p_permissions text[] default array[]::text[]
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_company_id uuid;
  v_permission text;
begin
  v_company_id := public.current_company_id();
  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'Only an active owner can update auditors');
  end if;

  update public.auditors
  set
    full_name = p_full_name,
    email     = lower(p_email),
    password_hash = case
      when nullif(p_password, '') is null then password_hash
      else crypt(p_password, gen_salt('bf'))
    end
  where id = p_auditor_id
    and company_id = v_company_id;

  delete from public.auditor_permissions where auditor_id = p_auditor_id;

  foreach v_permission in array p_permissions loop
    insert into public.auditor_permissions (
      auditor_id, permission_name, can_view, can_create, can_edit, can_delete
    ) values (
      p_auditor_id, v_permission, true, true, true, false
    );
  end loop;

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.delete_auditor(p_auditor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
begin
  delete from public.auditors
  where id = p_auditor_id
    and company_id = public.current_company_id();

  return jsonb_build_object('success', true);
end;
$$;

create or replace function public.get_auditor_profile(p_auditor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.auditors;
  v_company public.companies;
begin
  select * into v_auditor from public.auditors
  where id = p_auditor_id and is_active = true limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Auditor session is not active');
  end if;

  select * into v_company from public.companies
  where id = v_auditor.company_id and is_active = true limit 1;

  return jsonb_build_object(
    'success', true,
    'profile', jsonb_build_object(
      'id', v_auditor.id,
      'email', v_auditor.email,
      'full_name', v_auditor.full_name,
      'role', 'auditor'
    ),
    'company', jsonb_build_object(
      'id',           v_company.id,
      'company_name', v_company.company_name,
      'gstin',        v_company.gstin,
      'pan',          v_company.pan,
      'phone',        v_company.phone,
      'address',      v_company.address,
      'city',         v_company.city,
      'state',        v_company.state,
      'pin_code',     v_company.pin_code,
      'company_logo', v_company.company_logo
    )
  );
end;
$$;

create or replace function public.update_auditor_profile(
  p_auditor_id uuid,
  p_full_name  text,
  p_email      text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.auditors;
begin
  select * into v_auditor from public.auditors
  where id = p_auditor_id and is_active = true limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Auditor session is not active');
  end if;

  update public.auditors set
    full_name = nullif(trim(p_full_name), ''),
    email     = lower(trim(p_email))
  where id = v_auditor.id;

  begin
    insert into public.audit_logs (
      company_id, user_id, user_email, user_role, action, resource_type,
      resource_id, resource_name, details
    ) values (
      v_auditor.company_id, v_auditor.id, lower(trim(p_email)),
      'auditor', 'update_profile', 'profile', v_auditor.id,
      nullif(trim(p_full_name), ''), jsonb_build_object('email', lower(trim(p_email)))
    );
  exception
    when undefined_table then null;
  end;

  return jsonb_build_object('success', true);
exception
  when unique_violation then
    return jsonb_build_object('success', false, 'error', 'This email is already used in this company');
end;
$$;

create or replace function public.update_auditor_password(
  p_auditor_id uuid,
  p_current_password text,
  p_new_password text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.auditors;
begin
  select * into v_auditor from public.auditors
  where id = p_auditor_id and is_active = true limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Auditor session is not active');
  end if;

  if v_auditor.password_hash is null
    or v_auditor.password_hash <> crypt(p_current_password, v_auditor.password_hash) then
    return jsonb_build_object('success', false, 'error', 'Current password is incorrect');
  end if;

  if length(coalesce(p_new_password, '')) < 8 then
    return jsonb_build_object('success', false, 'error', 'New password must be at least 8 characters');
  end if;

  update public.auditors
  set password_hash = crypt(p_new_password, gen_salt('bf'))
  where id = v_auditor.id;

  begin
    insert into public.audit_logs (
      company_id, user_id, user_email, user_role, action, resource_type,
      resource_id, resource_name, details
    ) values (
      v_auditor.company_id, v_auditor.id, v_auditor.email,
      'auditor', 'update_password', 'profile', v_auditor.id, v_auditor.full_name, '{}'::jsonb
    );
  exception
    when undefined_table then null;
  end;

  return jsonb_build_object('success', true);
end;
$$;

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

-- ----------------------------------------------------------------------------
-- auditor_data_request — the big one. Body is unchanged except for:
--   * v_auditor type is now public.auditors
--   * lookup queries public.auditors (no role filter needed)
--   * audit_logs.user_role is hard-coded to 'auditor'
-- ----------------------------------------------------------------------------

create or replace function public.auditor_data_request(
  p_auditor_id uuid,
  p_module     text,
  p_resource   text,
  p_action     text,
  p_payload    jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.auditors;
  v_allowed boolean;
  v_data jsonb := 'null'::jsonb;
  v_record jsonb;
  v_values jsonb;
  v_match  jsonb;
  v_id uuid;
  v_action_column text;
  v_log_action text;
  v_resource_name text;
begin
  select *
  into v_auditor
  from public.auditors
  where id = p_auditor_id
    and is_active = true
  limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Auditor session is not active');
  end if;

  v_action_column := case p_action
    when 'select' then 'can_view'
    when 'insert' then 'can_create'
    when 'update' then 'can_edit'
    when 'delete' then 'can_delete'
    when 'log'    then 'can_view'
    else null
  end;

  if v_action_column is null then
    return jsonb_build_object('success', false, 'error', 'Unsupported auditor action');
  end if;

  execute format(
    'select exists (
       select 1 from public.auditor_permissions
       where auditor_id = $1 and permission_name = $2 and %I = true
     )',
    v_action_column
  )
  using v_auditor.id, p_module
  into v_allowed;

  if p_module = 'dashboard' and p_action = 'select' then
    v_allowed := exists (
      select 1 from public.auditor_permissions
      where auditor_id = v_auditor.id
        and permission_name in ('dashboard', 'invoices')
        and can_view = true
    );
  end if;

  if not v_allowed then
    return jsonb_build_object('success', false, 'error', 'You do not have permission for this action');
  end if;

  v_record         := coalesce(p_payload->'record', '{}'::jsonb);
  v_values         := coalesce(p_payload->'values', '{}'::jsonb);
  v_match          := coalesce(p_payload->'match',  '{}'::jsonb);
  v_log_action     := coalesce(p_payload->>'logAction', p_action);
  v_resource_name  := nullif(p_payload->>'auditName', '');

  if p_action = 'select' and p_resource = 'customers' then
    select coalesce(jsonb_agg(to_jsonb(c) order by c.name), '[]'::jsonb)
    into v_data
    from public.customers c
    where c.company_id = v_auditor.company_id
      and c.is_active = true;

  elsif p_action = 'select' and p_resource = 'items' then
    select coalesce(jsonb_agg(to_jsonb(i) order by i.name), '[]'::jsonb)
    into v_data
    from public.items i
    where i.company_id = v_auditor.company_id
      and i.is_active = true;

  elsif p_action = 'select' and p_resource = 'invoices' then
    select coalesce(jsonb_agg(
      to_jsonb(i)
      || jsonb_build_object(
        'customers', case when c.id is null then null else to_jsonb(c) end,
        'invoice_items', coalesce((
          select jsonb_agg(to_jsonb(ii) order by ii.sort_order)
          from public.invoice_items ii
          where ii.invoice_id = i.id
        ), '[]'::jsonb)
      )
      order by i.invoice_date desc, i.created_at desc
    ), '[]'::jsonb)
    into v_data
    from public.invoices i
    left join public.customers c on c.id = i.customer_id
    where i.company_id = v_auditor.company_id;

  elsif p_action = 'insert' and p_resource = 'customers' then
    insert into public.customers (
      company_id, name, customer_type, gstin, pan, contact_name, email, phone, city, address
    ) values (
      v_auditor.company_id,
      v_record->>'name',
      coalesce(v_record->>'customer_type', 'B2B'),
      v_record->>'gstin',
      coalesce(nullif(v_record->>'pan', ''),
        case when length(coalesce(v_record->>'gstin', '')) >= 12
             then substring(v_record->>'gstin' from 3 for 10)
             else null end),
      v_record->>'contact_name',
      v_record->>'email',
      v_record->>'phone',
      v_record->>'city',
      v_record->>'address'
    )
    returning id into v_id;
    select to_jsonb(c) into v_data from public.customers c where c.id = v_id;

  elsif p_action = 'update' and p_resource = 'customers' then
    v_id := (v_match->>'id')::uuid;
    update public.customers
    set
      name          = coalesce(v_values->>'name',          name),
      customer_type = coalesce(v_values->>'customer_type', customer_type),
      gstin         = coalesce(v_values->>'gstin',         gstin),
      pan           = coalesce(v_values->>'pan',           pan),
      contact_name  = coalesce(v_values->>'contact_name',  contact_name),
      email         = coalesce(v_values->>'email',         email),
      phone         = coalesce(v_values->>'phone',         phone),
      city          = coalesce(v_values->>'city',          city),
      address       = coalesce(v_values->>'address',       address)
    where id = v_id and company_id = v_auditor.company_id
    returning id into v_id;
    select to_jsonb(c) into v_data from public.customers c where c.id = v_id;

  elsif p_action = 'delete' and p_resource = 'customers' then
    v_id := (v_match->>'id')::uuid;
    delete from public.customers
    where id = v_id and company_id = v_auditor.company_id
    returning id into v_id;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'insert' and p_resource = 'items' then
    insert into public.items (
      company_id, name, type, description, hsn, unit, selling_price, purchase_price, gst_rate, stock
    ) values (
      v_auditor.company_id,
      v_record->>'name',
      coalesce(v_record->>'type', 'product'),
      nullif(v_record->>'description', ''),
      nullif(v_record->>'hsn', ''),
      coalesce(v_record->>'unit', 'Nos'),
      coalesce((v_record->>'selling_price')::numeric, 0),
      coalesce((v_record->>'purchase_price')::numeric, 0),
      coalesce((v_record->>'gst_rate')::numeric, 0),
      case when v_record ? 'stock'
           then nullif(v_record->>'stock', '')::numeric
           else null end
    )
    returning id into v_id;
    select to_jsonb(i) into v_data from public.items i where i.id = v_id;

  elsif p_action = 'update' and p_resource = 'items' then
    v_id := (v_match->>'id')::uuid;
    update public.items
    set
      name           = coalesce(v_values->>'name', name),
      type           = coalesce(v_values->>'type', type),
      description    = case when v_values ? 'description' then nullif(v_values->>'description', '') else description end,
      hsn            = case when v_values ? 'hsn'         then nullif(v_values->>'hsn', '')         else hsn end,
      unit           = coalesce(v_values->>'unit', unit),
      selling_price  = case when v_values ? 'selling_price'  then (v_values->>'selling_price')::numeric  else selling_price end,
      purchase_price = case when v_values ? 'purchase_price' then (v_values->>'purchase_price')::numeric else purchase_price end,
      gst_rate       = case when v_values ? 'gst_rate'       then (v_values->>'gst_rate')::numeric       else gst_rate end,
      stock          = case when v_values ? 'stock' and nullif(v_values->>'stock', '') is not null
                            then (v_values->>'stock')::numeric
                            else stock end
    where id = v_id and company_id = v_auditor.company_id
    returning id into v_id;
    select to_jsonb(i) into v_data from public.items i where i.id = v_id;

  elsif p_action = 'delete' and p_resource = 'items' then
    v_id := (v_match->>'id')::uuid;
    update public.items
    set is_active = false
    where id = v_id and company_id = v_auditor.company_id
    returning id into v_id;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'insert' and p_resource = 'invoices' then
    insert into public.invoices (
      company_id, customer_id, invoice_number, invoice_date, due_date, customer_type, bill_type,
      place_of_supply, reverse_charge, po_number, po_date, vehicle_number, transport_mode,
      remarks, terms, subtotal, cgst, sgst, igst, total_tax, total_amount, paid_amount, status,
      is_manual_number, created_by
    ) values (
      v_auditor.company_id,
      nullif(v_record->>'customer_id', '')::uuid,
      v_record->>'invoice_number',
      (v_record->>'invoice_date')::date,
      nullif(v_record->>'due_date', '')::date,
      v_record->>'customer_type',
      v_record->>'bill_type',
      nullif(v_record->>'place_of_supply', ''),
      coalesce((v_record->>'reverse_charge')::boolean, false),
      nullif(v_record->>'po_number', ''),
      nullif(v_record->>'po_date', '')::date,
      nullif(v_record->>'vehicle_number', ''),
      nullif(v_record->>'transport_mode', ''),
      nullif(v_record->>'remarks', ''),
      nullif(v_record->>'terms', ''),
      coalesce((v_record->>'subtotal')::numeric, 0),
      coalesce((v_record->>'cgst')::numeric, 0),
      coalesce((v_record->>'sgst')::numeric, 0),
      coalesce((v_record->>'igst')::numeric, 0),
      coalesce((v_record->>'total_tax')::numeric, 0),
      coalesce((v_record->>'total_amount')::numeric, 0),
      coalesce((v_record->>'paid_amount')::numeric, 0),
      coalesce(v_record->>'status', 'draft'),
      coalesce((v_record->>'is_manual_number')::boolean, false),
      v_auditor.id
    )
    returning id into v_id;
    select jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number)
    into v_data
    from public.invoices i
    where i.id = v_id;
    v_resource_name := coalesce(v_resource_name, v_data->>'invoice_number');

  elsif p_action = 'insert' and p_resource = 'invoice_items' then
    insert into public.invoice_items (
      invoice_id, item_id, item_name, description, hsn, quantity, unit, rate,
      discount_percent, gst_rate, taxable_amount, tax_amount, total_amount, sort_order
    )
    select
      (item->>'invoice_id')::uuid,
      nullif(item->>'item_id', '')::uuid,
      item->>'item_name',
      nullif(item->>'description', ''),
      nullif(item->>'hsn', ''),
      coalesce((item->>'quantity')::numeric, 0),
      coalesce(item->>'unit', 'Nos'),
      coalesce((item->>'rate')::numeric, 0),
      coalesce((item->>'discount_percent')::numeric, 0),
      coalesce((item->>'gst_rate')::numeric, 0),
      coalesce((item->>'taxable_amount')::numeric, 0),
      coalesce((item->>'tax_amount')::numeric, 0),
      coalesce((item->>'total_amount')::numeric, 0),
      coalesce((item->>'sort_order')::int, 0)
    from jsonb_array_elements(v_record) as item
    where exists (
      select 1 from public.invoices i
      where i.id = (item->>'invoice_id')::uuid
        and i.company_id = v_auditor.company_id
    );
    v_data := jsonb_build_object('inserted', jsonb_array_length(v_record));

  elsif p_action = 'update' and p_resource = 'invoices' then
    v_id := (v_match->>'id')::uuid;
    update public.invoices
    set
      status      = coalesce(v_values->>'status', status),
      paid_amount = case when v_values ? 'paid_amount' then (v_values->>'paid_amount')::numeric else paid_amount end
    where id = v_id and company_id = v_auditor.company_id
    returning id, invoice_number into v_id, v_resource_name;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'delete' and p_resource = 'invoices' then
    v_id := (v_match->>'id')::uuid;
    delete from public.invoices
    where id = v_id and company_id = v_auditor.company_id
    returning id, invoice_number into v_id, v_resource_name;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'select' and p_resource = 'delivery_challans' then
    select coalesce(jsonb_agg(
      to_jsonb(dc)
      || jsonb_build_object(
        'customers', case when c.id is null then null else to_jsonb(c) end,
        'invoices', case when i.id is null then null
                    else jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number) end,
        'delivery_challan_items', coalesce((
          select jsonb_agg(to_jsonb(dci) order by dci.sort_order)
          from public.delivery_challan_items dci
          where dci.delivery_challan_id = dc.id
        ), '[]'::jsonb)
      )
      order by dc.challan_date desc, dc.created_at desc
    ), '[]'::jsonb)
    into v_data
    from public.delivery_challans dc
    left join public.customers c on c.id = dc.customer_id
    left join public.invoices  i on i.id = dc.invoice_id
    where dc.company_id = v_auditor.company_id;

  elsif p_action = 'insert' and p_resource = 'delivery_challans' then
    insert into public.delivery_challans (
      company_id, customer_id, consignee_name, consignee_gstin, consignee_address,
      consignee_state, invoice_id, challan_number, challan_date, purpose,
      ship_to_address, place_of_supply, is_final_consignment, expected_return_date,
      reason, transport_mode, vehicle_number, transporter_name, lr_number,
      eway_bill_number, subtotal, cgst, sgst, igst, total_tax, total_amount,
      notes, status, created_by
    ) values (
      v_auditor.company_id,
      nullif(v_record->>'customer_id', '')::uuid,
      v_record->>'consignee_name',
      nullif(v_record->>'consignee_gstin', ''),
      nullif(v_record->>'consignee_address', ''),
      nullif(v_record->>'consignee_state', ''),
      nullif(v_record->>'invoice_id', '')::uuid,
      v_record->>'challan_number',
      (v_record->>'challan_date')::date,
      v_record->>'purpose',
      nullif(v_record->>'ship_to_address', ''),
      nullif(v_record->>'place_of_supply', ''),
      coalesce((v_record->>'is_final_consignment')::boolean, false),
      nullif(v_record->>'expected_return_date', '')::date,
      nullif(v_record->>'reason', ''),
      nullif(v_record->>'transport_mode', ''),
      nullif(v_record->>'vehicle_number', ''),
      nullif(v_record->>'transporter_name', ''),
      nullif(v_record->>'lr_number', ''),
      nullif(v_record->>'eway_bill_number', ''),
      coalesce((v_record->>'subtotal')::numeric, 0),
      coalesce((v_record->>'cgst')::numeric, 0),
      coalesce((v_record->>'sgst')::numeric, 0),
      coalesce((v_record->>'igst')::numeric, 0),
      coalesce((v_record->>'total_tax')::numeric, 0),
      coalesce((v_record->>'total_amount')::numeric, 0),
      nullif(v_record->>'notes', ''),
      coalesce(v_record->>'status', 'draft'),
      v_auditor.id
    )
    returning id into v_id;
    select jsonb_build_object('id', dc.id, 'challan_number', dc.challan_number)
    into v_data
    from public.delivery_challans dc
    where dc.id = v_id;
    v_resource_name := coalesce(v_resource_name, v_data->>'challan_number');

  elsif p_action = 'insert' and p_resource = 'delivery_challan_items' then
    insert into public.delivery_challan_items (
      delivery_challan_id, invoice_item_id, item_id, item_name, description, hsn,
      quantity, is_provisional_quantity, unit, rate, discount_percent, gst_rate,
      taxable_amount, tax_amount, total_amount, sort_order
    )
    select
      (item->>'delivery_challan_id')::uuid,
      nullif(item->>'invoice_item_id', '')::uuid,
      nullif(item->>'item_id', '')::uuid,
      item->>'item_name',
      nullif(item->>'description', ''),
      nullif(item->>'hsn', ''),
      coalesce((item->>'quantity')::numeric, 0),
      coalesce((item->>'is_provisional_quantity')::boolean, false),
      nullif(item->>'unit', ''),
      coalesce((item->>'rate')::numeric, 0),
      coalesce((item->>'discount_percent')::numeric, 0),
      coalesce((item->>'gst_rate')::numeric, 0),
      coalesce((item->>'taxable_amount')::numeric, 0),
      coalesce((item->>'tax_amount')::numeric, 0),
      coalesce((item->>'total_amount')::numeric, 0),
      coalesce((item->>'sort_order')::int, 0)
    from jsonb_array_elements(v_record) as item
    where exists (
      select 1 from public.delivery_challans dc
      where dc.id = (item->>'delivery_challan_id')::uuid
        and dc.company_id = v_auditor.company_id
    );
    v_data := jsonb_build_object('inserted', jsonb_array_length(v_record));

  elsif p_action = 'update' and p_resource = 'delivery_challans' then
    -- Issued challans are never amended (no provision to amend a document that
    -- has travelled with the goods) — only cancelled, or linked to the invoice
    -- raised later for an approval / quantity_unknown challan.
    v_id := (v_match->>'id')::uuid;
    update public.delivery_challans
    set
      status     = coalesce(v_values->>'status', status),
      invoice_id = case when v_values ? 'invoice_id'
                        then nullif(v_values->>'invoice_id', '')::uuid
                        else invoice_id end
    where id = v_id and company_id = v_auditor.company_id
    returning id, challan_number into v_id, v_resource_name;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'delete' and p_resource = 'delivery_challans' then
    v_id := (v_match->>'id')::uuid;
    delete from public.delivery_challans
    where id = v_id and company_id = v_auditor.company_id
    returning id, challan_number into v_id, v_resource_name;
    v_data := jsonb_build_object('id', v_id);

  -- --------------------------------------------------------------------------
  -- Credit notes / debit notes / receipts.
  --
  -- These resources were reachable from the UI but had no branch here, so every
  -- auditor call fell through to 'Unsupported resource request' — auditors could
  -- not use the credit-notes or receipts modules at all.
  --
  -- Item payloads arrive as an array (note items) or a bare object (a receipt
  -- allocation), so each item branch normalises before jsonb_array_elements,
  -- which errors on an object.
  -- --------------------------------------------------------------------------

  elsif p_action = 'select' and p_resource = 'credit_notes' then
    select coalesce(jsonb_agg(
      to_jsonb(n)
      || jsonb_build_object(
        'customers', case when c.id is null then null else to_jsonb(c) end,
        'invoices', case when i.id is null then null
                    else jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number) end,
        'credit_note_items', coalesce((
          select jsonb_agg(to_jsonb(ni))
          from public.credit_note_items ni
          where ni.credit_note_id = n.id
        ), '[]'::jsonb)
      )
      order by n.note_date desc, n.created_at desc
    ), '[]'::jsonb)
    into v_data
    from public.credit_notes n
    left join public.customers c on c.id = n.customer_id
    left join public.invoices  i on i.id = n.invoice_id
    where n.company_id = v_auditor.company_id;

  elsif p_action = 'select' and p_resource = 'debit_notes' then
    select coalesce(jsonb_agg(
      to_jsonb(n)
      || jsonb_build_object(
        'customers', case when c.id is null then null else to_jsonb(c) end,
        'invoices', case when i.id is null then null
                    else jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number) end,
        'debit_note_items', coalesce((
          select jsonb_agg(to_jsonb(ni))
          from public.debit_note_items ni
          where ni.debit_note_id = n.id
        ), '[]'::jsonb)
      )
      order by n.note_date desc, n.created_at desc
    ), '[]'::jsonb)
    into v_data
    from public.debit_notes n
    left join public.customers c on c.id = n.customer_id
    left join public.invoices  i on i.id = n.invoice_id
    where n.company_id = v_auditor.company_id;

  elsif p_action = 'insert' and p_resource = 'credit_notes' then
    insert into public.credit_notes (
      company_id, customer_id, invoice_id, note_number, note_date, reason,
      subtotal, total_tax, total_amount, status
    ) values (
      v_auditor.company_id,
      nullif(v_record->>'customer_id', '')::uuid,
      nullif(v_record->>'invoice_id', '')::uuid,
      v_record->>'note_number',
      (v_record->>'note_date')::date,
      nullif(v_record->>'reason', ''),
      coalesce((v_record->>'subtotal')::numeric, 0),
      coalesce((v_record->>'total_tax')::numeric, 0),
      coalesce((v_record->>'total_amount')::numeric, 0),
      coalesce(v_record->>'status', 'draft')
    )
    returning id into v_id;
    select jsonb_build_object('id', n.id, 'note_number', n.note_number)
    into v_data
    from public.credit_notes n where n.id = v_id;
    v_resource_name := coalesce(v_resource_name, v_data->>'note_number');

  elsif p_action = 'insert' and p_resource = 'debit_notes' then
    insert into public.debit_notes (
      company_id, customer_id, invoice_id, note_number, note_date, reason,
      subtotal, total_tax, total_amount, status
    ) values (
      v_auditor.company_id,
      nullif(v_record->>'customer_id', '')::uuid,
      nullif(v_record->>'invoice_id', '')::uuid,
      v_record->>'note_number',
      (v_record->>'note_date')::date,
      nullif(v_record->>'reason', ''),
      coalesce((v_record->>'subtotal')::numeric, 0),
      coalesce((v_record->>'total_tax')::numeric, 0),
      coalesce((v_record->>'total_amount')::numeric, 0),
      coalesce(v_record->>'status', 'draft')
    )
    returning id into v_id;
    select jsonb_build_object('id', n.id, 'note_number', n.note_number)
    into v_data
    from public.debit_notes n where n.id = v_id;
    v_resource_name := coalesce(v_resource_name, v_data->>'note_number');

  elsif p_action = 'insert' and p_resource = 'credit_note_items' then
    insert into public.credit_note_items (
      credit_note_id, item_name, description, hsn, quantity, unit, rate,
      gst_rate, taxable_amount, tax_amount, total_amount
    )
    select
      (item->>'credit_note_id')::uuid,
      item->>'item_name',
      nullif(item->>'description', ''),
      nullif(item->>'hsn', ''),
      coalesce((item->>'quantity')::numeric, 0),
      nullif(item->>'unit', ''),
      coalesce((item->>'rate')::numeric, 0),
      coalesce((item->>'gst_rate')::numeric, 0),
      coalesce((item->>'taxable_amount')::numeric, 0),
      coalesce((item->>'tax_amount')::numeric, 0),
      coalesce((item->>'total_amount')::numeric, 0)
    from jsonb_array_elements(
      case when jsonb_typeof(v_record) = 'array' then v_record else jsonb_build_array(v_record) end
    ) as item
    where exists (
      select 1 from public.credit_notes n
      where n.id = (item->>'credit_note_id')::uuid
        and n.company_id = v_auditor.company_id
    );
    v_data := jsonb_build_object('inserted', jsonb_array_length(
      case when jsonb_typeof(v_record) = 'array' then v_record else jsonb_build_array(v_record) end));

  elsif p_action = 'insert' and p_resource = 'debit_note_items' then
    insert into public.debit_note_items (
      debit_note_id, item_name, description, hsn, quantity, unit, rate,
      gst_rate, taxable_amount, tax_amount, total_amount
    )
    select
      (item->>'debit_note_id')::uuid,
      item->>'item_name',
      nullif(item->>'description', ''),
      nullif(item->>'hsn', ''),
      coalesce((item->>'quantity')::numeric, 0),
      nullif(item->>'unit', ''),
      coalesce((item->>'rate')::numeric, 0),
      coalesce((item->>'gst_rate')::numeric, 0),
      coalesce((item->>'taxable_amount')::numeric, 0),
      coalesce((item->>'tax_amount')::numeric, 0),
      coalesce((item->>'total_amount')::numeric, 0)
    from jsonb_array_elements(
      case when jsonb_typeof(v_record) = 'array' then v_record else jsonb_build_array(v_record) end
    ) as item
    where exists (
      select 1 from public.debit_notes n
      where n.id = (item->>'debit_note_id')::uuid
        and n.company_id = v_auditor.company_id
    );
    v_data := jsonb_build_object('inserted', jsonb_array_length(
      case when jsonb_typeof(v_record) = 'array' then v_record else jsonb_build_array(v_record) end));

  elsif p_action = 'update' and p_resource = 'credit_notes' then
    v_id := (v_match->>'id')::uuid;
    update public.credit_notes
    set status = coalesce(v_values->>'status', status)
    where id = v_id and company_id = v_auditor.company_id
    returning id, note_number into v_id, v_resource_name;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'update' and p_resource = 'debit_notes' then
    v_id := (v_match->>'id')::uuid;
    update public.debit_notes
    set status = coalesce(v_values->>'status', status)
    where id = v_id and company_id = v_auditor.company_id
    returning id, note_number into v_id, v_resource_name;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'delete' and p_resource = 'credit_notes' then
    v_id := (v_match->>'id')::uuid;
    delete from public.credit_notes
    where id = v_id and company_id = v_auditor.company_id
    returning id, note_number into v_id, v_resource_name;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'delete' and p_resource = 'debit_notes' then
    v_id := (v_match->>'id')::uuid;
    delete from public.debit_notes
    where id = v_id and company_id = v_auditor.company_id
    returning id, note_number into v_id, v_resource_name;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'select' and p_resource = 'receipts' then
    select coalesce(jsonb_agg(
      to_jsonb(r)
      || jsonb_build_object(
        'customers', case when c.id is null then null else to_jsonb(c) end,
        'receipt_allocations', coalesce((
          select jsonb_agg(to_jsonb(ra))
          from public.receipt_allocations ra
          where ra.receipt_id = r.id
        ), '[]'::jsonb)
      )
      order by r.receipt_date desc, r.created_at desc
    ), '[]'::jsonb)
    into v_data
    from public.receipts r
    left join public.customers c on c.id = r.customer_id
    where r.company_id = v_auditor.company_id;

  elsif p_action = 'insert' and p_resource = 'receipts' then
    insert into public.receipts (
      company_id, customer_id, receipt_number, receipt_date, amount,
      payment_mode, reference_number, notes, status
    ) values (
      v_auditor.company_id,
      nullif(v_record->>'customer_id', '')::uuid,
      v_record->>'receipt_number',
      (v_record->>'receipt_date')::date,
      coalesce((v_record->>'amount')::numeric, 0),
      nullif(v_record->>'payment_mode', ''),
      nullif(v_record->>'reference_number', ''),
      nullif(v_record->>'notes', ''),
      coalesce(v_record->>'status', 'cleared')
    )
    returning id into v_id;
    select jsonb_build_object('id', r.id, 'receipt_number', r.receipt_number)
    into v_data
    from public.receipts r where r.id = v_id;
    v_resource_name := coalesce(v_resource_name, v_data->>'receipt_number');

  elsif p_action = 'insert' and p_resource = 'receipt_allocations' then
    insert into public.receipt_allocations (receipt_id, invoice_id, amount)
    select
      (item->>'receipt_id')::uuid,
      nullif(item->>'invoice_id', '')::uuid,
      coalesce((item->>'amount')::numeric, 0)
    from jsonb_array_elements(
      case when jsonb_typeof(v_record) = 'array' then v_record else jsonb_build_array(v_record) end
    ) as item
    where exists (
      select 1 from public.receipts r
      where r.id = (item->>'receipt_id')::uuid
        and r.company_id = v_auditor.company_id
    );
    v_data := jsonb_build_object('inserted', jsonb_array_length(
      case when jsonb_typeof(v_record) = 'array' then v_record else jsonb_build_array(v_record) end));

  elsif p_action = 'update' and p_resource = 'receipts' then
    v_id := (v_match->>'id')::uuid;
    update public.receipts
    set status = coalesce(v_values->>'status', status)
    where id = v_id and company_id = v_auditor.company_id
    returning id, receipt_number into v_id, v_resource_name;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'delete' and p_resource = 'receipts' then
    v_id := (v_match->>'id')::uuid;
    delete from public.receipts
    where id = v_id and company_id = v_auditor.company_id
    returning id, receipt_number into v_id, v_resource_name;
    v_data := jsonb_build_object('id', v_id);

  elsif p_action = 'log' then
    v_data := jsonb_build_object('logged', true);

  else
    return jsonb_build_object('success', false, 'error', 'Unsupported resource request');
  end if;

  begin
    insert into public.audit_logs (
      company_id, user_id, user_email, user_role, action, resource_type,
      resource_id, resource_name, details
    ) values (
      v_auditor.company_id,
      v_auditor.id,
      v_auditor.email,
      'auditor',
      v_log_action,
      p_resource,
      v_id,
      v_resource_name,
      p_payload - 'record' - 'values'
    );
  exception
    when undefined_table then null;
  end;

  return jsonb_build_object('success', true, 'data', v_data);
end;
$$;

-- Re-grant exec to authenticated/anon as before --------------------------------

grant execute on function public.verify_auditor_login(text, text)            to anon, authenticated;
grant execute on function public.refresh_auditor_session(uuid)               to anon, authenticated;
grant execute on function public.create_auditor(text, text, text, text[])    to authenticated;
grant execute on function public.update_auditor(uuid, text, text, text, text[]) to authenticated;
grant execute on function public.delete_auditor(uuid)                        to authenticated;
grant execute on function public.get_auditor_profile(uuid)                   to anon, authenticated;
grant execute on function public.update_auditor_profile(uuid, text, text)    to anon, authenticated;
grant execute on function public.update_auditor_password(uuid, text, text)   to anon, authenticated;
grant execute on function public.get_company_settings(uuid)                  to authenticated;
grant execute on function public.auditor_data_request(uuid, text, text, text, jsonb)
  to anon, authenticated;
