-- Run this in Supabase SQL Editor if creating/updating auditors fails with:
-- function gen_salt(unknown) does not exist

create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

alter table public.companies add column if not exists company_logo text;
alter table public.companies add column if not exists pan text;
alter table public.customers add column if not exists pan text;

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

create table if not exists public.company_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  invoice_prefix text not null default 'INV',
  invoice_next_number integer not null default 1,
  default_due_days integer not null default 15,
  currency text not null default 'INR',
  terms text default 'Payment due within 15 days from invoice date.',
  default_gst_rate numeric(5,2) not null default 18,
  default_place_of_supply text,
  enable_reverse_charge boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.company_settings add column if not exists invoice_prefix text not null default 'INV';
alter table public.company_settings add column if not exists invoice_next_number integer not null default 1;
alter table public.company_settings add column if not exists default_due_days integer not null default 15;
alter table public.company_settings add column if not exists currency text not null default 'INR';
alter table public.company_settings add column if not exists terms text default 'Payment due within 15 days from invoice date.';
alter table public.company_settings add column if not exists default_gst_rate numeric(5,2) not null default 18;
alter table public.company_settings add column if not exists default_place_of_supply text;
alter table public.company_settings add column if not exists enable_reverse_charge boolean not null default false;
alter table public.company_settings add column if not exists created_at timestamptz not null default now();
alter table public.company_settings add column if not exists updated_at timestamptz not null default now();

alter table public.company_settings enable row level security;

create or replace function public.current_company_id()
returns uuid
language sql
security definer
set search_path = public, extensions
stable
as $$
  select company_id
  from public.app_users
  where auth_user_id = auth.uid()
    and role = 'owner'
    and is_active = true
  limit 1
$$;

create or replace function public.verify_auditor_login(p_email text, p_password text)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.app_users;
  v_permissions jsonb;
begin
  select *
  into v_auditor
  from public.app_users
  where lower(email) = lower(p_email)
    and role = 'auditor'
    and is_active = true
    and password_hash = crypt(p_password, password_hash)
  limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Invalid email or password');
  end if;

  update public.app_users
  set last_login = now()
  where id = v_auditor.id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'permission_name', permission_name,
    'can_view', can_view,
    'can_create', can_create,
    'can_edit', can_edit,
    'can_delete', can_delete
  )), '[]'::jsonb)
  into v_permissions
  from public.auditor_permissions
  where auditor_id = v_auditor.id;

  return jsonb_build_object(
    'success', true,
    'auditor', jsonb_build_object(
      'id', v_auditor.id,
      'email', v_auditor.email,
      'full_name', v_auditor.full_name,
      'role', v_auditor.role,
      'company_id', v_auditor.company_id,
      'company_name', (select company_name from public.companies where id = v_auditor.company_id),
      'company_gstin', (select gstin from public.companies where id = v_auditor.company_id),
      'company_logo', (select company_logo from public.companies where id = v_auditor.company_id),
      'permissions', v_permissions
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

  insert into public.app_users (
    company_id,
    email,
    full_name,
    role,
    password_hash,
    created_by
  ) values (
    v_company_id,
    lower(p_email),
    p_full_name,
    'auditor',
    crypt(p_password, gen_salt('bf')),
    v_owner_id
  )
  returning id into v_auditor_id;

  foreach v_permission in array p_permissions loop
    insert into public.auditor_permissions (
      auditor_id,
      permission_name,
      can_view,
      can_create,
      can_edit,
      can_delete
    ) values (
      v_auditor_id,
      v_permission,
      true,
      true,
      true,
      false
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

  update public.app_users
  set
    full_name = p_full_name,
    email = lower(p_email),
    password_hash = case
      when nullif(p_password, '') is null then password_hash
      else crypt(p_password, gen_salt('bf'))
    end
  where id = p_auditor_id
    and company_id = v_company_id
    and role = 'auditor';

  delete from public.auditor_permissions
  where auditor_id = p_auditor_id;

  foreach v_permission in array p_permissions loop
    insert into public.auditor_permissions (
      auditor_id,
      permission_name,
      can_view,
      can_create,
      can_edit,
      can_delete
    ) values (
      p_auditor_id,
      v_permission,
      true,
      true,
      true,
      false
    );
  end loop;

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.verify_auditor_login(text, text) to anon, authenticated;
grant execute on function public.create_auditor(text, text, text, text[]) to authenticated;
grant execute on function public.update_auditor(uuid, text, text, text, text[]) to authenticated;

create or replace function public.refresh_auditor_session(p_auditor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.app_users;
  v_permissions jsonb;
begin
  select *
  into v_auditor
  from public.app_users
  where id = p_auditor_id
    and role = 'auditor'
    and is_active = true
  limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Auditor session is no longer active');
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'permission_name', permission_name,
    'can_view', can_view,
    'can_create', can_create,
    'can_edit', can_edit,
    'can_delete', can_delete
  )), '[]'::jsonb)
  into v_permissions
  from public.auditor_permissions
  where auditor_id = v_auditor.id;

  return jsonb_build_object(
    'success', true,
    'auditor', jsonb_build_object(
      'id', v_auditor.id,
      'email', v_auditor.email,
      'full_name', v_auditor.full_name,
      'role', v_auditor.role,
      'company_id', v_auditor.company_id,
      'company_name', (select company_name from public.companies where id = v_auditor.company_id),
      'company_gstin', (select gstin from public.companies where id = v_auditor.company_id),
      'company_logo', (select company_logo from public.companies where id = v_auditor.company_id),
      'permissions', v_permissions
    )
  );
end;
$$;

create or replace function public.auditor_data_request(
  p_auditor_id uuid,
  p_module text,
  p_resource text,
  p_action text,
  p_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.app_users;
  v_allowed boolean;
  v_data jsonb := 'null'::jsonb;
  v_record jsonb;
  v_values jsonb;
  v_match jsonb;
  v_id uuid;
  v_action_column text;
  v_log_action text;
  v_resource_name text;
begin
  select *
  into v_auditor
  from public.app_users
  where id = p_auditor_id
    and role = 'auditor'
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
    when 'log' then 'can_view'
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

  v_record := coalesce(p_payload->'record', '{}'::jsonb);
  v_values := coalesce(p_payload->'values', '{}'::jsonb);
  v_match := coalesce(p_payload->'match', '{}'::jsonb);
  v_log_action := coalesce(p_payload->>'logAction', p_action);
  v_resource_name := nullif(p_payload->>'auditName', '');

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
      coalesce(nullif(v_record->>'pan', ''), case when length(coalesce(v_record->>'gstin', '')) >= 12 then substring(v_record->>'gstin' from 3 for 10) else null end),
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
      name = coalesce(v_values->>'name', name),
      customer_type = coalesce(v_values->>'customer_type', customer_type),
      gstin = coalesce(v_values->>'gstin', gstin),
      pan = coalesce(v_values->>'pan', pan),
      contact_name = coalesce(v_values->>'contact_name', contact_name),
      email = coalesce(v_values->>'email', email),
      phone = coalesce(v_values->>'phone', phone),
      city = coalesce(v_values->>'city', city),
      address = coalesce(v_values->>'address', address)
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
      case when v_record ? 'stock' then nullif(v_record->>'stock', '')::numeric else null end
    )
    returning id into v_id;
    select to_jsonb(i) into v_data from public.items i where i.id = v_id;

  elsif p_action = 'update' and p_resource = 'items' then
    v_id := (v_match->>'id')::uuid;
    update public.items
    set
      name = coalesce(v_values->>'name', name),
      type = coalesce(v_values->>'type', type),
      description = case when v_values ? 'description' then nullif(v_values->>'description', '') else description end,
      hsn = case when v_values ? 'hsn' then nullif(v_values->>'hsn', '') else hsn end,
      unit = coalesce(v_values->>'unit', unit),
      selling_price = case when v_values ? 'selling_price' then (v_values->>'selling_price')::numeric else selling_price end,
      purchase_price = case when v_values ? 'purchase_price' then (v_values->>'purchase_price')::numeric else purchase_price end,
      gst_rate = case when v_values ? 'gst_rate' then (v_values->>'gst_rate')::numeric else gst_rate end,
      stock = case when v_values ? 'stock' and nullif(v_values->>'stock', '') is not null then (v_values->>'stock')::numeric else stock end
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
    select jsonb_build_object('id', i.id, 'invoice_number', i.invoice_number) into v_data
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
      status = coalesce(v_values->>'status', status),
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

  elsif p_action = 'log' then
    v_data := jsonb_build_object('logged', true);

  else
    return jsonb_build_object('success', false, 'error', 'Unsupported resource request');
  end if;

  insert into public.audit_logs (
    company_id, user_id, user_email, user_role, action, resource_type,
    resource_id, resource_name, details
  ) values (
    v_auditor.company_id,
    v_auditor.id,
    v_auditor.email,
    v_auditor.role,
    v_log_action,
    p_resource,
    v_id,
    v_resource_name,
    p_payload - 'record' - 'values'
  );

  return jsonb_build_object('success', true, 'data', v_data);
end;
$$;

grant execute on function public.refresh_auditor_session(uuid) to anon, authenticated;
grant execute on function public.auditor_data_request(uuid, text, text, text, jsonb) to anon, authenticated;

create or replace function public.get_auditor_profile(p_auditor_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.app_users;
  v_company public.companies;
begin
  select *
  into v_auditor
  from public.app_users
  where id = p_auditor_id
    and role = 'auditor'
    and is_active = true
  limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Auditor session is not active');
  end if;

  select *
  into v_company
  from public.companies
  where id = v_auditor.company_id
    and is_active = true
  limit 1;

  return jsonb_build_object(
    'success', true,
    'profile', jsonb_build_object(
      'id', v_auditor.id,
      'email', v_auditor.email,
      'full_name', v_auditor.full_name,
      'role', v_auditor.role
    ),
    'company', jsonb_build_object(
      'id', v_company.id,
      'company_name', v_company.company_name,
      'gstin', v_company.gstin,
      'pan', v_company.pan,
      'phone', v_company.phone,
      'address', v_company.address,
      'city', v_company.city,
      'state', v_company.state,
      'pin_code', v_company.pin_code,
      'company_logo', v_company.company_logo
    )
  );
end;
$$;

create or replace function public.update_auditor_profile(
  p_auditor_id uuid,
  p_full_name text,
  p_email text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_auditor public.app_users;
begin
  select *
  into v_auditor
  from public.app_users
  where id = p_auditor_id
    and role = 'auditor'
    and is_active = true
  limit 1;

  if v_auditor.id is null then
    return jsonb_build_object('success', false, 'error', 'Auditor session is not active');
  end if;

  update public.app_users
  set
    full_name = nullif(trim(p_full_name), ''),
    email = lower(trim(p_email))
  where id = v_auditor.id;

  insert into public.audit_logs (
    company_id, user_id, user_email, user_role, action, resource_type,
    resource_id, resource_name, details
  ) values (
    v_auditor.company_id,
    v_auditor.id,
    lower(trim(p_email)),
    v_auditor.role,
    'update_profile',
    'profile',
    v_auditor.id,
    nullif(trim(p_full_name), ''),
    jsonb_build_object('email', lower(trim(p_email)))
  );

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
  v_auditor public.app_users;
begin
  select *
  into v_auditor
  from public.app_users
  where id = p_auditor_id
    and role = 'auditor'
    and is_active = true
  limit 1;

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

  update public.app_users
  set password_hash = crypt(p_new_password, gen_salt('bf'))
  where id = v_auditor.id;

  insert into public.audit_logs (
    company_id, user_id, user_email, user_role, action, resource_type,
    resource_id, resource_name, details
  ) values (
    v_auditor.company_id,
    v_auditor.id,
    v_auditor.email,
    v_auditor.role,
    'update_password',
    'profile',
    v_auditor.id,
    v_auditor.full_name,
    '{}'::jsonb
  );

  return jsonb_build_object('success', true);
end;
$$;

grant execute on function public.get_auditor_profile(uuid) to anon, authenticated;
grant execute on function public.update_auditor_profile(uuid, text, text) to anon, authenticated;
grant execute on function public.update_auditor_password(uuid, text, text) to anon, authenticated;

-- Ensure the Invoice Defaults toggle column exists before (re)creating the
-- functions that read/write it, so re-running this file can never resurrect a
-- version that ignores the flag.
alter table public.company_settings
  add column if not exists invoice_defaults_enabled boolean not null default true;

-- Drop the legacy 8-arg signature so only the toggle-aware 9-arg version remains.
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
    select company_id
    into v_company_id
    from public.app_users
    where id = p_auditor_id
      and role = 'auditor'
      and is_active = true
    limit 1;
  end if;

  if v_company_id is null then
    return jsonb_build_object('success', false, 'error', 'Company settings profile not found');
  end if;

  insert into public.company_settings (company_id)
  values (v_company_id)
  on conflict (company_id) do nothing;

  select *
  into v_settings
  from public.company_settings
  where company_id = v_company_id
  limit 1;

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

grant execute on function public.get_company_settings(uuid) to anon, authenticated;
